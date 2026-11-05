/** Процедурные звуки и музыка на WebAudio — никаких файлов, всё синтезируется. */
export type MusicKind = 'none' | 'calm' | 'battle' | 'tavern' | 'lair' | 'dragon';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  musicOn = true;
  private musicKind: MusicKind = 'none';
  private dry: AudioNode | null = null;
  private wet: AudioNode | null = null;
  private step = 0;
  private nextTime = 0;
  private last: Record<string, number> = {};

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? 0.22 : 0;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    window.setInterval(() => this.tickMusic(), 50);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.55 : 0;
  }
  setMusic(v: boolean) {
    this.musicOn = v;
    if (this.musicGain) this.musicGain.gain.value = v ? 0.22 : 0;
  }

  private throttle(key: string, ms: number) {
    const now = performance.now();
    if ((this.last[key] ?? 0) + ms > now) return true;
    this.last[key] = now;
    return false;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slide = 0, delay = 0, dest?: AudioNode) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol = 0.3, filter = 1200, q = 1, type: BiquadFilterType = 'bandpass', delay = 0, sweep = 0) {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(filter * sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  click() {
    this.tone(660, 0.07, 'triangle', 0.2);
  }
  swing() {
    if (this.throttle('swing', 60)) return;
    this.noise(0.18, 0.35, 900, 0.8, 'bandpass', 0, 3);
  }
  bow() {
    if (this.throttle('bow', 50)) return;
    this.tone(220, 0.12, 'triangle', 0.15, 2.2);
    this.noise(0.1, 0.18, 3000, 2, 'highpass');
  }
  magic() {
    if (this.throttle('magic', 50)) return;
    this.tone(880, 0.18, 'sine', 0.15, 1.8);
    this.tone(1320, 0.14, 'triangle', 0.08, 1.5, 0.03);
  }
  fireball() {
    this.noise(0.4, 0.3, 500, 1, 'lowpass', 0, 3);
    this.tone(180, 0.3, 'sawtooth', 0.08, 2);
  }
  explosion(big = false) {
    if (this.throttle('boom', 80)) return;
    this.noise(big ? 1.0 : 0.6, big ? 0.7 : 0.5, 400, 0.7, 'lowpass', 0, 0.2);
    this.tone(big ? 70 : 110, big ? 0.7 : 0.4, 'sine', 0.5, 0.4);
  }
  freeze() {
    for (let i = 0; i < 5; i++) this.tone(1800 + i * 300, 0.25, 'sine', 0.06, 0.9, i * 0.03);
    this.noise(0.4, 0.2, 5000, 1, 'highpass');
  }
  shout() {
    this.tone(140, 0.5, 'sawtooth', 0.18, 0.8);
    this.tone(210, 0.5, 'sawtooth', 0.12, 0.8);
    this.noise(0.4, 0.15, 700, 1);
  }
  dash() {
    this.noise(0.25, 0.3, 600, 1, 'bandpass', 0, 4);
  }
  hit() {
    if (this.throttle('hit', 45)) return;
    this.noise(0.08, 0.35, 1600, 1.2);
    this.tone(160 + Math.random() * 60, 0.08, 'square', 0.08, 0.5);
  }
  crit() {
    if (this.throttle('crit', 60)) return;
    this.noise(0.12, 0.45, 2500, 1);
    this.tone(900, 0.12, 'square', 0.1, 0.5);
  }
  hurt() {
    if (this.throttle('hurt', 120)) return;
    this.tone(300, 0.18, 'sawtooth', 0.15, 0.5);
    this.noise(0.12, 0.25, 800);
  }
  coin() {
    if (this.throttle('coin', 70)) return;
    this.tone(1320, 0.08, 'square', 0.07);
    this.tone(1760, 0.15, 'square', 0.07, 1, 0.07);
  }
  buy() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.15, 1, i * 0.06));
    this.coin();
  }
  mobDie() {
    if (this.throttle('mdie', 60)) return;
    this.tone(400, 0.25, 'triangle', 0.15, 0.3);
    this.noise(0.2, 0.15, 900);
  }
  slam() {
    this.noise(0.8, 0.7, 250, 0.6, 'lowpass');
    this.tone(55, 0.6, 'sine', 0.6, 0.5);
  }
  death() {
    [523, 440, 349, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, 1, i * 0.15));
  }
  respawn() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.15, 1, i * 0.08));
  }
  fanfare() {
    const notes = [523, 523, 523, 698, 880, 784, 880, 1047];
    const times = [0, 0.12, 0.24, 0.36, 0.6, 0.78, 0.9, 1.05];
    notes.forEach((f, i) => {
      this.tone(f, 0.35, 'square', 0.08, 1, times[i]);
      this.tone(f / 2, 0.35, 'triangle', 0.1, 1, times[i]);
    });
  }
  victory() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.18, 1, i * 0.13));
  }
  defeat() {
    [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.1, 1, i * 0.3));
  }
  bell() {
    this.tone(1046, 1.2, 'sine', 0.2);
    this.tone(2093, 0.8, 'sine', 0.06);
  }

  music(kind: MusicKind) {
    if (this.musicKind === kind) return;
    this.musicKind = kind;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.15;
  }

  /** Шина музыки: мягкий компрессор и общая реверберация — инструменты звучат в «зале», а не в лоб. */
  private bus() {
    const c = this.ctx!;
    if (this.dry) return;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;
    // Компенсация громкости после компрессора: музыка слышна под звуками боя, но не перекрывает их
    const makeup = c.createGain();
    makeup.gain.value = 2.3;
    comp.connect(makeup).connect(this.musicGain!);
    // Тёплый верх: срезаем резкие частоты всей музыки
    const warm = c.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 6500;
    warm.connect(comp);
    this.dry = warm;
    // Импульс реверберации — затухающий шум 2,8 с
    const len = Math.floor(c.sampleRate * 2.8);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.5;
    conv.connect(wet).connect(comp);
    this.wet = conv;
  }

  /** Огибающая громкости: атака, спад до уровня sustain, отпускание. */
  private env(g: GainNode, t: number, dur: number, vol: number, a: number, rel: number, sus = 1) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    if (sus < 1) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * sus), t + a + Math.min(dur, 0.25));
    g.gain.setValueAtTime(Math.max(0.0001, vol * sus), t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
  }

  /** Подключить голос к шине: сухой сигнал и посыл в реверберацию. */
  private out(node: AudioNode, send: number) {
    node.connect(this.dry!);
    if (send > 0) {
      const g = this.ctx!.createGain();
      g.gain.value = send;
      node.connect(g).connect(this.wet!);
    }
  }

  /** Пэд: пара расстроенных пил через мягкий фильтр, медленная атака. */
  private pad(freqs: number[], delay: number, dur: number, vol: number, cutoff = 1400, a = 0.5) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 0.6, t);
    f.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.6);
    f.Q.value = 0.6;
    const g = c.createGain();
    this.env(g, t, dur, vol, a, 1.4);
    for (const fr of freqs)
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1.6);
      }
    f.connect(g);
    this.out(g, 0.55);
  }

  /** Щипок (лютня/арфа): треугольник с обертоном и быстрым затуханием. */
  private pluck(freq: number, delay: number, vol: number, decay = 0.6, bright = 2600, send = 0.35) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(bright, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, bright * 0.25), t + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    for (const [mul, type, v] of [[1, 'triangle', 1], [2, 'sine', 0.35]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
    f.connect(g);
    this.out(g, send);
  }

  /** Колокольчик: синус с негармоничным обертоном, длинный хвост. */
  private chime(freq: number, delay: number, vol: number, decay = 2.2) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    for (const [mul, v] of [[1, 1], [2.76, 0.22], [5.4, 0.06]]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
    this.out(g, 0.6);
  }

  /** Мелодический голос (флейта/скрипка): треугольник с вибрато и мягкой атакой. */
  private lead(freq: number, delay: number, dur: number, vol: number, type: OscillatorType = 'triangle', send = 0.45) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(freq * 0.006, t + dur * 0.6);
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = type === 'triangle' ? 3200 : 1800;
    const g = c.createGain();
    this.env(g, t, dur, vol, 0.06, 0.35, 0.8);
    o.connect(f).connect(g);
    this.out(g, send);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.5);
    lfo.stop(t + dur + 0.5);
  }

  /** Бас: синус с треугольной подкладкой. */
  private bass(freq: number, delay: number, dur: number, vol: number) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const g = c.createGain();
    this.env(g, t, dur * 0.85, vol, 0.015, 0.12, 0.7);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    for (const [type, v] of [['sine', 1], ['triangle', 0.4]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + 0.2);
    }
    f.connect(g);
    this.out(g, 0.08);
  }

  /** Ударные: бочка, тайко (томы), щётка/тарелка, «малый» на шуме. */
  private drum(kind: 'kick' | 'taiko' | 'hat' | 'snare' | 'riser', delay: number, vol: number, len = 1) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    if (kind === 'kick' || kind === 'taiko') {
      const o = c.createOscillator();
      const g = c.createGain();
      const [f0, f1, d] = kind === 'kick' ? [120, 42, 0.32] : [150, 70, 0.55];
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g);
      this.out(g, kind === 'taiko' ? 0.5 : 0.1);
      o.start(t);
      o.stop(t + d + 0.05);
      if (kind === 'taiko') this.noiseMusic(t, 0.12, vol * 0.5, 900, 'bandpass', 0.4);
      return;
    }
    if (kind === 'hat') return this.noiseMusic(t, 0.05, vol, 7000, 'highpass', 0.1);
    if (kind === 'snare') return this.noiseMusic(t, 0.18, vol, 1800, 'bandpass', 0.35);
    // Нарастающий шумовой «взлёт» к концу фразы
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf!;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
    s.connect(f).connect(g);
    this.out(g, 0.5);
    s.start(t);
    s.stop(t + len + 0.1);
  }

  private noiseMusic(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType, send: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf!;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g);
    this.out(g, send);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  private tickMusic() {
    const c = this.ctx;
    if (!c || this.musicKind === 'none' || !this.musicGain || c.state !== 'running') return;
    this.bus();
    const bpm = { calm: 70, battle: 108, tavern: 96, lair: 92, dragon: 116 }[this.musicKind];
    const stepDur = 60 / bpm / 2;
    // Если вкладка спала — не пытаемся догнать пропущенные ноты разом
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.25) {
      this.playStep(this.step, Math.max(0, this.nextTime - c.currentTime), stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  /**
   * Музыка по шагам (восьмые доли, 8 шагов в такте). Все темы — в миноре: красиво, но не весело.
   * Остров — светлая печаль ля-минора, бой — решительный ре-минор, таверна — неспешная дорийская лютня,
   * логово — фригийское остинато ми с тайко и нарастанием, дракон — то же быстрее, с медью и хором.
   */
  private playStep(i: number, delay: number, d: number) {
    const s = i % 8;
    const bar = Math.floor(i / 8);
    const k = this.musicKind;
    const N = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI-нота → частота
    if (k === 'calm') {
      // Am – F – C – Em: мягкий пэд, арфа и редкие колокольчики
      const prog = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [52, 55, 59]];
      const ch = prog[bar % 4];
      if (s === 0) {
        this.pad(ch.map(N), delay, d * 8, 0.045, 1100, 0.9);
        this.bass(N(ch[0] - 12), delay, d * 6, 0.16);
      }
      const arp = [0, 1, 2, 1, 2, 1, 0, 2];
      if (s % 2 === 0 || bar % 2 === 1) this.pluck(N(ch[arp[s]] + 12), delay, 0.06, 1.1, 2000, 0.5);
      const mel = [76, 0, 74, 72, 71, 0, 72, 0, 69, 0, 0, 72, 71, 0, 67, 0];
      const m = mel[(bar % 2) * 8 + s];
      if (bar % 4 >= 2 && m) this.chime(N(m), delay, 0.05);
    } else if (k === 'battle') {
      // Dm – B♭ – F – C: пульс баса, ровные барабаны, мотив флейты каждые 2 такта из 4
      const prog = [[62, 65, 69], [58, 62, 65], [53, 57, 60], [48, 52, 55]];
      const ch = prog[bar % 4];
      if (s === 0) this.pad(ch.map(N), delay, d * 8, 0.032, 1600, 0.25);
      this.bass(N(ch[0] - 24 + (s === 3 || s === 7 ? 12 : 0)), delay, d, s % 2 === 0 ? 0.2 : 0.12);
      if (s === 0 || s === 4) this.drum('kick', delay, 0.5);
      if (s === 2 || s === 6) this.drum('snare', delay, 0.12);
      if (s % 2 === 1) this.drum('hat', delay, 0.05);
      this.pluck(N(ch[[0, 1, 2, 1][s % 4]] + 12), delay, 0.04, 0.35, 2400, 0.25);
      const mel = [74, 0, 77, 76, 74, 0, 72, 74, 69, 0, 0, 0, 70, 72, 69, 0];
      const m = mel[(bar % 2) * 8 + s];
      if (bar % 4 >= 2 && m) this.lead(N(m), delay, d * 1.6, 0.06);
      if (bar % 8 === 7 && s === 4) this.drum('riser', delay, 0.06, d * 4);
    } else if (k === 'tavern') {
      // Неспешная лютня в ре-дорийском: тёплая, без писка
      const prog = [[50, 57, 62], [48, 55, 60], [50, 57, 62], [52, 59, 64]];
      const ch = prog[bar % 4];
      if (s === 0 || s === 4) this.bass(N(ch[0] - 12), delay, d * 3, 0.14);
      if (s % 2 === 1) for (const n of ch) this.pluck(N(n + 12), delay, 0.025, 0.5, 1800, 0.3);
      const mel = [74, 76, 77, 76, 74, 72, 74, 69, 72, 74, 76, 74, 72, 71, 69, 67, 74, 76, 77, 79, 81, 79, 77, 76, 76, 74, 72, 71, 69, 71, 72, 74];
      this.pluck(N(mel[i % 32]), delay, 0.06, 0.55, 3000, 0.35);
      if (s === 0 && bar % 2 === 0) this.drum('taiko', delay, 0.08);
    } else {
      // Логово (и дракон): фригийское остинато ми, тайко, гул, нагнетающий фильтр; каждые 8 тактов — «взлёт»
      const dragon = k === 'dragon';
      const phrase = bar % 8;
      const ost = [40, 40, 41, 40, 40, 43, 41, 40];
      this.bass(N(ost[s] + (phrase >= 4 && s === 7 ? 3 : 0)), delay, d, s === 0 ? 0.22 : 0.14);
      if (s === 0) {
        // Гул растёт к концу фразы — напряжение нагнетается
        const cutoff = 500 + phrase * 260 + (dragon ? 600 : 0);
        this.pad([N(52), N(55), N(59), N(53 + (phrase % 2))], delay, d * 8, dragon ? 0.04 : 0.034, cutoff, 0.4);
      }
      const taiko = dragon ? [0, 2, 3, 4, 6, 7] : [0, 3, 6];
      if (taiko.includes(s)) this.drum('taiko', delay, s === 0 ? 0.5 : 0.28);
      if (s === 4) this.drum(dragon ? 'snare' : 'kick', delay, dragon ? 0.16 : 0.32);
      if (dragon || phrase >= 4) this.drum('hat', delay, s % 2 ? 0.035 : 0.02);
      // Тревожная трель полутоном в верхах
      if (phrase % 4 === 3 && s % 2 === 0) this.lead(N(s % 4 === 0 ? 76 : 77), delay, d * 0.9, 0.025, 'sine', 0.6);
      if (dragon && (s === 0 || s === 3) && phrase % 2 === 0) {
        // Медные удары хором: тяжёлый аккорд с быстрым фильтром
        this.pad([N(40), N(47), N(52), N(53)], delay, d * 1.2, 0.07, 2200, 0.02);
      }
      if (phrase === 7 && s === 0) this.drum('riser', delay, dragon ? 0.12 : 0.08, d * 8);
    }
  }


}

export const sfx = new Sfx();
