// 効果音: 開始前に OfflineAudioContext で全てバッファへ事前生成し、再生時は再生のみ（カクつき防止）
const SR = 44100;

function makeNoise(ctx, sec) {
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// 効果音レシピ（オフライン描画）
const RECIPES = {
  gun: { dur: 0.35, fn: (c, out, noise) => { // 20mm 機銃
    burst(c, out, noise, 0, 0.22, 'lowpass', 700, 0.8, 0.9);
    thump(c, out, 0, 90, 40, 0.18, 0.8);
    burst(c, out, noise, 0, 0.05, 'highpass', 2500, 0.7, 0.35);
  } },
  mg: { dur: 0.15, fn: (c, out, noise) => { // 米軍 12.7mm
    burst(c, out, noise, 0, 0.07, 'bandpass', 1800, 0.9, 0.6);
    thump(c, out, 0, 160, 70, 0.06, 0.4);
  } },
  expl: { dur: 2.6, fn: (c, out, noise) => {
    burst(c, out, noise, 0, 2.4, 'lowpass', 260, 0.7, 1.0);
    burst(c, out, noise, 0, 0.3, 'lowpass', 1200, 0.7, 0.6);
    thump(c, out, 0, 70, 28, 0.9, 0.9);
  } },
  flak: { dur: 0.7, fn: (c, out, noise) => { burst(c, out, noise, 0, 0.6, 'lowpass', 520, 0.7, 0.9); thump(c, out, 0, 110, 50, 0.25, 0.5); } },
  hit: { dur: 0.12, fn: (c, out, noise) => { burst(c, out, noise, 0, 0.08, 'highpass', 3000, 0.7, 0.8); thump(c, out, 0, 600, 300, 0.05, 0.3); } },
  release: { dur: 0.3, fn: (c, out, noise) => { burst(c, out, noise, 0, 0.14, 'bandpass', 900, 2, 0.9); thump(c, out, 0, 220, 90, 0.14, 0.7); } },
  whistle: { dur: 3.6, fn: (c, out) => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1400, 0); o.frequency.exponentialRampToValueAtTime(380, 3.3);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.5, 0.6); g.gain.exponentialRampToValueAtTime(0.001, 3.5);
    o.connect(g); g.connect(out); o.start(0); o.stop(3.6);
  } },
  // 加速: エンジンが吹け上がる「ブオォーン」
  boost: { dur: 1.4, fn: (c, out, noise) => {
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, 0); o.frequency.exponentialRampToValueAtTime(170, 0.9);
    const o2 = c.createOscillator(); o2.type = 'square';
    o2.frequency.setValueAtTime(35, 0); o2.frequency.exponentialRampToValueAtTime(85, 0.9);
    const lfo = c.createOscillator(); lfo.frequency.setValueAtTime(18, 0); lfo.frequency.linearRampToValueAtTime(42, 0.9);
    const am = c.createGain(); am.gain.value = 0.6; const dep = c.createGain(); dep.gain.value = 0.4; lfo.connect(dep); dep.connect(am.gain);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(1800, 0.7);
    const g = c.createGain(); g.gain.setValueAtTime(0.001, 0); g.gain.exponentialRampToValueAtTime(0.9, 0.15); g.gain.setValueAtTime(0.9, 0.8); g.gain.exponentialRampToValueAtTime(0.001, 1.35);
    const g2 = c.createGain(); g2.gain.value = 0.5;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(am); am.connect(g); g.connect(out);
    for (const x of [o, o2, lfo]) { x.start(0); x.stop(1.4); }
    burst(c, out, noise, 0.05, 1.1, 'bandpass', 1200, 0.6, 0.35); // 風のうなり
  } },
  beep: { dur: 0.14, fn: (c, out) => {
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1200;
    const g = c.createGain(); g.gain.setValueAtTime(0.4, 0); g.gain.exponentialRampToValueAtTime(0.001, 0.12);
    o.connect(g); g.connect(out); o.start(0); o.stop(0.14);
  } },
};
function burst(c, out, noise, t, dur, type, freq, q, gain) {
  const s = c.createBufferSource(); s.buffer = noise;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5, dur + 0.05);
}
function thump(c, out, t, f0, f1, dur, gain) {
  const o = c.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}

