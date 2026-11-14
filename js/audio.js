// 効果音（WebAudio による合成）
export class Audio {
  constructor() { this.ctx = null; this.listener = null; this.muted = false; }
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
    // ノイズバッファ
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // エンジン音（栄 14気筒星型）
    const e = this.ctx.createGain(); e.gain.value = 0; e.connect(this.master);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(e);
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 30;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.4;
    o1.connect(lp); o2.connect(g2); g2.connect(lp);
    const ns = this.ctx.createBufferSource(); ns.buffer = this.noise; ns.loop = true;
    const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 400; nf.Q.value = 0.6;
    const ng = this.ctx.createGain(); ng.gain.value = 0.35;
    ns.connect(nf); nf.connect(ng); ng.connect(e);
    o1.start(); o2.start(); ns.start();
    this.engine = { gain: e, o1, o2, lp, nf };
    // 風切り音
    const ws = this.ctx.createBufferSource(); ws.buffer = this.noise; ws.loop = true;
    const wf = this.ctx.createBiquadFilter(); wf.type = 'highpass'; wf.frequency.value = 800;
    const wg = this.ctx.createGain(); wg.gain.value = 0;
    ws.connect(wf); wf.connect(wg); wg.connect(this.master); ws.start();
    this.wind = wg;
    this.lastGun = {};
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setEngine(throttle, speed, on = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 0.45 + throttle * 0.55;
    this.engine.o1.frequency.setTargetAtTime(55 + rpm * 70, t, 0.1);
    this.engine.o2.frequency.setTargetAtTime(27 + rpm * 35, t, 0.1);
    this.engine.lp.frequency.setTargetAtTime(350 + rpm * 900, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(on ? 0.12 + throttle * 0.13 : 0, t, 0.15);
    this.wind.gain.setTargetAtTime(on ? Math.min(0.25, (speed / 160) ** 2 * 0.2) : 0, t, 0.2);
  }

  _vol(pos) {
    if (!pos || !this.listener) return 1;
    const d = pos.distanceTo(this.listener);
    return 1 / (1 + d / 250);
  }
  _burst(dur, freq, gain, type = 'lowpass', q = 0.7) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }
  gun(kind, pos, own) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const key = kind + (own ? 'p' : 'o');
    if (this.lastGun[key] && now - this.lastGun[key] < 0.045) return;
    this.lastGun[key] = now;
    const v = own ? 1 : this._vol(pos) * 0.6;
    if (v < 0.02) return;
    if (kind === 'mg20') this._burst(0.16, 900, 0.5 * v, 'lowpass');
    else this._burst(0.06, 2500, 0.22 * v, 'bandpass', 1.2);
  }
  explosion(pos, size = 1) {
    if (!this.ctx || this.muted) return;
    const v = this._vol(pos) * 3;
    if (v < 0.02) return;
    this._burst(0.8 + size * 0.6, 300, Math.min(1, 0.7 * v * size), 'lowpass');
    this._burst(0.25, 1200, Math.min(0.6, 0.3 * v), 'lowpass');
  }
  flak(pos) {
    if (!this.ctx || this.muted) return;
    const v = this._vol(pos) * 2;
    if (v < 0.03) return;
    this._burst(0.45, 500, Math.min(0.6, 0.5 * v), 'lowpass');
  }
  hit() { if (this.ctx && !this.muted) this._burst(0.07, 3000, 0.35, 'highpass'); }
  beep(freq = 880, dur = 0.12) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.frequency.value = freq; o.type = 'square';
    const g = c.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
}
