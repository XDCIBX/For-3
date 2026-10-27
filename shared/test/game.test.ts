import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Player } from '../src/sim/game';
import { DT, PVP_EVERY } from '../src/constants';
import { generateWorld } from '../src/world';

function run(g: Game, seconds: number, until?: () => boolean) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    g.update(DT);
    g.snapshot();
    if (until?.()) return;
  }
}

function threePlayers(): [Game, Player, Player, Player] {
  const g = new Game(12345);
  const a = g.addPlayer('Аня') as Player;
  const b = g.addPlayer('Боря') as Player;
  const c = g.addPlayer('Вика') as Player;
  return [g, a, b, c];
}

test('мир генерируется детерминированно', () => {
  const w1 = generateWorld(42);
  const w2 = generateWorld(42);
  assert.deepEqual(w1, w2);
  assert.ok(w1.obstacles.filter((o) => o.kind === 'tree').length > 30);
  assert.equal(w1.spawns.length, 5);
});

test('каждому игроку достаётся свой класс, максимум 3 игрока', () => {
  const [g, a, b, c] = threePlayers();
  assert.deepEqual(new Set([a.cls, b.cls, c.cls]), new Set(['warrior', 'mage', 'archer']));
  assert.equal(typeof g.addPlayer('Лишний'), 'string');
  // Нельзя взять занятый класс
  g.handle(a.id, { t: 'pick', cls: b.cls });
  assert.notEqual(a.cls, b.cls);
  assert.ok(a.host && !b.host);
});

test('золото за убийство начисляется убийце', () => {
  const [g, a, b] = threePlayers();
  g.startGame();
  run(g, 3.2);
  assert.equal(g.phase, 'battle');
  const m = g.spawnMob('goblin', a.x + 1, a.z);
  m.spawnT = 0;
  const goldA = a.gold;
  const goldB = b.gold;
  g.damageMob(m, 9999, false, a.id);
  assert.ok(a.gold > goldA, 'убийца получил золото');
  assert.equal(b.gold, goldB, 'остальные — нет');
  assert.equal(a.kills, 1);
});

test('мобов становится больше с каждым раундом', () => {
  const g = new Game(7);
  g.addPlayer('Соло');
  g.addBot();
  g.addBot();
  g.startGame();
  run(g, 3.2);
  const r1 = g.mobsTotal;
  g.round = 3;
  g['startBattle']();
  const r3 = g.mobsTotal;
  assert.ok(r3 > r1, `${r3} > ${r1}`);
});

test('общий магазин: купленный предмет пропадает у всех', () => {
  const [g, a, b] = threePlayers();
  g.startGame();
  g.phase = 'clear';
  g.timer = 0.01;
  run(g, 0.1);
  assert.equal(g.phase, 'tavern');
  const it = g.shop.find((i) => !i.cls || i.cls === a.cls)!;
  a.gold = 10_000;
  const before = g.shop.length;
  g.handle(a.id, { t: 'buy', id: it.id });
  assert.equal(g.shop.length, before - 1);
  assert.equal(a.equip[it.slot]?.id, it.id);
  // Второй игрок уже не может купить этот предмет
  b.gold = 10_000;
  g.handle(b.id, { t: 'buy', id: it.id });
  assert.notEqual(b.equip[it.slot]?.id, it.id);
  const snap = g.snapshot();
  assert.ok(!snap.shop || !snap.shop.some((i) => i.id === it.id));
});

test('чужое оружие купить нельзя, без денег — тоже', () => {
  const [g, a] = threePlayers();
  g.startGame();
  g.phase = 'clear';
  g.timer = 0.01;
  run(g, 0.1);
  const foreign = g.shop.find((i) => i.cls && i.cls !== a.cls)!;
  a.gold = 10_000;
  g.handle(a.id, { t: 'buy', id: foreign.id });
  assert.ok(g.shop.some((i) => i.id === foreign.id));
  a.gold = 0;
  const own = g.shop.find((i) => !i.cls)!;
  g.handle(a.id, { t: 'buy', id: own.id });
  assert.ok(g.shop.some((i) => i.id === own.id));
});

test('каждый 5-й раунд — ПвП дуэли между всеми; победа даёт золото, поражение отнимает', () => {
  const [g, a, b, c] = threePlayers();
  g.startGame();
  g.round = PVP_EVERY;
  g.beginRound();
  for (const p of [a, b, c]) p.gold = 200;
  run(g, 3.2);
  assert.equal(g.phase, 'duel_intro');
  assert.equal(g.duels.length, 3);
  const pairs = g.duels.map((d) => d.slice().sort().join('-')).sort();
  assert.deepEqual(pairs, [`${a.id}-${b.id}`, `${a.id}-${c.id}`, `${b.id}-${c.id}`].sort());
  run(g, 3.2);
  assert.equal(g.phase, 'duel');
  const [x, y] = g.duels[0].map((id) => g.players.get(id)!);
  const { win, lose } = g.pvpReward();
  g.damagePlayer(y, 99999, false, x.id);
  assert.equal(g.phase, 'duel_end');
  assert.equal(x.gold, 200 + win);
  assert.equal(y.gold, 200 - lose);
});

test('боты проходят первый раунд сами', () => {
  const g = new Game(99);
  g.addBot();
  g.addBot();
  g.addBot();
  g.startGame();
  run(g, 240, () => g.phase === 'tavern' || g.phase === 'gameover');
  assert.equal(g.phase, 'tavern');
  const total = [...g.players.values()].reduce((s, p) => s + p.kills, 0);
  assert.equal(total, g.mobsTotal);
});

test('полная симуляция с ботами до ПвП раунда не падает', () => {
  const g = new Game(2024);
  g.addBot();
  g.addBot();
  g.addBot();
  g.startGame();
  let sawDuel = false;
  run(g, 1500, () => {
    if (g.phase === 'duel') sawDuel = true;
    return g.round > PVP_EVERY || g.phase === 'gameover';
  });
  assert.ok(sawDuel || g.phase === 'gameover', `phase=${g.phase} round=${g.round}`);
});