export class Audio {
  constructor() { this.ctx = null; this.listener = null; this.muted = false; this.buffers = {}; this.ready = false; this.engineVol = 1; }

  // クリック時に呼ぶ（AudioContext の生成はユーザー操作が必要）
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C({ latencyHint: 'playback' });
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
    // 音割れ防止
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.noise = makeNoise(this.ctx, 2);
    this._buildEngine();
    this.lastPlay = {};
  }

  // 全効果音を事前生成
  async prepare() {
    if (!this.ctx || this.ready) return;
    const jobs = Object.entries(RECIPES).map(async ([name, r]) => {
      const off = new OfflineAudioContext(1, Math.ceil(SR * r.dur), SR);
      const noise = makeNoise(off, 2);
      r.fn(off, off.destination, noise);
      const buf = await off.startRendering();
      const d = buf.getChannelData(0); let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
      if (pk > 0.9) for (let i = 0; i < d.length; i++) d[i] *= 0.9 / pk;
      this.buffers[name] = buf;
    });
    await Promise.all(jobs);
    this.ready = true;
  }

  _buildEngine() {
    // エンジン音（栄 14気筒星型）: 低域ノイズを点火周期で脈動させた柔らかい唸り
    const c = this.ctx;
    const e = c.createGain(); e.gain.value = 0; e.connect(this.master);
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 320; tone.Q.value = 0.4; tone.connect(e);
    const ns = c.createBufferSource(); ns.buffer = this.noise; ns.loop = true;
    const nlp = c.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 220;
    const am = c.createGain(); am.gain.value = 0.55;
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 22;
    const depth = c.createGain(); depth.gain.value = 0.4;
    lfo.connect(depth); depth.connect(am.gain);
    ns.connect(nlp); nlp.connect(am); am.connect(tone);
    const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 44;
    const hg = c.createGain(); hg.gain.value = 0.18; hum.connect(hg); hg.connect(tone);
    const hum2 = c.createOscillator(); hum2.type = 'triangle'; hum2.frequency.value = 66;
    const hg2 = c.createGain(); hg2.gain.value = 0.05; hum2.connect(hg2); hg2.connect(tone);
    // スマホのスピーカーでも聞こえる中音域（点火の「ブルルル」）
    const buzz = c.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 110;
    const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 450; bf.Q.value = 0.8;
    const bam = c.createGain(); bam.gain.value = 0.5; depth.connect(bam.gain);
    const bg = c.createGain(); bg.gain.value = 0.35;
    buzz.connect(bf); bf.connect(bam); bam.connect(bg); bg.connect(e);
    const mn = c.createBufferSource(); mn.buffer = this.noise; mn.loop = true;
    const mf = c.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 700; mf.Q.value = 0.7;
    const mg = c.createGain(); mg.gain.value = 0.25; depth.connect(mg.gain);
    mn.connect(mf); mf.connect(mg); mg.connect(e);
    // 加速中のうなり（押している間だけ大きくなる）
    const roar = c.createOscillator(); roar.type = 'sawtooth'; roar.frequency.value = 150;
    const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 0.9;
    const ram = c.createGain(); ram.gain.value = 0.5; depth.connect(ram.gain);
    const rg = c.createGain(); rg.gain.value = 0;
    roar.connect(rf); rf.connect(ram); ram.connect(rg); rg.connect(this.master);
    ns.start(); lfo.start(); hum.start(); hum2.start(); buzz.start(); mn.start(); roar.start();
    this.engine = { gain: e, tone, lfo, hum, hum2, nlp, buzz, bf, mf, roar, rf, rg };
    // 風切り音
    const ws = c.createBufferSource(); ws.buffer = this.noise; ws.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.5;
    const wg = c.createGain(); wg.gain.value = 0;
    ws.connect(wf); wf.connect(wg); wg.connect(this.master); ws.start();
    this.wind = wg;
    this._engLast = 0;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setEngineVolume(v) { this.engineVol = v; }
  // 加速ボタン: 押した瞬間に吹け上がり音、押している間はうなりを重ねる
  setBoost(on) {
    if (on && !this.boosting) { this.play('boost', 0.9 * Math.max(0.6, this.engineVol)); this._engLast = 0; }
    if (!on && this.boosting) this._engLast = 0;
    this.boosting = on;
  }

  setEngine(throttle, speed, on = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // パラメータ更新は 0.1 秒ごとに間引く
    if (t - this._engLast < 0.1 && on) return;
    this._engLast = t;
    const rpm = 0.5 + throttle * 0.5;
    const E = this.engine;
    E.lfo.frequency.setTargetAtTime(14 + rpm * 16, t, 0.15);
    E.hum.frequency.setTargetAtTime(34 + rpm * 22, t, 0.15);
    E.hum2.frequency.setTargetAtTime(51 + rpm * 33, t, 0.15);
    E.nlp.frequency.setTargetAtTime(160 + rpm * 160, t, 0.2);
    E.tone.frequency.setTargetAtTime(240 + rpm * 260, t, 0.2);
    E.buzz.frequency.setTargetAtTime(80 + rpm * 70, t, 0.15);
    E.bf.frequency.setTargetAtTime(350 + rpm * 350, t, 0.2);
    E.mf.frequency.setTargetAtTime(500 + rpm * 500, t, 0.2);
    E.gain.gain.setTargetAtTime(on ? (0.22 + throttle * 0.22) * this.engineVol : 0, t, 0.25);
    E.roar.frequency.setTargetAtTime(110 + rpm * 90, t, 0.2);
    E.rf.frequency.setTargetAtTime(700 + rpm * 500, t, 0.2);
    E.rg.gain.setTargetAtTime(on && this.boosting ? 0.22 * Math.max(0.5, this.engineVol) : 0, t, this.boosting ? 0.12 : 0.35);
    this.wind.gain.setTargetAtTime(on ? Math.min(0.12, (speed / 160) ** 2 * 0.1) : 0, t, 0.3);
  }

  _vol(pos) {
    if (!pos || !this.listener) return 1;
    return 1 / (1 + pos.distanceTo(this.listener) / 250);
  }
  // 事前生成バッファを再生（同じ音は最小間隔で間引く）
  play(name, gain = 1, rate = 1, minGap = 0) {
    if (!this.ctx || this.muted || !this.ready || gain < 0.02) return;
    const now = this.ctx.currentTime;
    if (minGap && this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;
    const s = this.ctx.createBufferSource(); s.buffer = this.buffers[name];
    s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = this.ctx.createGain(); g.gain.value = Math.min(1.2, gain);
    s.connect(g); g.connect(this.sfx); s.start(now);
  }

  gun(kind, pos, own) {
    const v = own ? 0.85 : this._vol(pos) * 0.5;
    if (kind === 'mg20') this.play(own ? 'gun' : 'gun', v, 1, 0.07);
    else this.play('mg', v, 1, 0.05);
  }
  explosion(pos, size = 1) { this.play('expl', Math.min(1.1, this._vol(pos) * 2.2 * Math.sqrt(size)), 1 / Math.sqrt(Math.max(0.5, size)), 0.05); }
  flak(pos) { this.play('flak', Math.min(0.8, this._vol(pos) * 1.6), 1, 0.06); }
  hit() { this.play('hit', 0.6, 1, 0.06); }
  bombRelease() { this.play('release', 0.8); this.play('whistle', 0.25); }
  beep() { this.play('beep', 0.25); }
}
