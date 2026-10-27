/** Процедурные звуки и музыка на WebAudio — никаких файлов, всё синтезируется. */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  musicOn = true;
  private musicKind: 'none' | 'calm' | 'battle' | 'tavern' = 'none';
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

  music(kind: 'none' | 'calm' | 'battle' | 'tavern') {
    if (this.musicKind === kind) return;
    this.musicKind = kind;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.1;
  }

  private tickMusic() {
    const c = this.ctx;
    if (!c || this.musicKind === 'none' || !this.musicGain) return;
    const bpm = this.musicKind === 'battle' ? 132 : this.musicKind === 'tavern' ? 112 : 84;
    const stepDur = 60 / bpm / 2;
    while (this.nextTime < c.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime - c.currentTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private playStep(i: number, delay: number, d: number) {
    const dest = this.musicGain!;
    const bar = Math.floor(i / 8) % 4;
    const s = i % 8;
    if (this.musicKind === 'tavern') {
      // Весёлая «таверная» джига в ре-дорийском
      const chords = [
        [146.8, 220, 293.7],
        [130.8, 196, 261.6],
        [146.8, 220, 293.7],
        [164.8, 246.9, 329.6],
      ];
      const mel = [587, 659, 698, 659, 587, 523, 587, 440, 523, 587, 659, 587, 523, 494, 440, 392, 587, 659, 698, 784, 880, 784, 698, 659, 659, 587, 523, 494, 440, 494, 523, 587];
      const ch = chords[bar];
      if (s % 4 === 0) this.tone(ch[0] / 2, d * 3, 'triangle', 0.35, 1, delay, dest);
      if (s % 2 === 1) for (const f of ch) this.tone(f, d * 0.8, 'triangle', 0.08, 1, delay, dest);
      this.tone(mel[(i % 32)], d * 0.9, 'square', 0.07, 1, delay, dest);
    } else if (this.musicKind === 'battle') {
      const roots = [110, 110, 87.3, 98];
      const r = roots[bar];
      this.tone(r, d * 0.9, 'sawtooth', s % 2 === 0 ? 0.16 : 0.08, 1, delay, dest);
      if (s === 0 || s === 4) this.noiseAt(delay, 0.12, 0.35, 120, 'lowpass');
      if (s === 2 || s === 6) this.noiseAt(delay, 0.08, 0.2, 2500, 'highpass');
      const mel = [440, 523, 587, 659, 587, 523, 440, 392];
      if (s % 2 === 0 && bar % 2 === 1) this.tone(mel[(s + bar * 2) % 8], d * 1.8, 'triangle', 0.09, 1, delay, dest);
    } else {
      const chords = [
        [261.6, 329.6, 392],
        [220, 261.6, 329.6],
        [174.6, 220, 261.6],
        [196, 246.9, 293.7],
      ];
      const ch = chords[bar];
      if (s === 0) for (const f of ch) this.tone(f, d * 7, 'sine', 0.07, 1, delay, dest);
      const arp = [0, 1, 2, 1, 2, 0, 1, 2];
      this.tone(ch[arp[s]] * 2, d * 1.5, 'triangle', 0.05, 1, delay, dest);
    }
  }

  private noiseAt(delay: number, dur: number, vol: number, filter: number, type: BiquadFilterType) {
    const c = this.ctx;
    if (!c || !this.noiseBuf || !this.musicGain) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filter;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.musicGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }
}

export const sfx = new Sfx();
