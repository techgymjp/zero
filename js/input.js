// 入力（キーボード・マウス・ゲームパッド）
import { clamp } from './util.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseBtn = [false, false, false];
    this.drag = { active: false, dx: 0, dy: 0 };
    this.pitch = 0; this.roll = 0; this.yaw = 0; this.throttle = 0;
    this.fireMG = false; this.fireCannon = false;
    this._sm = { p: 0, r: 0, y: 0 };
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (!['Space'].includes(e.code)) {} }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousedown', (e) => {
      if (e.target.closest && e.target.closest('.panel')) return;
      this.mouseBtn[e.button] = true;
      if (e.button === 1 || e.button === 0 && e.shiftKey) this.drag.active = true;
    });
    addEventListener('mouseup', (e) => { this.mouseBtn[e.button] = false; if (e.button === 1 || e.button === 0) this.drag.active = false; });
    addEventListener('mousemove', (e) => { if (this.drag.active) { this.drag.dx += e.movementX; this.drag.dy += e.movementY; } });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }
  down(...codes) { return codes.some(c => this.keys.has(c)); }
  hit(code) { return this.pressed.has(code); }

  update(dt) {
    const k = (a, b) => (this.down(...a) ? 1 : 0) - (this.down(...b) ? 1 : 0);
    // W/↑ = 機首上げ（上昇）、S/↓ = 機首下げ
    let p = k(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    let r = k(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    let y = k(['KeyE'], ['KeyQ']);
    let t = k(['ShiftLeft', 'ShiftRight', 'KeyR', 'Equal'], ['ControlLeft', 'ControlRight', 'KeyF', 'Minus']);
    // 機銃（20mm）: Space・X・左右クリック
    let mg = this.down('Space', 'KeyX', 'KeyC') || (this.mouseBtn[0] && !this.drag.active) || this.mouseBtn[2];
    let cn = false;
    // ゲームパッド
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    this.gpBomb = false;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      const ly = dz(gp.axes[1] || 0), lx = dz(gp.axes[0] || 0), rx = dz(gp.axes[2] || 0);
      if (ly) p = -ly; // スティックを上に倒す = 上昇
      if (lx) r = lx;
      if (rx) y = rx;
      if (gp.buttons[5]?.pressed) t = 1; if (gp.buttons[4]?.pressed) t = -1;
      if (gp.buttons[7]?.value > 0.3) mg = true;
      if (gp.buttons[6]?.value > 0.3) mg = true;
      const a = !!gp.buttons[0]?.pressed;
      if (a && !this._gpA) this.pressed.add('KeyB');
      this._gpA = a;
      const yb = !!gp.buttons[3]?.pressed;
      if (yb && !this._gpY) this.pressed.add('KeyV');
      this._gpY = yb;
    }
    // タッチ操作
    if (this.touch) {
      this.touchUI?.update();
      const T = this.touch;
      if (T.pitch || T.roll) { p = T.pitch; r = T.roll; }
      if (T.mg) mg = true;
    }
    // キー入力を滑らかに
    const sm = (cur, tgt, rate) => cur + clamp(tgt - cur, -rate * dt, rate * dt);
    this._sm.p = sm(this._sm.p, p, 4.5); this._sm.r = sm(this._sm.r, r, 6); this._sm.y = sm(this._sm.y, y, 4);
    this.pitch = this._sm.p; this.roll = this._sm.r; this.yaw = this._sm.y; this.throttle = t;
    this.fireMG = mg; this.fireCannon = cn;
    this.gearToggle = this.hit('KeyG');
  }
  endFrame() { this.pressed.clear(); }
}
