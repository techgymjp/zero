// 艦艇エンティティ
import * as THREE from 'three';
import { t, shortName } from '../i18n.js';
import { segAABB, rand, randSigned, clamp } from '../util.js';
import { AABattery } from './aa.js';

const _v = new THREE.Vector3();

export class Ship {
  // def: {name, cls, side, model, x, z, heading(deg), target(bool), hp, mover, harbor, aa:{heavy,light}, special}
  constructor(game, def) {
    this.game = game;
    Object.assign(this, { name: def.name, cls: def.cls, side: def.side, isTarget: !!def.target, special: def.special, harbor: !!def.harbor });
    const m = def.model;
    this.model = m; this.group = m.group;
    this.L = m.L; this.B = m.B; this.top = m.top; this.draft = m.draft; this.deckY = m.deckY;
    this.maxHp = def.hp; this.hp = def.hp;
    this.pos = new THREE.Vector3(def.x, 0, def.z);
    this.heading = (def.heading || 0) * Math.PI / 180;
    this.vel = new THREE.Vector3();
    this.mover = def.mover || null;
    if (this.mover) { const st = this.mover(0); this.pos.set(st.x, 0, st.z); this.heading = st.h; }
    this.sunk = false; this.sinkT = 0; this.roll = 0; this.pitch = 0; this.sinkY = 0;
    this.fires = [];
    this.carrier = def.carrier || null; // 飛行甲板情報
    game.scene.add(this.group);
    this._place();
    if (def.aa && (def.aa.heavy || def.aa.light)) {
      this.aa = new AABattery(game, {
        side: this.side, heavy: def.aa.heavy, light: def.aa.light, range: def.aa.range || 4200,
        getPos: (out) => { const p = m.aa.length ? m.aa[Math.floor(rand() * m.aa.length)] : [0, 10, 0]; return this.localToWorld(out.set(p[0], p[1], p[2])); },
        alive: () => !this.sunk,
      });
      game.aa.push(this.aa);
    }
    if (this.mover) {
      this.wake = game.fx.addEmitter({ kind: 'wake', rate: 3, scale: this.B * 0.18, getPos: (v) => {
        if (this.sunk && this.sinkT > 20) return false;
        return !!this.localToWorld(v.set(0, 0, this.L * 0.45));
      } });
    }
  }

  get fwd() { return _v.set(Math.sin(this.heading), 0, -Math.cos(this.heading)); }

