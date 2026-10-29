import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Player } from '../src/sim/game';
import { DT, MAX_ROUNDS, PVP_EVERY, isPvpRound } from '../src/constants';
import { Rng } from '../src/rng';
import { mobScale, roundComposition } from '../src/data/mobs';
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

test('охотник бьёт двумя клинками, призыватель призывает помощников, которые атакуют мобов', () => {
  const [g, a, b] = threePlayers();
  g.handle(a.id, { t: 'pick', cls: 'hunter' });
  g.handle(b.id, { t: 'pick', cls: 'summoner' });
  assert.equal(a.cls, 'hunter');
  assert.equal(b.cls, 'summoner');
  g.startGame();
  run(g, 3.2);
  assert.equal(g.phase, 'battle');
  for (const m of g.mobs.values()) m.hp = 0;
  g.mobs.clear();
  // Двойной удар: два попадания по одному мобу
  const m = g.spawnMob('orc', a.x + 1.2, a.z);
  m.spawnT = 0;
  a.rot = Math.atan2(m.x - a.x, m.z - a.z);
  g.castSkill(a, 0, (m.x - a.x) / 1.2, 0, 1.2);
  const hits = g.snapshot().E.filter((e) => e.e === 'dmg' && e.tp === 'm' && e.id === m.id);
  assert.equal(hits.length, 2);
  // Волки появляются и наносят урон мобу
  g.castSkill(b, 1, 1, 0, 0);
  const wolves = [...g.minions.values()].filter((n) => n.owner === b.id && n.kind === 'wolf');
  assert.equal(wolves.length, 2);
  const target = g.spawnMob('troll', b.x + 3, b.z);
  target.spawnT = 0;
  target.dmg = 0;
  const hp0 = target.hp;
  run(g, 3);
  assert.ok(target.hp < hp0, 'помощники атакуют мобов');
  assert.ok(g.snapshot().S.length >= 2);
});

test('тролль-вождь бросает молот: тот ранит героя и возвращается к боссу', () => {
  const g = new Game(5);
  const p = g.addPlayer('Аня') as Player;
  g.startGame();
  run(g, 3.2);
  for (const m of [...g.mobs.values()]) g.mobs.delete(m.id);
  const boss = g.spawnMob('troll', p.x + 10, p.z);
  boss.spawnT = 0;
  boss.throwCd = 0;
  boss.slamCd = 99;
  p.stats.maxHp = p.hp = 99999;
  const kinds: string[] = [];
  let hits = 0;
  for (let i = 0; i < Math.round(4 / DT); i++) {
    g.update(DT);
    for (const e of g.snapshot().E) {
      if (e.e === 'fx' && e.k.startsWith('h')) kinds.push(e.k);
      if (e.e === 'dmg' && e.tp === 'p') hits++;
    }
  }
  assert.deepEqual(kinds, ['hwind', 'hthrow', 'hturn', 'hcatch']);
  assert.equal(hits, 1, 'один удар за бросок');
  assert.equal(boss.hammer, 0);
  assert.ok(boss.throwCd >= 5, 'после поимки — перезарядка');
});

test('тотем призывателя каждые полсекунды ранит врагов в круге; золото с мобов: 75% × 1,25 × 1,35', () => {
  const [g, a] = threePlayers();
  g.handle(a.id, { t: 'pick', cls: 'summoner' });
  g.startGame();
  run(g, 3.2);
  for (const m of [...g.mobs.values()]) g.mobs.delete(m.id);
  const mob = g.spawnMob('troll', a.x + 4, a.z);
  mob.spawnT = 0;
  mob.dmg = 0;
  mob.throwCd = mob.slamCd = 99;
  assert.ok(Math.abs(mob.gold - 120 * 0.75 * 1.25 * 1.35) < 0.01, 'добыча босса — 75% × 1,25 × 1,35');
  g.castSkill(a, 3, 1, 0, 4);
  let pulses = 0;
  for (let i = 0; i < Math.round(2.6 / DT); i++) {
    g.update(DT);
    for (const e of g.snapshot().E) if (e.e === 'fx' && e.k === 'tpulse') pulses++;
  }
  assert.ok(pulses >= 4 && pulses <= 6, `волн: ${pulses}`);
  assert.ok(mob.hp < mob.maxHp);
});

