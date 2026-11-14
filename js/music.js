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

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.playing = false;
    this.bpm = 116;
    this.volume = 0.5;
  }
  start() {
    const a = this.audio;
    if (!a.ctx || this.playing) return;
    const c = a.ctx;
    if (!this.out) {
      this.out = c.createGain(); this.out.gain.value = 0;
      // 簡易リバーブ（ホール感）
      const conv = c.createConvolver();
      const len = c.sampleRate * 1.6, buf = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      conv.buffer = buf;
      const wet = c.createGain(); wet.gain.value = 0.22;
      this.bus = c.createGain(); this.bus.gain.value = 1;
      this.bus.connect(this.out); this.bus.connect(conv); conv.connect(wet); wet.connect(this.out);
      this.out.connect(a.master);
    }
    this.out.gain.setTargetAtTime(0.16 * this.volume, c.currentTime, 0.5);
    this.playing = true;
    this.bar = 0;
    this.next = c.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 60);
  }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    if (this.out) this.out.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.3);
  }
  toggle() { this.playing ? this.stop() : this.start(); return this.playing; }

  schedule() {
    const c = this.audio.ctx;
    const beat = 60 / this.bpm;
    while (this.next < c.currentTime + 0.4) {
      const bar = SONG[this.bar % SONG.length];
      this.playBar(bar, this.next, beat);
      this.next += beat * 4;
      this.bar++;
    }
  }

  playBar(bar, t0, beat) {
    let t = t0;
    for (const [n, d] of bar.m) {
      if (n) {
        this.brass(n, t, d * beat * 0.92, bar.soft ? 0.55 : 0.8);
        // 3度下のハーモニー（和音の構成音へ寄せる）
        const root = bar.c[0] % 12;
        let h = n - 3; for (let k = 0; k < 4; k++) { const iv = ((h - root) % 12 + 12) % 12; if (bar.c[1].includes(iv)) break; h--; }
        this.brass(h, t, d * beat * 0.92, bar.soft ? 0.25 : 0.38, true);
      }
      t += d * beat;
    }
    const [root, chord] = bar.c;
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * beat;
      // チューバ: 1・3拍（根音・5度）
      if (b === 0 || b === 2) this.tuba(b === 0 ? root : root + 7 - (root + 7 > 46 ? 12 : 0), tb, beat * 0.8);
      // 後打ち: 2・4拍（裏拍にも軽く）
      if (b === 1 || b === 3) for (const iv of chord.slice(0, 3)) this.chuck(root + 24 + iv, tb, beat * 0.35, bar.soft ? 0.12 : 0.18);
      // 打楽器
      if (b === 0 || b === 2) this.kick(tb);
      if (!bar.soft) {
        if (b === 1 || b === 3) this.snare(tb, 0.5);
        this.snare(tb + beat * 0.75, 0.15);
      }
    }
    if (bar.crash) this.cymbal(t0);
    // フレーズ末の小太鼓ロール
    if (bar.m.length && bar.m[bar.m.length - 1][0] === 65) for (let i = 0; i < 4; i++) this.snare(t0 + beat * 3 + i * beat / 4, 0.25 + i * 0.08);
  }

  brass(m, t, dur, vel, soft = false) {
    const c = this.audio.ctx, f = mtof(m);
    const g = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.linearRampToValueAtTime(f * (soft ? 3 : 5), t + 0.05); lp.frequency.linearRampToValueAtTime(f * (soft ? 2.5 : 3.5), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.13, t + 0.03); g.gain.linearRampToValueAtTime(vel * 0.1, t + 0.12);
    g.gain.setValueAtTime(vel * 0.1, t + Math.max(0.12, dur - 0.05)); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    for (const det of [-6, 5]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const vib = c.createOscillator(); vib.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = dur > 0.6 ? 6 : 0;
      vib.connect(vg); vg.connect(o.detune);
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1); vib.start(t); vib.stop(t + dur + 0.1);
    }
    lp.connect(g); g.connect(this.bus);
  }
  tuba(m, t, dur) {
    const c = this.audio.ctx, f = mtof(m);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.01, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.25;
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.bus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  chuck(m, t, dur, vel) {
    const c = this.audio.ctx, f = mtof(m);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 3;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.12, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(t, dur, type, freq, vel, q = 0.8) {
    const c = this.audio.ctx;
    const s = c.createBufferSource(); s.buffer = this.audio.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random(), dur + 0.02);
  }
  snare(t, vel) {
    this._noise(t, 0.14, 'bandpass', 2400, 0.25 * vel, 0.7);
    const c = this.audio.ctx; const o = c.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    const g = c.createGain(); g.gain.setValueAtTime(0.12 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.1);
  }
  kick(t) {
    const c = this.audio.ctx; const o = c.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.32);
  }
  cymbal(t) { this._noise(t, 1.4, 'highpass', 5000, 0.12, 0.5); }
}
