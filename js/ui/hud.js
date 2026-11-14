// ヘッドアップ表示・ミニマップ
import * as THREE from 'three';
import { TERRAIN, ROUTE_WEST, KAHUKU_START, LANDMARKS } from '../world/geo.js';
import { predictImpact } from '../sim/weapons.js';
import { clamp, fmtTime } from '../util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ORANGE = '#ffb347', GREEN = '#9dff9d', RED = '#ff5a4a', BLUE = '#7fc6ff', WHITE = '#f4f1e6';

export class HUD {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('hud');
    this.ctx = this.canvas.getContext('2d');
    this.msgs = [];
    this.mapZoom = 1;
    this.hitFlash = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.W = innerWidth; this.H = innerHeight;
  }
  message(text, kind = 'normal') {
    this.msgs.unshift({ text, kind, t: kind === 'big' ? 6 : 4.5 });
    if (this.msgs.length > 6) this.msgs.length = 6;
  }

  project(p) {
    const cam = this.game.camera;
    _v.copy(p).applyMatrix4(cam.matrixWorldInverse);
    if (_v.z > -1) return null;
    _v.applyMatrix4(cam.projectionMatrix);
    return [(_v.x * 0.5 + 0.5) * this.W, (-_v.y * 0.5 + 0.5) * this.H];
  }

  text(s, x, y, color = WHITE, size = 14, align = 'left', bold = false) {
    const c = this.ctx;
    c.font = `${bold ? 'bold ' : ''}${size}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.65)'; c.strokeText(s, x, y);
    c.fillStyle = color; c.fillText(s, x, y);
  }

  draw(dt) {
    const g = this.game, c = this.ctx, W = this.W, H = this.H;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (g.state !== 'play' && g.state !== 'dead' && g.state !== 'pause') return;
    const pl = g.player;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      c.fillStyle = `rgba(160,0,0,${Math.min(0.35, this.hitFlash)})`; c.fillRect(0, 0, W, H);
    }
    if (pl && pl.alive) {
      this.drawMarkers();
      this.drawSight();
      this.drawInstruments();
      this.drawCompass();
    }
    this.drawObjectives();
    this.drawMinimap();
    this.drawMessages(dt);
  }

  drawSight() {
    const g = this.game, c = this.ctx, pl = g.player;
    // 照準（機軸前方 300m）
    const aim = this.project(_w.copy(pl.pos).addScaledVector(pl.fwd, 300).addScaledVector(pl.up, 0.6));
    if (!aim) return;
    const [x, y] = aim;
    c.strokeStyle = ORANGE; c.lineWidth = 1.5; c.globalAlpha = 0.9;
    c.beginPath(); c.arc(x, y, 46, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(x - 70, y); c.lineTo(x - 12, y); c.moveTo(x + 12, y); c.lineTo(x + 70, y);
    c.moveTo(x, y - 70); c.lineTo(x, y - 12); c.moveTo(x, y + 12); c.lineTo(x, y + 70);
    c.stroke();
    for (const r of [23]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.setLineDash([3, 5]); c.stroke(); c.setLineDash([]); }
    c.globalAlpha = 1;
    // 見越し照準（前方の敵機）
    let best = null, ba = 0.35;
    for (const o of g.aircraft) {
      if (!o.alive || o.side === 'jp') continue;
      const d = o.pos.distanceTo(pl.pos);
      if (d > 1200) continue;
      const a = pl.fwd.angleTo(_v.copy(o.pos).sub(pl.pos));
      if (a < ba) { ba = a; best = o; }
    }
    if (best) {
      const d = best.pos.distanceTo(pl.pos);
      const tof = d / 700;
      const lead = _v.copy(best.pos).addScaledVector(best.vel, tof).addScaledVector(pl.vel, -tof);
      lead.y += 0.5 * 9.81 * tof * tof;
      const lp = this.project(lead.clone());
      if (lp) {
        c.strokeStyle = RED; c.lineWidth = 2;
        c.beginPath(); c.arc(lp[0], lp[1], 8, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(lp[0] - 14, lp[1]); c.lineTo(lp[0] - 9, lp[1]); c.moveTo(lp[0] + 9, lp[1]); c.lineTo(lp[0] + 14, lp[1]); c.stroke();
        this.text(`${Math.round(d)}m`, lp[0] + 16, lp[1] + 12, RED, 12);
      }
    }
    // 爆撃照準
    const stores = pl.model.userData.stores.filter(s => s.parent);
    if (stores.length && pl.pos.y - g.terrain.groundAt(pl.pos.x, pl.pos.z) < 3500) {
      const ip = predictImpact(pl.pos, pl.vel, g.terrain, new THREE.Vector3());
      if (ip) {
        const sp = this.project(ip);
        if (sp) {
          let onShip = false;
          for (const s of g.ships) if (s.side === 'us' && !s.sunk && s.distanceToHull(ip) < 4) onShip = true;
          c.strokeStyle = onShip ? RED : GREEN; c.lineWidth = 2;
          c.beginPath(); c.moveTo(sp[0], sp[1] - 10); c.lineTo(sp[0] + 10, sp[1]); c.lineTo(sp[0], sp[1] + 10); c.lineTo(sp[0] - 10, sp[1]); c.closePath(); c.stroke();
          this.text(onShip ? '命中コース' : '着弾点', sp[0] + 14, sp[1], onShip ? RED : GREEN, 12);
        }
      }
    }
  }

  drawMarkers() {
    const g = this.game, c = this.ctx, pl = g.player;
    for (const o of g.aircraft) {
      if (!o.alive || o === pl) continue;
      const d = o.pos.distanceTo(pl.pos);
      if (d > 6000) continue;
      const p = this.project(o.pos);
      if (!p) continue;
      const s = clamp(1800 / d, 5, 16);
      if (o.side === 'us') {
        c.strokeStyle = RED; c.lineWidth = 1.5;
        c.strokeRect(p[0] - s, p[1] - s, s * 2, s * 2);
        if (d < 2500) this.text(`${o.name} ${(d / 1000).toFixed(1)}km`, p[0] + s + 4, p[1] - s, RED, 11);
      } else {
        c.strokeStyle = o.wingman ? '#c5e7ff' : BLUE; c.lineWidth = 1;
        c.beginPath(); c.moveTo(p[0], p[1] - s); c.lineTo(p[0] + s, p[1] + s); c.lineTo(p[0] - s, p[1] + s); c.closePath(); c.stroke();
        if (o.wingman && d < 3000) this.text(o.name, p[0] + s + 4, p[1], BLUE, 11);
      }
    }
    for (const s of g.ships) {
      const d = s.pos.distanceTo(pl.pos);
      if (s.side === 'us' && !s.isTarget && d > 5000) continue;
      if (d > 30000 || s.removed) continue;
      const p = this.project(_w.copy(s.pos).setY(s.deckY + 20));
      if (!p) continue;
      if (s.side === 'jp') {
        if (s !== g.akagi) continue;
        this.text(`▼ 赤城 ${(d / 1000).toFixed(1)}km`, p[0], p[1] - 10, BLUE, 13, 'center', true);
        continue;
      }
      const col = s.sunk ? '#999' : s.isTarget ? '#ffd166' : '#d9a';
      if (s.isTarget || d < 4000) {
        this.text(`${s.sunk ? '✕ ' : ''}${s.name}${d > 3000 ? ' ' + (d / 1000).toFixed(1) + 'km' : ''}`, p[0], p[1] - 16, col, s.isTarget ? 13 : 11, 'center', s.isTarget);
        if (!s.sunk) {
          const w = 60, f = Math.max(0, s.hp / s.maxHp);
          c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(p[0] - w / 2, p[1] - 6, w, 5);
          c.fillStyle = f > 0.5 ? '#7ee07e' : f > 0.25 ? '#ffd166' : RED; c.fillRect(p[0] - w / 2, p[1] - 6, w * f, 5);
        }
      }
    }
  }

  drawInstruments() {
    const g = this.game, c = this.ctx, pl = g.player, fl = pl.brain, H = this.H;
    const x = 22, y = H - 190;
    c.fillStyle = 'rgba(10,12,10,0.45)'; c.fillRect(x - 10, y - 18, 250, 200);
    const spd = pl.vel.length() * 3.6;
    const alt = pl.pos.y;
    this.text(`速度 ${Math.round(spd).toString().padStart(3)} km/h`, x, y, WHITE, 16, 'left', true);
    this.text(`高度 ${Math.round(alt).toString().padStart(4)} m`, x, y + 22, WHITE, 16, 'left', true);
    this.text(`昇降 ${(pl.vel.y).toFixed(0)} m/s   G ${fl.gload.toFixed(1)}`, x, y + 44, WHITE, 13);
    this.text(`発動機 ${Math.round(pl.throttle * 100)}%  脚 ${fl.gear ? '下' : '上'}`, x, y + 64, WHITE, 13);
    const a = pl.ammo;
    this.text(`7.7mm  ${a[0]}`, x, y + 88, a[0] ? GREEN : RED, 14);
    this.text(`20mm   ${a[1]}`, x + 110, y + 88, a[1] ? GREEN : RED, 14);
    const st = pl.model.userData.stores.filter(s => s.parent);
    const n250 = st.filter(s => s.userData.kind === 250).length, n60 = st.filter(s => s.userData.kind === 60).length;
    this.text(`爆弾 250kg×${n250}  60kg×${n60}`, x, y + 110, st.length ? GREEN : '#888', 14);
    // 機体損傷
    const f = clamp(pl.hp / pl.maxHp, 0, 1);
    this.text('機体', x, y + 134, WHITE, 13);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 36, y + 128, 180, 10);
    c.fillStyle = f > 0.5 ? '#7ee07e' : f > 0.25 ? '#ffd166' : RED; c.fillRect(x + 36, y + 128, 180 * f, 10);
    this.text(`残機 ${'◆'.repeat(Math.max(0, g.lives))}`, x, y + 158, ORANGE, 14);
    if (g.timeScale > 1) this.text(`時間加速 ×${g.timeScale}`, this.W / 2, 92, ORANGE, 16, 'center', true);
    // 警告
    if (fl.stalled) this.text('失 速', this.W / 2, this.H / 2 + 110, RED, 26, 'center', true);
    const gh = g.terrain.groundAt(pl.pos.x, pl.pos.z);
    if (!fl.onGround && pl.vel.y < -5 && (pl.pos.y - gh) / -pl.vel.y < 5) this.text('引き起こせ！', this.W / 2, this.H / 2 + 140, RED, 24, 'center', true);
    if (pl.onFire) this.text('火災発生', this.W / 2, this.H / 2 + 170, RED, 20, 'center', true);
    if (fl.onGround && fl.onGround.kind === 'deck') this.text(g.rearmT > 0 ? `補給中… ${Math.ceil(g.rearmT)}` : '赤城 甲板上 — 発動機全開(Shift)で発艦、S で引き起こし', this.W / 2, this.H / 2 + 80, GREEN, 16, 'center', true);
    const ak = g.akagi;
    if (ak && !fl.onGround && pl.pos.distanceTo(ak.pos) < 3000 && pl.pos.y < 600) this.text('L: 着艦（自動）', this.W / 2, this.H / 2 + 80, GREEN, 15, 'center', true);
  }

  drawCompass() {
    const g = this.game, c = this.ctx, pl = g.player, W = this.W;
    const hdg = (Math.atan2(pl.fwd.x, -pl.fwd.z) * 180 / Math.PI + 360) % 360;
    const cx = W / 2, y = 26;
    c.fillStyle = 'rgba(10,12,10,0.4)'; c.fillRect(cx - 200, y - 14, 400, 30);
    const names = { 0: '北', 45: '北東', 90: '東', 135: '南東', 180: '南', 225: '南西', 270: '西', 315: '北西' };
    for (let a = -90; a <= 90; a += 5) {
      const h = Math.round((hdg + a) / 5) * 5;
      const off = (h - hdg) * 2.1;
      if (Math.abs(off) > 195) continue;
      const hh = ((h % 360) + 360) % 360;
      c.strokeStyle = WHITE; c.beginPath(); c.moveTo(cx + off, y + 10); c.lineTo(cx + off, y + (hh % 15 ? 6 : 2)); c.stroke();
      if (names[hh] !== undefined) this.text(names[hh], cx + off, y - 4, hh % 90 ? WHITE : ORANGE, 13, 'center', true);
      else if (hh % 30 === 0) this.text(String(hh), cx + off, y - 4, '#ccc', 11, 'center');
    }
    c.fillStyle = ORANGE; c.beginPath(); c.moveTo(cx, y + 12); c.lineTo(cx - 6, y + 20); c.lineTo(cx + 6, y + 20); c.fill();
    const t = 7 * 3600 + 40 * 60 + g.missionTime;
    const hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60;
    this.text(`現地時間 ${hh}:${String(mm).padStart(2, '0')}  (昭和16年12月7日)`, cx, y + 36, '#ddd', 12, 'center');
  }

  drawObjectives() {
    const g = this.game, c = this.ctx, W = this.W;
    const x = W - 250, y = 14;
    c.fillStyle = 'rgba(10,12,10,0.45)'; c.fillRect(x - 10, y, 250, 156);
    this.text('作戦目標', x, y + 14, ORANGE, 15, 'left', true);
    const bb = g.stats.bbSunk, cv = g.stats.cvSunk;
    this.text(`戦艦撃沈   ${bb} / 8`, x, y + 38, bb >= 8 ? GREEN : WHITE, 15);
    this.text(`空母撃沈   ${cv} / 3`, x, y + 60, cv >= 3 ? GREEN : WHITE, 15);
    this.text(`撃墜 ${g.stats.kills}  地上撃破 ${g.stats.ground}`, x, y + 84, '#ddd', 13);
    this.text(`戦果 ${g.stats.score} 点   ${fmtTime(g.missionTime)}`, x, y + 106, '#ddd', 13);
    this.text(`米軍機 残存 ${g.usRemaining()} / 400`, x, y + 126, '#ffb0a0', 13);
    this.text(`列機: ${g.wingOrder === 'free' ? '自由戦闘' : '編隊・援護'} (N)`, x, y + 146, BLUE, 12);
  }

  drawMinimap() {
    const g = this.game, c = this.ctx, W = this.W, H = this.H;
    const S = Math.min(240, Math.max(160, W * 0.17));
    const x0 = W - S - 16, y0 = H - S - 16;
    const pl = g.player || g.lastPlayer;
    const range = this.mapZoom === 0 ? TERRAIN.size : this.mapZoom === 1 ? 30000 : 10000;
    const cx = this.mapZoom === 0 ? TERRAIN.x0 + TERRAIN.size / 2 : (pl ? pl.pos.x : 0);
    const cz = this.mapZoom === 0 ? TERRAIN.z0 + TERRAIN.size / 2 + 5000 : (pl ? pl.pos.z : 0);
    const k = S / range;
    const tx = (x, z) => [x0 + S / 2 + (x - cx) * k, y0 + S / 2 + (z - cz) * k];
    c.save();
    c.beginPath(); c.rect(x0, y0, S, S); c.clip();
    c.fillStyle = '#1d4660'; c.fillRect(x0, y0, S, S);
    const mm = g.terrain.minimapCanvas, ms = mm.width / TERRAIN.size;
    const a = tx(TERRAIN.x0, TERRAIN.z0);
    c.globalAlpha = 0.95;
    c.drawImage(mm, a[0], a[1], TERRAIN.size * k, TERRAIN.size * k);
    c.globalAlpha = 1;
    // 侵入ルート
    c.strokeStyle = 'rgba(255,220,120,0.8)'; c.setLineDash([4, 4]); c.lineWidth = 1.5;
    c.beginPath(); [KAHUKU_START, ...ROUTE_WEST].forEach((p, i) => { const q = tx(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
    const q0 = tx(0, 0); c.lineTo(q0[0], q0[1]); c.stroke(); c.setLineDash([]);
    if (this.mapZoom !== 2) for (const l of LANDMARKS) { const q = tx(l.p[0], l.p[1]); this.text(l.name, q[0], q[1], 'rgba(255,255,255,0.7)', 10, 'center'); }
    for (const s of g.ships) {
      if (s.removed) continue;
      const q = tx(s.pos.x, s.pos.z);
      if (s.side === 'jp') c.fillStyle = BLUE;
      else c.fillStyle = s.sunk ? '#777' : s.isTarget ? (s.cls === 'CV' ? '#ff9a3a' : RED) : '#d88';
      const sz = s.isTarget || s.cls === 'CV' ? 4 : 2;
      c.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz);
    }
    for (const o of g.aircraft) {
      if (!o.alive || o === pl) continue;
      const q = tx(o.pos.x, o.pos.z);
      c.fillStyle = o.side === 'us' ? RED : o.wingman ? '#fff' : BLUE;
      c.fillRect(q[0] - 1, q[1] - 1, 2.5, 2.5);
    }
    if (pl) {
      const q = tx(pl.pos.x, pl.pos.z);
      const h = Math.atan2(pl.fwd.x, -pl.fwd.z);
      c.save(); c.translate(q[0], q[1]); c.rotate(h);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fill();
      c.restore();
    }
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.strokeRect(x0, y0, S, S);
    this.text(`地図 (M) ${this.mapZoom === 0 ? '全島' : this.mapZoom === 1 ? '30km' : '10km'}`, x0 + 4, y0 - 9, '#ddd', 11);
    // 赤城の方位
    if (pl && g.akagi) {
      const d = g.akagi.pos.distanceTo(pl.pos);
      this.text(`赤城まで ${(d / 1000).toFixed(1)}km`, x0 + S, y0 - 9, BLUE, 11, 'right');
    }
  }

  drawMessages(dt) {
    let y = 120;
    for (let i = this.msgs.length - 1; i >= 0; i--) { this.msgs[i].t -= dt; if (this.msgs[i].t <= 0) this.msgs.splice(i, 1); }
    for (const m of this.msgs) {
      const a = clamp(m.t, 0, 1);
      this.ctx.globalAlpha = a;
      const col = m.kind === 'big' ? '#ffd166' : m.kind === 'bad' ? RED : m.kind === 'info' ? BLUE : WHITE;
      this.text(m.text, this.W / 2, y, col, m.kind === 'big' ? 24 : 17, 'center', true);
      y += m.kind === 'big' ? 34 : 26;
    }
    this.ctx.globalAlpha = 1;
  }
}
