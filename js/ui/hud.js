// ヘッドアップ表示・ミニマップ
import * as THREE from 'three';
import { t, nm } from '../i18n.js';
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
    this.mapZoom = 1; // 最初は 25km 表示（出撃直後からオアフ島が見える）
    this.hitFlash = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.W = innerWidth; this.H = innerHeight;
    this.compact = this.forceCompact || innerHeight < 560 || innerWidth < 900;
    this.portrait = innerWidth < 600; // 縦向き: 方位の目盛りを2段目に下ろし、上段の枠を詰める
  }
  message(text, kind = 'normal') {
    if (this.msgs.length && this.msgs[0].text === text) { this.msgs[0].t = kind === 'big' ? 3.5 : 2.5; return; }
    this.msgs.unshift({ text, kind, t: kind === 'big' ? 3.5 : 2.5 });
    if (this.msgs.length > 2) this.msgs.length = 2;
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
    c.font = `${bold ? '800' : '600'} ${size}px "Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.strokeText(s, x, y);
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
      }
    }
    // 爆撃照準
    const stores = pl.model.userData.stores.filter(s => s.parent);
    const agl = pl.pos.y - g.terrain.groundAt(pl.pos.x, pl.pos.z);
    const aiming = !pl.brain.onGround && agl > 150 && agl < 3500 && pl.fwd.y < -0.05 && !(g.akagi && pl.pos.distanceTo(g.akagi.pos) < 3000);
    if (stores.length && aiming) {
      const ip = predictImpact(pl.pos, pl.vel, g.terrain, new THREE.Vector3());
      if (ip) {
        const sp = this.project(ip);
        if (sp) {
          let onShip = false;
          for (const s of g.ships) if (s.side === 'us' && s.isTarget && !s.sunk && s.distanceToHull(ip) < 4) onShip = true;
          if (!onShip) return; // 命中コースのときだけ表示
          c.strokeStyle = RED; c.lineWidth = 2.5;
          c.beginPath(); c.moveTo(sp[0], sp[1] - 10); c.lineTo(sp[0] + 10, sp[1]); c.lineTo(sp[0], sp[1] + 10); c.lineTo(sp[0] - 10, sp[1]); c.closePath(); c.stroke();
        }
      }
    }
  }

  // 目標の印（文字は出さない: 敵や艦が文字に隠れないように）
  drawMarkers() {
    const g = this.game, c = this.ctx, pl = g.player;
    for (const o of g.aircraft) {
      if (!o.alive || o === pl) continue;
      const d = o.pos.distanceTo(pl.pos);
      if (d > 6000) continue;
      const p = this.project(o.pos);
      if (!p) continue;
      const s = clamp(1800 / d, 5, this.compact ? 10 : 16);
      if (o.side === 'us') {
        // 敵機: 四隅のカギ括弧（爆撃照準の赤い◇と見分けやすく）
        const k = Math.max(3, s * 0.45);
        c.strokeStyle = RED; c.lineWidth = 1.5; c.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x0 = p[0] + sx * s, y0 = p[1] + sy * s;
          c.moveTo(x0 - sx * k, y0); c.lineTo(x0, y0); c.lineTo(x0, y0 - sy * k);
        }
        c.stroke();
      } else {
        const ss = Math.min(s, 7);
        c.strokeStyle = o.wingman ? 'rgba(197,231,255,0.8)' : 'rgba(127,198,255,0.6)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(p[0], p[1] - ss); c.lineTo(p[0] + ss, p[1] + ss); c.lineTo(p[0] - ss, p[1] + ss); c.closePath(); c.stroke();
      }
    }
    for (const s of g.ships) {
      if (s.removed || s.sunk) continue;
      const isAkagi = s === g.akagi;
      if (!isAkagi && !(s.side === 'us' && s.isTarget)) continue;
      const d = s.pos.distanceTo(pl.pos);
      if (d > 30000 || (isAkagi && d < 1500)) continue;
      const p = this.project(_w.copy(s.pos).setY(s.deckY + 25));
      if (!p) continue;
      c.lineWidth = 1.5;
      if (isAkagi) {
        // 赤城: 小さな青い▼
        c.fillStyle = 'rgba(127,198,255,0.85)';
        c.beginPath(); c.moveTo(p[0] - 5, p[1] - 8); c.lineTo(p[0] + 5, p[1] - 8); c.lineTo(p[0], p[1]); c.closePath(); c.fill();
        continue;
      }
      // 攻撃目標（戦艦・空母）: 小さな◇（艦の少し上）
      const q = 5;
      c.strokeStyle = s.cls === 'CV' ? 'rgba(255,170,80,0.9)' : 'rgba(255,209,102,0.9)';
      c.beginPath(); c.moveTo(p[0], p[1] - q - 6); c.lineTo(p[0] + q, p[1] - 6); c.lineTo(p[0], p[1] + q - 6); c.lineTo(p[0] - q, p[1] - 6); c.closePath(); c.stroke();
    }
  }

  drawInstrumentsCompact() {
    const g = this.game, c = this.ctx, pl = g.player, fl = pl.brain;
    const x = 10, y = 16, pw = this.portrait ? 140 : 172;
    c.fillStyle = 'rgba(10,12,10,0.3)'; c.fillRect(x - 6, y - 12, pw, 46);
    this.text(`${Math.round(pl.vel.length() * 3.6)}km/h ${Math.round(pl.pos.y)}m`, x, y, WHITE, this.portrait ? 15 : 16, 'left', true);
    this.text(t('残機 {l}', { l: '◆'.repeat(Math.max(0, g.lives)) }), x, y + 21, ORANGE, 14, 'left', true);
    this.drawWarnings();
  }

  // 爆弾・機銃弾の残り（ボタン表示）と、使い切ったときの表示・赤城への帰還矢印
  drawSupply() {
    const g = this.game, pl = g.player, fl = pl.brain, c = this.ctx;
    const bombs = pl.model.userData.stores.filter(s => s.parent).length;
    g.input.touchUI?.setCounts(bombs);
    const noBomb = bombs === 0;
    // 使い切った瞬間に大きく知らせる（機銃弾は無限）
    if (noBomb && !this._noBomb) g.message(t('爆弾切れ — 赤城へ帰還せよ'), 'big');
    this._noBomb = noBomb;
    if (!this.compact) this.text(t('爆弾 {b}', { b: bombs }), 22, this.H - 96, bombs ? GREEN : RED, 14, 'left', true);
    if (!noBomb || fl.onGround || !g.akagi) return;
    // 常時表示
    const label = t('爆弾切れ');
    const blink = 0.55 + 0.45 * Math.sin(performance.now() / 180);
    const ty = this.H - (this.portrait ? 150 : 30); // 画面の下中央（矢印と重ならない位置）
    c.globalAlpha = 0.6 + 0.4 * blink;
    this.text(label, this.W / 2, ty, RED, this.compact ? 18 : 20, 'center', true);
    // 赤城の方向を指す矢印（照準の周り）
    const ak = g.akagi;
    const bearing = Math.atan2(ak.pos.x - pl.pos.x, -(ak.pos.z - pl.pos.z));
    const hdg = Math.atan2(pl.fwd.x, -pl.fwd.z);
    const rel = bearing - hdg;
    const cx = this.W / 2, cy = this.H / 2, r = this.compact ? 78 : 95;
    const ax = cx + Math.sin(rel) * r, ay = cy - Math.cos(rel) * r;
    c.save(); c.translate(ax, ay); c.rotate(rel);
    c.fillStyle = `rgba(110,200,255,${0.5 + 0.5 * blink})`; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 3;
    const k = this.compact ? 1 : 1.2;
    c.beginPath(); c.moveTo(0, -22 * k); c.lineTo(16 * k, 6 * k); c.lineTo(6 * k, 6 * k); c.lineTo(6 * k, 20 * k); c.lineTo(-6 * k, 20 * k); c.lineTo(-6 * k, 6 * k); c.lineTo(-16 * k, 6 * k); c.closePath();
    c.stroke(); c.fill();
    c.restore();
    const d = ak.pos.distanceTo(pl.pos);
    this.text(t('赤城 {d}km', { d: (d / 1000).toFixed(1) }), ax + Math.sin(rel) * 34, ay - Math.cos(rel) * 34, '#a8dcff', 14, 'center', true);
    c.globalAlpha = 1;
  }

  drawWarnings() {
    const g = this.game, pl = g.player, fl = pl.brain;
    this.drawSupply();
    if (fl.stalled) this.text(t('失 速'), this.W / 2, this.H / 2 + 90, RED, 24, 'center', true);
    const gh = g.terrain.groundAt(pl.pos.x, pl.pos.z);
    if (!fl.onGround && pl.vel.y < -5 && (pl.pos.y - gh) / -pl.vel.y < 5) this.text(t('引き起こせ！'), this.W / 2, this.H / 2 + 118, RED, 22, 'center', true);
    if (pl.onFire) this.text(t('火災発生'), this.W / 2, this.H / 2 + 146, RED, 18, 'center', true);
    const ak = g.akagi;
    const canLand = !!ak && !fl.onGround && pl.pos.distanceTo(ak.pos) < 3000 && pl.pos.y < 600;
    g.input.touchUI?.setLand(canLand);
    if (canLand && !g.input.touchUI) this.text(t('L: 着艦（自動）'), this.W / 2, this.H / 2 + 64, GREEN, 15, 'center', true);
  }

  drawInstruments() {
    if (this.compact) return this.drawInstrumentsCompact();
    const g = this.game, c = this.ctx, pl = g.player, fl = pl.brain, H = this.H;
    const x = 22, y = H - 72;
    c.fillStyle = 'rgba(10,12,10,0.35)'; c.fillRect(x - 10, y - 18, 230, 78);
    const spd = pl.vel.length() * 3.6;
    this.text(t('速度 {v} km/h', { v: Math.round(spd).toString().padStart(3) }), x, y, WHITE, 16, 'left', true);
    this.text(t('高度 {v} m', { v: Math.round(pl.pos.y).toString().padStart(4) }), x, y + 22, WHITE, 16, 'left', true);
    this.text(t('残機 {l}', { l: '◆'.repeat(Math.max(0, g.lives)) }), x, y + 46, ORANGE, 14);
    this.drawWarnings();
  }

  drawCompass() {
    const g = this.game, c = this.ctx, pl = g.player, W = this.W;
    const hdg = (Math.atan2(pl.fwd.x, -pl.fwd.z) * 180 / Math.PI + 360) % 360;
    const k = this.compact ? 1.4 : 1;          // スマホでは大きく
    const cx = W / 2, y = this.portrait ? 82 : this.compact ? 30 : 26;
    const cw = this.portrait ? Math.min(130, W / 2 - 60) : this.compact ? 130 : 200;
    const sc = this.compact ? 2.6 : 2.1;       // 1度あたりの幅
    c.fillStyle = 'rgba(10,12,10,0.4)'; c.fillRect(cx - cw, y - 14 * k, cw * 2, 30 * k);
    const names = { 0: '北', 45: '北東', 90: '東', 135: '南東', 180: '南', 225: '南西', 270: '西', 315: '北西' };
    c.lineWidth = this.compact ? 2 : 1;
    for (let a = -90; a <= 90; a += 5) {
      const h = Math.round((hdg + a) / 5) * 5;
      const off = (h - hdg) * sc;
      if (Math.abs(off) > cw - 5) continue;
      const hh = ((h % 360) + 360) % 360;
      c.strokeStyle = WHITE; c.beginPath(); c.moveTo(cx + off, y + 10 * k); c.lineTo(cx + off, y + (hh % 15 ? 6 : 1) * k); c.stroke();
      if (names[hh] !== undefined) this.text(t(names[hh]), cx + off, y - 4 * k, hh % 90 ? WHITE : ORANGE, 13 * k, 'center', true);
      else if (hh % 30 === 0) this.text(String(hh), cx + off, y - 4 * k, '#ddd', this.compact ? 14 : 11, 'center', this.compact);
    }
    c.lineWidth = 1;
    c.fillStyle = ORANGE; c.beginPath(); c.moveTo(cx, y + 12 * k); c.lineTo(cx - 6 * k, y + 20 * k); c.lineTo(cx + 6 * k, y + 20 * k); c.fill();
    const tm = 7 * 3600 + 40 * 60 + g.missionTime;
    const hh = Math.floor(tm / 3600), mm = Math.floor(tm / 60) % 60;
    if (!this.compact) this.text(t('現地時間 {t}  (昭和16年12月7日)', { t: `${hh}:${String(mm).padStart(2, '0')}` }), cx, y + 36, '#ddd', 12, 'center');
  }

  drawObjectives() {
    const g = this.game, c = this.ctx, W = this.W;
    if (this.compact) {
      const pw = this.portrait ? 178 : 212, f1 = this.portrait ? 17 : 20, f2 = this.portrait ? 16 : 19;
      const x = W - pw, y = this.portrait ? 18 : 20;
      c.fillStyle = 'rgba(10,12,10,0.3)'; c.fillRect(x - 9, y - 15, pw, this.portrait ? 54 : 66);
      this.text(t('戦艦 {a}/8  空母 {b}/3', { a: g.stats.bbSunk, b: g.stats.cvSunk }), x, y, WHITE, f1, 'left', true);
      this.text(t('米軍機 {n}', { n: g.usRemaining() }), x, y + (this.portrait ? 23 : 28), '#ffb0a0', f2, 'left', true);
      return;
    }
    const x = W - 178, y = 14;
    c.fillStyle = 'rgba(10,12,10,0.35)'; c.fillRect(x - 10, y, 174, 118);
    const bb = g.stats.bbSunk, cv = g.stats.cvSunk;
    this.text(t('戦艦撃沈   {n} / 8', { n: bb }), x, y + 16, bb >= 8 ? GREEN : WHITE, 15);
    this.text(t('空母撃沈   {n} / 3', { n: cv }), x, y + 38, cv >= 3 ? GREEN : WHITE, 15);
    this.text(t('撃墜 {k}  地上撃破 {g}', { k: g.stats.kills, g: g.stats.ground }), x, y + 62, '#ddd', 13);
    this.text(t('戦果 {s} 点   {t}', { s: g.stats.score, t: fmtTime(g.missionTime) }), x, y + 84, '#ddd', 13);
    this.text(t('米軍機 残存 {n} / 400', { n: g.usRemaining() }), x, y + 104, '#ffb0a0', 13);
  }

  drawMinimap() {
    const g = this.game, c = this.ctx, W = this.W, H = this.H;
    const S = this.portrait ? Math.min(150, W * 0.33) : this.compact ? Math.min(180, H * 0.42) : Math.min(240, Math.max(160, W * 0.17));
    // スマホ: 左上（速度パネルの直下）、PC: 右下
    const x0 = this.compact ? 10 : W - S - 16, y0 = this.portrait ? 130 : this.compact ? 68 : H - S - 16;
    const pl = g.player || g.lastPlayer;
    const range = this.mapZoom === 0 ? TERRAIN.size : this.mapZoom === 1 ? 25000 : 12000;
    const cx = this.mapZoom === 0 ? TERRAIN.x0 + TERRAIN.size / 2 : (pl ? pl.pos.x : 0);
    const cz = this.mapZoom === 0 ? -2000 : (pl ? pl.pos.z : 0); // 全島表示は島全体と南の米空母まで入れる
    const k = S / range;
    const tx = (x, z) => [x0 + S / 2 + (x - cx) * k, y0 + S / 2 + (z - cz) * k];
    this.mapRect = { x: x0, y: y0, w: S, h: S };
    c.save();
    c.beginPath(); c.rect(x0, y0, S, S); c.clip();
    c.fillStyle = '#1d4660'; c.fillRect(x0, y0, S, S);
    const mm = g.terrain.minimapCanvas, ms = mm.width / TERRAIN.size;
    const a = tx(TERRAIN.x0, TERRAIN.z0);
    c.globalAlpha = this.compact ? 0.7 : 0.95;
    c.drawImage(mm, a[0], a[1], TERRAIN.size * k, TERRAIN.size * k);
    c.globalAlpha = 1;
    // 侵入ルート
    c.strokeStyle = 'rgba(255,220,120,0.8)'; c.setLineDash([4, 4]); c.lineWidth = 1.5;
    // 進軍ルートの目安: 赤城の現在地 → 真珠湾
    const start = g.akagi ? [g.akagi.pos.x, g.akagi.pos.z] : KAHUKU_START;
    c.beginPath(); { const a = tx(start[0], start[1]), q0 = tx(0, 0); c.moveTo(a[0], a[1]); c.lineTo(q0[0], q0[1]); }
    c.stroke(); c.setLineDash([]);
    if (this.mapZoom !== 2) for (const l of LANDMARKS) { const q = tx(l.p[0], l.p[1]); this.text(nm(l.name), q[0], q[1], 'rgba(255,255,255,0.7)', 10, 'center'); }
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
    if (!this.compact) this.text(t('地図 (M) {z}', { z: this.mapZoom === 1 ? '25km' : '12km' }), x0 + 4, y0 - 9, '#ddd', 11);
    // 赤城の方位
    if (pl && g.akagi) {
      const d = g.akagi.pos.distanceTo(pl.pos);
      if (this.compact) this.text(t('赤城 {d}km', { d: (d / 1000).toFixed(1) }), x0 + 2, y0 - 9, BLUE, 12);
      else this.text(t('赤城まで {d}km', { d: (d / 1000).toFixed(1) }), x0 + S, y0 - 9, BLUE, 11, 'right');
    }
  }

  drawMessages(dt) {
    let y = this.portrait ? 145 : this.compact ? 104 : 120;
    // 縦向きは地図（左）の右側の空きに表示
    const mx = this.portrait ? (this.mapRect ? (this.mapRect.x + this.mapRect.w + this.W) / 2 : this.W / 2) : this.W / 2;
    for (let i = this.msgs.length - 1; i >= 0; i--) { this.msgs[i].t -= dt; if (this.msgs[i].t <= 0) this.msgs.splice(i, 1); }
    for (const m of this.msgs) {
      const a = clamp(m.t, 0, 1);
      this.ctx.globalAlpha = a;
      const col = m.kind === 'big' ? '#ffe08a' : m.kind === 'bad' ? '#ff7a6a' : m.kind === 'info' ? '#a8dcff' : '#ffffff';
      const size = this.portrait ? (m.kind === 'big' ? 16 : 14) : this.compact ? (m.kind === 'big' ? 18 : 15) : (m.kind === 'big' ? 26 : 20);
      const c = this.ctx;
      c.font = `900 ${size}px "Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(m.text, mx, y);
      c.fillStyle = col; c.fillText(m.text, mx, y);
      y += size + 12;
    }
    this.ctx.globalAlpha = 1;
  }
}
