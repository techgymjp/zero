import { t } from './i18n.js';
// スマホ・タブレット用タッチ操作
export function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
}

export class TouchControls {
  constructor(input) {
    this.input = input;
    input.touch = { active: true, pitch: 0, roll: 0, mg: false, boost: false };
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="stickZone"><div id="stickBase"><div id="stickKnob"></div></div></div>
      <div id="tbtns">
        <div class="col">
          <button data-hold="boost" class="tb boost">${t('加速')}</button>
        </div>
        <div class="col">
          <button data-hold="mg" class="tb fire">${t('機銃')}</button>
          <button data-key="KeyB" class="tb bomb">${t('爆弾')}</button>
        </div>
      </div>
      <button data-key="KeyL" class="tb land" id="landBtn">${t('着艦') === '着艦' ? '着艦' : 'Land'}</button>
      <button data-key="KeyP" class="tb pause" aria-label="一時停止">Ⅱ</button>
      <div id="mapTap"></div>`;
    document.body.appendChild(root);
    this.root = root;
    const T = input.touch;
    // ボタン
    for (const b of root.querySelectorAll('button')) {
      const hold = b.dataset.hold, key = b.dataset.key;
      const on = (e) => {
        e.preventDefault(); b.classList.add('on');
        if (key) input.pressed.add(key);
        if (hold) this.holds.add(hold);
      };
      const off = (e) => { e.preventDefault(); b.classList.remove('on'); if (hold) this.holds.delete(hold); };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('touchcancel', off, { passive: false });
      b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
    }
    this.holds = new Set();
    // 仮想スティック
    const zone = root.querySelector('#stickZone'), base = root.querySelector('#stickBase'), knob = root.querySelector('#stickKnob');
    const R = 70;
    let id = null, ox = 0, oy = 0, t0 = 0, moved = 0;
    const move = (x, y) => {
      let dx = (x - ox) / R, dy = (y - oy) / R;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      T.roll = Math.sign(dx) * Math.abs(dx) ** 1.8 * 0.75; // 横転はマイルドに（小さく倒すとゆっくり）
      T.pitch = -Math.sign(dy) * Math.min(1, Math.abs(dy) ** 1.3 * 1.15); // 上へなぞる = 機首上げ（上昇）
    };
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (id !== null) return;
      const t = e.changedTouches[0]; id = t.identifier;
      const r = zone.getBoundingClientRect();
      ox = t.clientX; oy = t.clientY; t0 = e.timeStamp; moved = 0;
      base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px';
      base.classList.add('show');
      move(ox, oy);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) { moved = Math.max(moved, Math.hypot(t.clientX - ox, t.clientY - oy)); move(t.clientX, t.clientY); }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        // 地図を軽くタップしたら縮尺を切り替える
        const m = this.hud && this.hud.mapRect;
        if (m && e.timeStamp - t0 < 350 && moved < 12 && ox >= m.x && ox <= m.x + m.w && oy >= m.y && oy <= m.y + m.h) input.pressed.add('KeyM');
        id = null; T.pitch = T.roll = 0; knob.style.transform = ''; base.classList.remove('show');
      }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    // 地図の上をタップしたら縮尺を切り替える
    const mapTap = root.querySelector('#mapTap');
    mapTap.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); input.pressed.add('KeyM'); }, { passive: false });
    this.mapTap = mapTap;
  }
  update() {
    // 地図のタップ領域を HUD の地図に合わせる
    const m = this.hud && this.hud.mapRect;
    if (m && this.mapTap && (this._mx !== m.x || this._my !== m.y || this._ms !== m.w)) {
      this._mx = m.x; this._my = m.y; this._ms = m.w;
      Object.assign(this.mapTap.style, { left: m.x + 'px', top: m.y + 'px', width: m.w + 'px', height: m.h + 'px' });
    }
    const T = this.input.touch, h = this.holds;
    T.mg = h.has('mg');
    T.boost = h.has('boost');
  }
  setLand(on) { if (on !== this._land) { this._land = on; this.root.querySelector('#landBtn').style.display = on ? '' : 'none'; } }
  show(on) { this.root.style.display = on ? '' : 'none'; }
}