test('оборотень прыгает и бьёт при приземлении; гном ставит турель; хозяин меняет класс бота', () => {
  const g = new Game(21);
  const a = g.addPlayer('Аня') as Player;
  const bot = g.addBot() as Player;
  // Хозяин выбирает боту класс, занятый класс взять нельзя
  g.handle(a.id, { t: 'botcls', id: bot.id, cls: 'dwarf' });
  assert.equal(bot.cls, 'dwarf');
  g.handle(a.id, { t: 'botcls', id: bot.id, cls: a.cls });
  assert.equal(bot.cls, 'dwarf');
  g.handle(a.id, { t: 'pick', cls: 'werewolf' });
  assert.equal(a.cls, 'werewolf');
  g.startGame();
  run(g, 3.2);
  for (const m of [...g.mobs.values()]) g.mobs.delete(m.id);
  const m = g.spawnMob('orc', a.x + 6, a.z);
  m.spawnT = 0;
  m.dmg = 0;
  const hp0 = m.hp;
  g.castSkill(a, 1, 1, 0, 6);
  const fx: string[] = [];
  for (let i = 0; i < 12; i++) {
    g.update(DT);
    for (const e of g.snapshot().E) if (e.e === 'fx') fx.push(e.k);
  }
  assert.ok(fx.includes('pounce') && fx.includes('pland'), fx.join());
  assert.ok(m.hp < hp0, 'приземление ранит');
  assert.ok(Math.hypot(a.x - m.x, a.z - m.z) < 3, 'оборотень долетел до цели');
  // Турель гнома
  bot.alive = true;
  g.castSkill(bot, 2, 1, 0, 3);
  assert.ok([...g.minions.values()].some((n) => n.owner === bot.id && n.kind === 'turret'));
});

test('турель гнома не появляется внутри врага в дуэли, и враг может её разбить', () => {
  const g = new Game(3);
  const d = g.addPlayer('Гном') as Player;
  const m = g.addPlayer('Маг') as Player;
  g.handle(d.id, { t: 'pick', cls: 'dwarf' });
  g.handle(m.id, { t: 'pick', cls: 'mage' });
  g.startRound = 5;
  g.startGame();
  run(g, 20, () => g.phase === 'duel');
  assert.equal(g.phase, 'duel');
  m.x = d.x + 4;
  m.z = d.z;
  d.cds[2] = 0;
  g.castSkill(d, 2, 1, 0, 4);
  const tur = [...g.minions.values()].find((n) => n.kind === 'turret')!;
  assert.ok(Math.hypot(tur.x - m.x, tur.z - m.z) > 1.4, 'турель не внутри мага');
  const hp0 = tur.hp;
  m.cds[0] = 0;
  g.castSkill(m, 0, tur.x - m.x, tur.z - m.z, 2);
  run(g, 0.6);
  assert.ok(tur.hp < hp0, 'выстрел мага попадает в турель');
});

test('25 волн: ПвП на 5/10/15/20 и 24-й, с 21-й — логово дракона, на 25-й — дракон', () => {
  for (const r of [5, 10, 15, 20, 24]) assert.ok(isPvpRound(r), `ПвП на ${r}`);
  for (const r of [19, 21, 22, 23, 25]) assert.ok(!isPvpRound(r), `не ПвП на ${r}`);
  assert.equal(MAX_ROUNDS, 25);
  const rng = new Rng(1);
  for (const r of [21, 22, 23]) {
    const list = roundComposition(r, 3, rng);
    assert.ok(list.length > 60);
    assert.ok(list.every((k) => k === 'ember' || k === 'drake' || k === 'spitter'), 'в логове — только его обитатели, без боссов');
  }
  assert.deepEqual(roundComposition(25, 3, rng), ['dragon']);
  // Мобы логова сильнее с каждой волной
  assert.ok(mobScale(22).hp > mobScale(21).hp && mobScale(23).hp > mobScale(22).hp && mobScale(21).hp > mobScale(19).hp * 1.3);

  const g = new Game(77);
  const p = g.addPlayer('Аня') as Player;
  g.startRound = 21;
  g.startGame();
  assert.equal(g.world.kind, 'lair');
  assert.ok(g.world.obstacles.some((o) => o.kind === 'lava') && g.world.obstacles.some((o) => o.kind === 'stalagmite'));
  run(g, 3.5);
  assert.equal(g.phase, 'battle');
  run(g, 4);
  assert.ok([...g.mobs.values()].every((m) => ['ember', 'drake', 'spitter'].includes(m.kind)));
  void p;
});

