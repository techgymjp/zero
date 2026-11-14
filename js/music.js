// BGM: 軍艦行進曲風のオリジナル行進曲（WebAudio で合成）
// 変ロ長調 4/4 拍子。旋律=金管、和声=トロンボーンの後打ち、低音=チューバ、打楽器=小太鼓・大太鼓・シンバル

// [MIDI音高(0=休符), 拍]
const INTRO = [
  [[65, .75], [65, .25], [70, 1], [74, 1], [77, 1]],
  [[82, 1.5], [77, .5], [82, 2]],
  [[81, .75], [79, .25], [77, 1], [75, 1], [72, 1]],
  [[77, 2], [0, 1], [65, .5], [65, .5]],
];
const A = [
  [[70, .75], [72, .25], [74, 1], [70, 1], [74, 1]],
  [[77, 1.5], [75, .5], [74, 1], [72, 1]],
  [[72, .75], [74, .25], [75, 1], [72, 1], [75, 1]],
  [[79, 1.5], [77, .5], [75, 1], [74, 1]],
  [[74, .75], [75, .25], [77, 1], [82, 1], [77, 1]],
  [[79, .75], [77, .25], [75, 1], [74, 1], [72, 1]],
  [[70, 1], [74, .75], [72, .25], [69, 1], [72, 1]],
  [[70, 2], [0, 1], [65, .5], [65, .5]],
];
const B = [
  [[79, 1], [79, .75], [77, .25], [75, 1], [79, 1]],
  [[82, 1.5], [79, .5], [77, 2]],
  [[77, 1], [77, .75], [75, .25], [74, 1], [77, 1]],
  [[81, 1.5], [79, .5], [77, 2]],
  [[79, .75], [81, .25], [82, 1], [79, 1], [75, 1]],
  [[74, .75], [75, .25], [77, 1], [74, 1], [70, 1]],
  [[72, 1], [75, 1], [74, 1], [72, 1]],
  [[77, 2], [0, 1], [65, .5], [65, .5]],
];
const TRIO = [
  [[75, 2], [79, 1.5], [77, .5]],
  [[75, 1], [74, 1], [72, 2]],
  [[70, 1.5], [72, .5], [75, 1], [79, 1]],
  [[77, 4]],
  [[77, 2], [80, 1.5], [79, .5]],
  [[77, 1], [75, 1], [72, 2]],
  [[70, 1], [75, 1], [79, 1], [77, 1]],
  [[75, 3], [0, 1]],
];
// 各小節の和音: [低音の根音, 3和音の構成(長3和音=[0,4,7], 属7=[0,4,7,10])]
const I = [34, [0, 4, 7]], IV = [39, [0, 4, 7]], V = [41, [0, 4, 7, 10]], Eb = [39, [0, 4, 7]], Bb7 = [34, [0, 4, 7, 10]], Ab = [44, [0, 4, 7]], F7 = [41, [0, 4, 7, 10]];
const SONG = [
  ...INTRO.map((m, i) => ({ m, c: [I, I, V, V][i], crash: i === 0 })),
  ...A.map((m, i) => ({ m, c: [I, I, V, V, I, IV, V, I][i], crash: i === 0 })),
  ...B.map((m, i) => ({ m, c: [IV, I, V, V, IV, I, V, V][i], crash: i === 0 })),
  ...A.map((m, i) => ({ m, c: [I, I, V, V, I, IV, V, I][i], crash: i === 0 })),
  ...TRIO.map((m, i) => ({ m, c: [Eb, Bb7, Eb, Bb7, Ab, F7, Bb7, Eb][i], crash: i === 0, soft: true })),
  ...TRIO.map((m, i) => ({ m, c: [Eb, Bb7, Eb, Bb7, Ab, F7, Bb7, Eb][i], crash: i === 0 })),
];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- 波形を直接計算して曲全体を生成（高速・音切れなし）----
const SR = 32000;
const TL = 2048;
function table(harm) {
  const t = new Float32Array(TL + 1);
  for (let i = 0; i <= TL; i++) { let v = 0; for (const [n, a] of harm) v += a * Math.sin(2 * Math.PI * n * i / TL); t[i] = v; }
  let m = 0; for (const v of t) m = Math.max(m, Math.abs(v)); for (let i = 0; i <= TL; i++) t[i] /= m;
  return t;
}
const SAW = table(Array.from({ length: 14 }, (_, k) => [k + 1, 1 / (k + 1)]));
const SAW_DARK = table(Array.from({ length: 6 }, (_, k) => [k + 1, 1 / ((k + 1) ** 1.6)]));
const TRI = table([[1, 1], [3, 1 / 9], [5, 1 / 25], [2, 0.3]]);

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.playing = false;
    this.bpm = 116;
    this.volume = 0.38;
    this.buffer = null;
  }

  async prerender() {
    if (this.buffer) return;
    const beat = 60 / this.bpm;
    const total = SONG.length * 4 * beat;
    const N = Math.ceil(total * SR) + SR;
    this.L = new Float32Array(N); this.R = new Float32Array(N);
    let seed = 7; this.rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
    SONG.forEach((bar, i) => this.playBar(bar, i * 4 * beat, beat));
    // 曲末尾の残響を先頭へ折り返してループを滑らかに
    const loopN = Math.floor(total * SR);
    for (let i = loopN; i < N; i++) { this.L[i - loopN] += this.L[i]; this.R[i - loopN] += this.R[i]; }
    this.reverb(loopN);
    const ctx = this.audio.ctx;
    const buf = ctx.createBuffer(2, loopN, SR);
    buf.copyToChannel(this.L.subarray(0, loopN), 0); buf.copyToChannel(this.R.subarray(0, loopN), 1);
    this.buffer = buf;
    this.L = this.R = null;
  }

  // 簡易リバーブ（コム+オールパス）
  reverb(n) {
    for (const [ch, off] of [[this.L, 0], [this.R, 23]]) {
      const dry = ch.slice(0, n);
      const combs = [1116, 1188, 1277, 1356].map(d => ({ d: Math.round((d + off) * SR / 44100), b: null, i: 0 }));
      for (const c of combs) c.b = new Float32Array(c.d);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0; const x = dry[i] * 0.18;
        for (const c of combs) { const y = c.b[c.i]; c.b[c.i] = x + y * 0.78; c.i = (c.i + 1) % c.d; s += y; }
        out[i] = s * 0.25;
      }
      for (const d of [225, 556]) {
        const L = Math.round(d * SR / 44100), b = new Float32Array(L); let k = 0;
        for (let i = 0; i < n; i++) { const y = b[k]; const v = out[i] + y * 0.5; b[k] = v; out[i] = y - v * 0.5; k = (k + 1) % L; }
      }
      for (let i = 0; i < n; i++) ch[i] = dry[i] + out[i] * 0.9;
    }
  }

  // 音符を書き込む: tab=波形, pan -1..1
  voice(tab, f, t, dur, amp, { att = 0.02, rel = 0.06, cutoff = 4, vib = 0, pan = 0, decay = 0 } = {}) {
    const i0 = Math.floor(t * SR), n = Math.floor((dur + rel) * SR);
    const L = this.L, R = this.R;
    const gl = amp * (1 - pan) * 0.5 * 1.4, gr = amp * (1 + pan) * 0.5 * 1.4;
    let ph = 0, lp = 0;
    const a = 1 - Math.exp(-2 * Math.PI * Math.min(f * cutoff, SR * 0.45) / SR);
    const nd = dur * SR, na = att * SR, nr = rel * SR;
    for (let k = 0; k < n && i0 + k < L.length; k++) {
      const vb = vib && k > SR * 0.25 ? 1 + vib * Math.sin(2 * Math.PI * 5.5 * k / SR) : 1;
      ph += f * vb * TL / SR; if (ph >= TL) ph -= TL;
      const ip = ph | 0, fr = ph - ip;
      const x = tab[ip] + (tab[ip + 1] - tab[ip]) * fr;
      lp += (x - lp) * a;
      let e = k < na ? k / na : k < nd ? 1 : 1 - (k - nd) / nr;
      if (decay) e *= Math.exp(-k / SR / decay);
      L[i0 + k] += lp * e * gl; R[i0 + k] += lp * e * gr;
    }
  }
  noiseHit(t, dur, amp, { hp = 0, bp = 0, pan = 0 } = {}) {
    const i0 = Math.floor(t * SR), n = Math.floor(dur * SR);
    let lp1 = 0, lp2 = 0, prev = 0;
    const ca = 1 - Math.exp(-2 * Math.PI * (bp || 8000) / SR);
    for (let k = 0; k < n && i0 + k < this.L.length; k++) {
      let x = this.rnd();
      if (hp) { const y = x - prev; prev = x; x = y; }
      if (bp) { lp1 += (x - lp1) * ca; lp2 += (lp1 - lp2) * ca; x = (lp1 - lp2) * 3; }
      const e = Math.exp(-k / n * 5) * amp;
      this.L[i0 + k] += x * e * (1 - pan) * 0.7; this.R[i0 + k] += x * e * (1 + pan) * 0.7;
    }
  }
  sweep(t, f0, f1, dur, amp) {
    const i0 = Math.floor(t * SR), n = Math.floor(dur * SR); let ph = 0;
    for (let k = 0; k < n && i0 + k < this.L.length; k++) {
      const f = f0 * Math.pow(f1 / f0, k / n);
      ph += 2 * Math.PI * f / SR;
      const v = Math.sin(ph) * amp * Math.exp(-k / n * 4);
      this.L[i0 + k] += v; this.R[i0 + k] += v;
    }
  }

  start() {
    const a = this.audio;
    if (!a.ctx || this.playing || !this.buffer) return;
    const c = a.ctx;
    if (!this.out) { this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(a.master); }
    this.src = c.createBufferSource(); this.src.buffer = this.buffer; this.src.loop = true;
    this.src.connect(this.out); this.src.start(c.currentTime + 0.05);
    this.out.gain.setTargetAtTime(0.9 * this.volume, c.currentTime, 0.5);
    this.playing = true;
  }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    const c = this.audio.ctx;
    this.out.gain.setTargetAtTime(0, c.currentTime, 0.2);
    const s = this.src; setTimeout(() => { try { s.stop(); } catch (e) {} }, 800);
  }
  toggle() { this.playing ? this.stop() : this.start(); return this.playing; }

  playBar(bar, t0, beat) {
    let t = t0;
    for (const [n, d] of bar.m) {
      if (n) {
        const dur = d * beat * 0.92;
        this.voice(SAW, mtof(n), t, dur, bar.soft ? 0.09 : 0.12, { cutoff: bar.soft ? 3 : 4.5, vib: dur > 0.6 ? 0.004 : 0, att: 0.03 });
        this.voice(SAW, mtof(n) * 1.004, t, dur, bar.soft ? 0.05 : 0.07, { cutoff: 3.5, vib: dur > 0.6 ? 0.004 : 0, att: 0.03, pan: 0.1 });
        const root = bar.c[0] % 12;
        let h = n - 3; for (let k = 0; k < 4; k++) { const iv = ((h - root) % 12 + 12) % 12; if (bar.c[1].includes(iv)) break; h--; }
        this.voice(SAW_DARK, mtof(h), t, dur, bar.soft ? 0.05 : 0.07, { cutoff: 3, att: 0.03, pan: -0.35 });
      }
      t += d * beat;
    }
    const [root, chord] = bar.c;
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * beat;
      if (b === 0 || b === 2) this.voice(TRI, mtof(b === 0 ? root : root + 7 - (root + 7 > 46 ? 12 : 0)), tb, beat * 0.75, 0.32, { cutoff: 5, att: 0.02, decay: 0.5 });
      if (b === 1 || b === 3) for (const iv of chord.slice(0, 3)) this.voice(SAW_DARK, mtof(root + 24 + iv), tb, beat * 0.3, bar.soft ? 0.03 : 0.045, { cutoff: 3, att: 0.01, rel: 0.05, pan: 0.35 });
      if (b === 0 || b === 2) this.sweep(tb, 110, 45, 0.3, 0.45);
      if (!bar.soft) {
        if (b === 1 || b === 3) this.noiseHit(tb, 0.14, 0.22, { bp: 2400 });
        this.noiseHit(tb + beat * 0.75, 0.1, 0.07, { bp: 2400 });
      }
    }
    if (bar.crash) this.noiseHit(t0, 1.4, 0.1, { hp: 1 });
    if (bar.m.length && bar.m[bar.m.length - 1][0] === 65) for (let i = 0; i < 4; i++) this.noiseHit(t0 + beat * 3 + i * beat / 4, 0.1, 0.1 + i * 0.03, { bp: 2400 });
  }
}
