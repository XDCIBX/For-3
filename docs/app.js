(() => {
  "use strict";

  const LEVELS = ["0+", "18+", "21+"];
  const MIN_AGE = { "0+": 0, "18+": 18, "21+": 21 };
  const KIND_LABEL = { truth: "Правда", dare: "Действие" };
  const STORAGE_KEY = "tod.v1";
  const PENALTIES = {
    soft: ["10 приседаний", "15 секунд планки", "спой куплет любой песни", "изобрази курицу", "комплимент каждому игроку"],
    spicy: ["снять один аксессуар", "поцелуй в щёку соседу", "соблазнительный танец 10 секунд", "комплимент на ухо соседу"],
    hot: ["глоток напитка 🍹", "снять один аксессуар", "поцелуй в щёку соседу", "глоток напитка 🍹", "танец 10 секунд"]
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    ageGate: $("ageGate"), setup: $("setup"), game: $("game"),
    addPlayer: $("addPlayer"), playerName: $("playerName"), playerList: $("playerList"), playersHint: $("playersHint"),
    levels: $("levels"), levelHint: $("levelHint"), startBtn: $("startBtn"),
    backBtn: $("backBtn"), scoreBtn: $("scoreBtn"), turnName: $("turnName"),
    card: $("card"), cardType: $("cardType"), cardLevel: $("cardLevel"), cardText: $("cardText"), cardFoot: $("cardFoot"),
    choice: $("choice"), result: $("result"), doneBtn: $("doneBtn"), skipBtn: $("skipBtn"), counter: $("counter"),
    scoreModal: $("scoreModal"), scores: $("scores"), closeScore: $("closeScore"), toast: $("toast")
  };

  const state = {
    age: null,
    players: [],
    levels: new Set(LEVELS),
    scores: new Map(),
    turn: 0,
    decks: { truth: [], dare: [] },
    current: null
  };

  // ---------- Хранилище ----------
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (typeof saved.age === "number") state.age = saved.age;
      if (Array.isArray(saved.players)) state.players = saved.players.filter((p) => typeof p === "string").slice(0, 20);
      if (Array.isArray(saved.levels)) state.levels = new Set(saved.levels.filter((l) => LEVELS.includes(l)));
    } catch (e) { /* хранилище недоступно — играем без сохранения */ }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ age: state.age, players: state.players, levels: [...state.levels] }));
    } catch (e) { /* ничего страшного */ }
  }

  // ---------- Утилиты ----------
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2600);
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- Возраст ----------
  function allowedLevel(level) {
    return state.age !== null && state.age >= MIN_AGE[level];
  }
  function applyAge() {
    for (const l of LEVELS) if (!allowedLevel(l)) state.levels.delete(l);
    if (state.levels.size === 0) state.levels.add("0+");
  }

  el.ageGate.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-age]");
    if (!btn) return;
    state.age = Number(btn.dataset.age);
    if (state.age >= 18) LEVELS.filter(allowedLevel).forEach((l) => state.levels.add(l));
    applyAge();
    save();
    el.ageGate.hidden = true;
    renderSetup();
  });

  // ---------- Настройки ----------
  function renderSetup() {
    el.playerList.replaceChildren(...state.players.map((name, i) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = name;
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "×";
      del.setAttribute("aria-label", "Удалить " + name);
      del.addEventListener("click", () => {
        state.players.splice(i, 1);
        save();
        renderSetup();
      });
      li.append(span, del);
      return li;
    }));
    el.playersHint.hidden = state.players.length >= 2;

    for (const btn of el.levels.querySelectorAll(".level")) {
      const level = btn.dataset.level;
      btn.disabled = !allowedLevel(level);
      btn.setAttribute("aria-pressed", String(state.levels.has(level)));
    }

    const counts = countCards();
    el.levelHint.textContent = state.levels.size
      ? `В колоде: ${counts.truth} ${plural(counts.truth, "правда", "правды", "правд")} и ${counts.dare} ${plural(counts.dare, "действие", "действия", "действий")}`
      : "Выбери хотя бы один уровень";
    if (state.age !== null && state.age < 18) el.levelHint.textContent += " · уровни 18+ и 21+ скрыты";
    else if (state.age !== null && state.age < 21) el.levelHint.textContent += " · уровень 21+ скрыт";
    el.startBtn.disabled = state.levels.size === 0;
  }

  function countCards() {
    const res = { truth: 0, dare: 0 };
    for (const kind of Object.keys(res)) for (const l of state.levels) res[kind] += window.TOD_DATA[kind][l].length;
    return res;
  }

  el.addPlayer.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.playerName.value.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (state.players.some((p) => p.toLowerCase() === name.toLowerCase())) {
      toast("Такой игрок уже есть");
      return;
    }
    if (state.players.length >= 20) {
      toast("Максимум 20 игроков");
      return;
    }
    state.players.push(name);
    el.playerName.value = "";
    save();
    renderSetup();
    el.playerName.focus();
  });

  el.levels.addEventListener("click", (e) => {
    const btn = e.target.closest(".level");
    if (!btn || btn.disabled) return;
    const level = btn.dataset.level;
    if (state.levels.has(level)) state.levels.delete(level);
    else state.levels.add(level);
    save();
    renderSetup();
  });

  el.startBtn.addEventListener("click", startGame);

  // ---------- Игра ----------
  function buildDeck(kind) {
    const deck = [];
    for (const level of state.levels) for (const text of window.TOD_DATA[kind][level]) deck.push({ kind, level, text });
    return shuffle(deck);
  }

  function startGame() {
    if (state.levels.size === 0) return;
    state.decks.truth = buildDeck("truth");
    state.decks.dare = buildDeck("dare");
    state.scores = new Map(state.players.map((p) => [p, { done: 0, skipped: 0 }]));
    state.turn = 0;
    state.current = null;
    el.setup.hidden = true;
    el.game.hidden = false;
    el.scoreBtn.hidden = state.players.length === 0;
    resetCard();
    renderTurn();
    window.scrollTo(0, 0);
  }

  function currentPlayer() {
    return state.players.length ? state.players[state.turn % state.players.length] : null;
  }

  function renderTurn() {
    const player = currentPlayer();
    el.turnName.textContent = player || "Ваш ход";
    el.turnName.classList.remove("pop");
    void el.turnName.offsetWidth;
    el.turnName.classList.add("pop");
    renderCounter();
  }

  function renderCounter() {
    const t = state.decks.truth.length, d = state.decks.dare.length;
    el.counter.textContent = `Осталось: ${t} ${plural(t, "правда", "правды", "правд")} · ${d} ${plural(d, "действие", "действия", "действий")}`;
  }

  function resetCard() {
    el.card.classList.remove("flipped");
    el.choice.hidden = false;
    el.result.hidden = true;
  }

  function draw(kind) {
    if (kind === "random") kind = Math.random() < 0.5 ? "truth" : "dare";
    if (state.decks[kind].length === 0) {
      state.decks[kind] = buildDeck(kind);
      toast(`${KIND_LABEL[kind]}: колода закончилась и перемешана заново`);
    }
    const card = state.decks[kind].pop();
    state.current = card;

    el.card.classList.remove("truth", "dare");
    el.card.classList.add(kind);
    el.card.dataset.kind = kind;
    el.cardType.textContent = KIND_LABEL[kind];
    el.cardLevel.textContent = card.level;
    el.cardLevel.dataset.level = card.level;
    el.cardText.textContent = card.text;
    const player = currentPlayer();
    el.cardFoot.textContent = player ? `Для игрока: ${player}` : "";

    el.card.classList.add("flipped");
    el.choice.hidden = true;
    el.result.hidden = false;
    renderCounter();
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { /* не поддерживается */ }
  }

  function finishTurn(done) {
    const player = currentPlayer();
    if (player && state.scores.has(player)) {
      const s = state.scores.get(player);
      if (done) s.done++;
      else s.skipped++;
    }
    if (!done) {
      const list = state.levels.has("21+") ? PENALTIES.hot : state.levels.has("18+") ? PENALTIES.spicy : PENALTIES.soft;
      toast("Штраф: " + pick(list));
    }
    state.current = null;
    state.turn++;
    resetCard();
    renderTurn();
  }

  el.choice.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-kind]");
    if (btn) draw(btn.dataset.kind);
  });
  el.doneBtn.addEventListener("click", () => finishTurn(true));
  el.skipBtn.addEventListener("click", () => finishTurn(false));

  el.backBtn.addEventListener("click", () => {
    el.game.hidden = true;
    el.setup.hidden = false;
    renderSetup();
  });

  // ---------- Счёт ----------
  el.scoreBtn.addEventListener("click", () => {
    const rows = [...state.scores.entries()].sort((a, b) => b[1].done - a[1].done || a[1].skipped - b[1].skipped);
    el.scores.replaceChildren(...rows.map(([name, s], i) => {
      const li = document.createElement("li");
      const left = document.createElement("span");
      left.textContent = `${i === 0 && s.done > 0 ? "👑 " : ""}${name}`;
      const right = document.createElement("span");
      right.innerHTML = `<b>${s.done}</b> <small>· пропусков ${s.skipped}</small>`;
      li.append(left, right);
      return li;
    }));
    el.scoreModal.hidden = false;
  });
  el.closeScore.addEventListener("click", () => { el.scoreModal.hidden = true; });
  el.scoreModal.addEventListener("click", (e) => { if (e.target === el.scoreModal) el.scoreModal.hidden = true; });

  // ---------- Старт ----------
  load();
  if (state.age === null) el.ageGate.hidden = false;
  else applyAge();
  renderSetup();
})();