test('огненный сгусток взрывается рядом с героем и оставляет горящую землю', () => {
  const g = new Game(8);
  const p = g.addPlayer('Аня') as Player;
  g.startRound = 21;
  g.startGame();
  run(g, 3.2);
  for (const m of [...g.mobs.values()]) g.mobs.delete(m.id);
  g.spawnQueue = [];
  p.stats.maxHp = p.hp = 99999;
  const e = g.spawnMob('ember', p.x + 3, p.z);
  e.spawnT = 0;
  run(g, 3, () => !g.mobs.has(e.id));
  assert.ok(!g.mobs.has(e.id), 'сгусток взорвался');
  assert.ok(p.hp < 99999, 'герой получил урон');
  assert.ok([...g.zones.values()].some((z) => z.kind === 'dfire'));
});

test('дракон: укус, конус дыхания, удар по кругу, огненные шары с горящим следом; победа над ним завершает игру', () => {
  const g = new Game(9);
  const p = g.addPlayer('Аня') as Player;
  g.startRound = 25;
  g.startGame();
  run(g, 3.2);
  assert.equal(g.phase, 'battle');
  const d = [...g.mobs.values()].find((m) => m.kind === 'dragon')!;
  assert.ok(d, 'дракон проснулся в гнезде');
  p.stats.maxHp = p.hp = 1e7;
  d.spawnT = 0;
  const seen = new Set<string>();
  const zones = new Set<string>();
  // Огненные шары издалека
  d.dcd = { breath: 99, lob: 0, sweep: 99, roar: 99 };
  for (let i = 0; i < Math.round(3 / DT); i++) {
    g.update(DT);
    for (const z of g.zones.values()) zones.add(z.kind);
    for (const ev of g.snapshot().E) if (ev.e === 'fx') seen.add(ev.k);
  }
  assert.ok(seen.has('dlob') && zones.has('dball') && zones.has('dfire'), 'шар падает и оставляет след');
  // Дыхание конусом и удар по кругу вблизи
  p.x = d.x;
  p.z = d.z + d.radius + 3;
  d.dcd = { breath: 0, lob: 99, sweep: 99, roar: 99 };
  d.skill = null;
  let breathHits = 0;
  for (let i = 0; i < Math.round(3 / DT); i++) {
    g.update(DT);
    for (const z of g.zones.values()) zones.add(z.kind);
    for (const ev of g.snapshot().E) if (ev.e === 'dmg' && ev.tp === 'p') breathHits++;
  }
  assert.ok(zones.has('breath') && breathHits >= 4, 'дыхание жжёт несколько раз');
  p.x = d.x;
  p.z = d.z + d.radius + 2;
  d.dcd = { breath: 99, lob: 99, sweep: 0, roar: 99 };
  d.skill = null;
  d.windup = -1;
  let slam = false;
  for (let i = 0; i < Math.round(1.5 / DT); i++) {
    g.update(DT);
    g.snapshot();
    if ([...g.zones.values()].some((z) => z.kind === 'slam')) slam = true;
  }
  assert.ok(slam, 'удар хвостом и крыльями по кругу');
  // Победа
  g.damageMob(d, 1e9, false, p.id);
  run(g, 10, () => g.phase === 'gameover');
  assert.equal(g.phase, 'gameover');
  assert.equal(g.result?.win, true);
});
