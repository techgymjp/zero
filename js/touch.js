// スマホ・タブレット用タッチ操作
export function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
}

export class TouchControls {
  constructor(input) {
    this.input = input;
    input.touch = { active: true, pitch: 0, roll: 0, mg: false, cannon: false, boost: false };
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="stickZone"><div id="stickBase"><div id="stickKnob"></div></div><div class="hint">ここをなぞって操縦</div></div>
      <div id="tbtns">
        <div class="col">
          <button data-hold="boost" class="tb boost">加速</button>
        </div>
        <div class="col">
          <button data-hold="cannon" class="tb fire2">20mm</button>
          <button data-hold="mg" class="tb fire">7.7mm<br>機銃</button>
          <button data-key="KeyB" class="tb bomb">爆弾</button>
        </div>
      </div>
      <button data-key="KeyL" class="tb land" id="landBtn">着艦</button>`;
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
    let id = null, ox = 0, oy = 0;
    const move = (x, y) => {
      let dx = (x - ox) / R, dy = (y - oy) / R;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      T.roll = Math.sign(dx) * Math.min(1, Math.abs(dx) ** 1.3 * 1.15);
      T.pitch = -Math.sign(dy) * Math.min(1, Math.abs(dy) ** 1.3 * 1.15); // 上へなぞる = 機首上げ（上昇）
    };
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (id !== null) return;
      const t = e.changedTouches[0]; id = t.identifier;
      const r = zone.getBoundingClientRect();
      ox = t.clientX; oy = t.clientY;
      base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px';
      base.classList.add('show'); zone.querySelector('.hint').style.display = 'none';
      move(ox, oy);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) move(t.clientX, t.clientY);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        id = null; T.pitch = T.roll = 0; knob.style.transform = ''; base.classList.remove('show');
      }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
  }
  update() {
    const T = this.input.touch, h = this.holds;
    T.mg = h.has('mg'); T.cannon = h.has('cannon');
    T.boost = h.has('boost');
  }
  setLand(on) { if (on !== this._land) { this._land = on; this.root.querySelector('#landBtn').style.display = on ? '' : 'none'; } }
  show(on) { this.root.style.display = on ? '' : 'none'; }
}
