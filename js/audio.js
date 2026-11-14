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
    // エンジン音（栄 14気筒星型）: 低域ノイズを点火周期で脈動させた柔らかい唸り
    const c = this.ctx;
    const e = c.createGain(); e.gain.value = 0; e.connect(this.master);
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 320; tone.Q.value = 0.4; tone.connect(e);
    // 脈動ノイズ
    const ns = c.createBufferSource(); ns.buffer = this.noise; ns.loop = true;
    const nlp = c.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 220;
    const am = c.createGain(); am.gain.value = 0.55;
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 22;
    const depth = c.createGain(); depth.gain.value = 0.4;
    lfo.connect(depth); depth.connect(am.gain);
    ns.connect(nlp); nlp.connect(am); am.connect(tone);
    // 低いうなり（正弦波）
    const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 44;
    const hg = c.createGain(); hg.gain.value = 0.18;
    hum.connect(hg); hg.connect(tone);
    const hum2 = c.createOscillator(); hum2.type = 'triangle'; hum2.frequency.value = 66;
    const hg2 = c.createGain(); hg2.gain.value = 0.05;
    hum2.connect(hg2); hg2.connect(tone);
    ns.start(); lfo.start(); hum.start(); hum2.start();
    this.engine = { gain: e, tone, lfo, hum, hum2, nlp };
    this.engineVol = 1;
    // 風切り音
    const ws = this.ctx.createBufferSource(); ws.buffer = this.noise; ws.loop = true;
    const wf = this.ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.5;
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
    const rpm = 0.5 + throttle * 0.5;
    const E = this.engine;
    E.lfo.frequency.setTargetAtTime(14 + rpm * 16, t, 0.15);
    E.hum.frequency.setTargetAtTime(34 + rpm * 22, t, 0.15);
    E.hum2.frequency.setTargetAtTime(51 + rpm * 33, t, 0.15);
    E.nlp.frequency.setTargetAtTime(160 + rpm * 160, t, 0.2);
    E.tone.frequency.setTargetAtTime(240 + rpm * 260, t, 0.2);
    E.gain.gain.setTargetAtTime(on ? (0.10 + throttle * 0.10) * this.engineVol : 0, t, 0.25);
    this.wind.gain.setTargetAtTime(on ? Math.min(0.12, (speed / 160) ** 2 * 0.1) : 0, t, 0.3);
  }
  setEngineVolume(v) { this.engineVol = v; }

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
    if (this.lastGun[key] && now - this.lastGun[key] < 0.05) return;
    this.lastGun[key] = now;
    const v = own ? 1 : this._vol(pos) * 0.6;
    if (v < 0.02) return;
    if (kind === 'mg20') {
      // 20mm: 腹に響く低い発射音
      this._burst(0.22, 700, 0.55 * v, 'lowpass');
      this._thump(90, 40, 0.18, 0.5 * v);
    } else {
      // 7.7mm / 12.7mm: 乾いた連射音
      this._burst(0.07, 1800, 0.3 * v, 'bandpass', 0.9);
      this._thump(160, 70, 0.06, 0.22 * v);
    }
  }
  _thump(f0, f1, dur, gain) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  // 爆弾投下: 懸吊架の解放音 + 落下の風切り音
  bombRelease() {
    if (!this.ctx || this.muted) return;
    this._burst(0.12, 900, 0.5, 'bandpass', 2);
    this._thump(220, 90, 0.12, 0.35);
    const c = this.ctx, t = c.currentTime + 0.25;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(380, t + 3.2);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + 3.4);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 3.5);
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