  localToWorld(p) {
    // ロール・ピッチ（沈没時）を簡易に含める
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    let x = p.x, y = p.y, z = p.z;
    if (this.roll) { const cr = Math.cos(this.roll), sr = Math.sin(this.roll); const nx = x * cr - y * sr, ny = x * sr + y * cr; x = nx; y = ny; }
    if (this.pitch) { const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch); const ny = y * cp + z * sp, nz = -y * sp + z * cp; y = ny; z = nz; }
    // ローカル: X=左舷(-cos h,0,-sin h), Z=前方(sin h,0,-cos h)
    p.set(this.pos.x + x * -c + z * s, this.pos.y + y, this.pos.z + x * -s + z * -c);
    return p;
  }
  toLocal(p) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    return p.set(dx * -c + dz * -s, p.y - this.pos.y, dx * s - dz * c);
  }
  hitSegment(p0, p1, pad = 0) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const ax = (p0.x - this.pos.x) * -c + (p0.z - this.pos.z) * -s, az = (p0.x - this.pos.x) * s - (p0.z - this.pos.z) * c;
    const bx = (p1.x - this.pos.x) * -c + (p1.z - this.pos.z) * -s, bz = (p1.x - this.pos.x) * s - (p1.z - this.pos.z) * c;
    return segAABB(ax, p0.y - this.pos.y, az, bx, p1.y - this.pos.y, bz, this.B / 2 + pad, -this.draft, this.deckY + 8, this.L / 2 + pad) >= 0;
  }
  distanceToHull(p) {
    const q = this.toLocal(p.clone());
    return Math.hypot(Math.max(Math.abs(q.x) - this.B / 2, 0), Math.max(Math.abs(q.z) - this.L / 2, 0));
  }

  addFire(local, scale = 1) {
    if (this.fires.length >= 7) return;
    const lp = local.clone();
    const e = this.game.fx.addEmitter({ kind: 'fire', rate: 6 * scale, scale, getPos: (v) => {
      if (this.removed) return false;
      this.localToWorld(v.copy(lp));
      if (v.y < 0.5) v.y = 0.5;
      return true;
    } });
    this.fires.push(e);
  }

  damage(amount, point, owner, kind, bombKind, local) {
    if (this.sunk || this.side === 'jp') return;
    const g = this.game;
    if (local === undefined && point) local = this.toLocal(point.clone());
    // アリゾナ: 前部弾薬庫誘爆
    if (this.special === 'arizona' && kind === 'bomb' && bombKind === 250 && local && local.z > this.L * 0.1 && rand() < 0.45) {
      const p = this.localToWorld(new THREE.Vector3(0, 10, this.L * 0.25));
      g.fx.megaExplosion(p); g.audio.explosion(p, 3);
      g.message(t('{n} 誘爆！', { n: shortName(this.name) }), 'big');
      this.hp = 0;
      this.addFire(new THREE.Vector3(0, this.deckY, this.L * 0.25), 3);
      this.addFire(new THREE.Vector3(0, this.deckY, this.L * 0.05), 2.5);
    } else {
      this.hp -= amount;
      if (amount >= 60 && local) {
        local.y = clamp(local.y, this.deckY - 2, this.deckY + 6);
        local.x = clamp(local.x, -this.B * 0.4, this.B * 0.4);
        this.addFire(local, amount > 200 ? 2.2 : 1.4);
      }
    }
    if (owner && owner.isPlayer && kind !== 'gun') owner.stats.shipDamage += amount;
    if (this.hp <= 0) this.sink(owner);
  }

  sink(owner) {
    if (this.sunk) return;
    this.sunk = true; this.hp = 0;
    this.capsize = this.special === 'oklahoma' || (!this.harbor && rand() < 0.3);
    this.rollTarget = this.capsize ? (rand() < 0.5 ? -1 : 1) * 2.6 : randSigned() * 0.18 + (rand() < 0.5 ? 0.12 : -0.12);
    this.pitchTarget = randSigned() * 0.04;
    this.settle = this.harbor ? -(this.deckY - (this.capsize ? 3 : 1.5)) : -(this.top + 40);
    for (let i = 0; i < 3; i++) this.addFire(new THREE.Vector3(randSigned() * this.B * 0.3, this.deckY, randSigned() * this.L * 0.35), 2);
    const p = this.pos.clone(); p.y = this.deckY;
    this.game.fx.explosion(p, 5);
    this.game.audio.explosion(p, 2);
    this.game.onShipSunk(this, owner);
  }

  _place() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = Math.PI - this.heading;
    this.group.rotation.z = -this.roll; // 左舷+X
    this.group.rotation.x = -this.pitch;
  }

  update(dt, time) {
    this._lastH = this.heading;
    if (this.mover && !this.sunk) {
      const prev = this.pos.clone();
      const st = this.mover(time);
      this.pos.x = st.x; this.pos.z = st.z; this.heading = st.h;
      if (dt > 0) this.vel.copy(this.pos).sub(prev).divideScalar(dt);
      if (this.vel.lengthSq() > 900) this.vel.setLength(30);
    } else if (this.sunk) {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 0.3));
      this.pos.addScaledVector(this.vel, dt);
    }
    if (this.sunk && !this.removed) {
      this.sinkT += dt;
      const k = this.harbor ? 0.05 : 0.025;
      this.pos.y += (this.settle - this.pos.y) * Math.min(1, dt * k * (this.capsize ? 1.5 : 1));
      this.roll += (this.rollTarget - this.roll) * Math.min(1, dt * (this.capsize ? 0.07 : 0.05));
      this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, dt * 0.05);
      if (!this.harbor && this.sinkT > 120) { this.removed = true; this.group.visible = false; }
    }
    this._place();
  }
}
