// 航空機エンティティ + 運動学的AI飛行
import * as THREE from 'three';
import { buildZero, buildP40, buildF4F, buildKate, buildVal, DECAL } from '../models/aircraft.js';
import { clamp, rand, randSigned } from '../util.js';
import { AMMO } from './weapons.js';

const G = 9.81;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export const TYPES = {
  zero: { name: '零戦', side: 'jp', hp: 60, radius: 5.5, maxG: 6.5, cruise: 165, maxSpeed: 215, minSpeed: 45, roll: 3.2,
    guns: [{ ammo: 'mg20', rate: 8.5, pos: [[0.22, 0.74, 3.7], [-0.22, 0.74, 3.7]] }], score: 0 }, // 機銃は20mmのみ（照準線に沿って機首上部から発射）
  p40: { name: 'P-40', side: 'us', hp: 55, radius: 5.5, maxG: 5.5, cruise: 165, maxSpeed: 200, minSpeed: 50, roll: 2.6,
    guns: [{ ammo: 'mg50', rate: 13, pos: [[0.3, 0.6, 3.0], [-0.3, 0.6, 3.0], [2.6, -0.4, 2.0], [-2.6, -0.4, 2.0]] }], score: 150 },
  f4f: { name: 'F4F', side: 'us', hp: 65, radius: 5.5, maxG: 5.2, cruise: 160, maxSpeed: 195, minSpeed: 48, roll: 2.4,
    guns: [{ ammo: 'mg50', rate: 13, pos: [[2.4, -0.15, 1.7], [-2.4, -0.15, 1.7], [2.8, -0.15, 1.5], [-2.8, -0.15, 1.5]] }], score: 150 },
  kate: { name: '九七艦攻', side: 'jp', hp: 120, radius: 7, maxG: 3.0, cruise: 130, maxSpeed: 150, minSpeed: 45, roll: 1.6, guns: [], score: 0 },
  val: { name: '九九艦爆', side: 'jp', hp: 120, radius: 7, maxG: 4.5, cruise: 130, maxSpeed: 162, minSpeed: 45, roll: 2.0, guns: [], score: 0 },
};

export function buildModel(type, opts = {}) {
  switch (type) {
    case 'zero': return buildZero(opts);
    case 'p40': return buildP40();
    case 'f4f': return buildF4F();
    case 'kate': return buildKate(opts);
    case 'val': return buildVal();
  }
}

export class Aircraft {
  constructor(game, type, opts = {}) {
    this.game = game; this.type = type; this.spec = TYPES[type];
    this.side = this.spec.side;
    this.model = opts.model || buildModel(type, opts.modelOpts || {});
    game.scene.add(this.model);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.quat = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, 1); this.up = new THREE.Vector3(0, 1, 0);
    this.speed = this.spec.cruise;
    this.maxHp = this.spec.hp * (opts.hpMul || 1); this.hp = this.maxHp;
    this.radius = this.spec.radius;
    this.alive = true; this.falling = false; this.removed = false;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || this.spec.name;
    this.trigger = { mg: false, cannon: false };
    this.gunAcc = this.spec.guns.map(() => 0);
    this.ammo = this.spec.guns.map(g => (g.ammo === 'mg20' ? 250 : 400) * g.pos.length);
    this.lastAttacker = null;
    this.smoke = null; this.onFire = false;
    this.propSpin = 0; this.throttle = 0.8;
    this.brain = null;
    this.ctrl = { p: 0, r: 0, y: 0 };
  }

  setPose(pos, fwd, speed) {
    this.pos.copy(pos); this.fwd.copy(fwd).normalize(); this.speed = speed;
    this.up.set(0, 1, 0);
    this._orient();
    this.vel.copy(this.fwd).multiplyScalar(speed);
  }
  _orient() {
    const x = _v.crossVectors(this.up, this.fwd).normalize();
    const y = _w.crossVectors(this.fwd, x).normalize();
    this.up.copy(y);
    _m.makeBasis(x, y, this.fwd);
    this.quat.setFromRotationMatrix(_m);
  }

  // 運動学的飛行（AI用）: 目標方向・速度へ旋回
  steer(dt, desired, targetSpeed, maxGmul = 1) {
    const s = this.spec;
    const d = _u.copy(desired).normalize();
    // 失速・最大速度
    targetSpeed = clamp(targetSpeed, s.minSpeed + 5, s.maxSpeed * 1.15);
    this.speed += clamp(targetSpeed - this.speed, -12 * dt, 8 * dt);
    this.speed -= G * this.fwd.y * dt * 0.6;
    this.speed = clamp(this.speed, s.minSpeed, s.maxSpeed * 1.35);
    const cosA = clamp(this.fwd.dot(d), -1, 1);
    const ang = Math.acos(cosA);
    const maxTurn = Math.min(1.3, s.maxG * maxGmul * G / Math.max(this.speed, 30));
    const old = _w.copy(this.fwd);
    if (ang > 1e-4) {
      let axis = new THREE.Vector3().crossVectors(this.fwd, d);
      if (axis.lengthSq() < 1e-8) axis.copy(this.up);
      axis.normalize();
      this.fwd.applyAxisAngle(axis, Math.min(ang, maxTurn * dt));
    }
    if (this.fwd.y > 0.9) { this.fwd.y = 0.9; this.fwd.normalize(); }
    if (this.fwd.y < -0.92) { this.fwd.y = -0.92; this.fwd.normalize(); }
    // 協調旋回のバンク
    const acc = old.sub(this.fwd).multiplyScalar(-this.speed / Math.max(dt, 1e-4));
    const want = acc.add(_v.set(0, G, 0));
    want.addScaledVector(this.fwd, -want.dot(this.fwd)).normalize();
    const k = Math.min(1, s.roll * dt * 1.2);
    const upOld = _v.copy(this.up);
    this.up.lerp(want, k).normalize();
    // 舵面表示用の操舵量
    const rollRate = new THREE.Vector3().crossVectors(upOld, this.up).dot(this.fwd) / Math.max(dt, 1e-4);
    const sm = Math.min(1, dt * 6);
    this.ctrl.r += (clamp(rollRate / s.roll, -1, 1) - this.ctrl.r) * sm;
    this.ctrl.p += (clamp(Math.min(ang, maxTurn * dt) / Math.max(dt, 1e-4) / maxTurn, 0, 1) - this.ctrl.p) * sm;
    this._orient();
    this.vel.copy(this.fwd).multiplyScalar(this.speed);
    this.pos.addScaledVector(this.vel, dt);
  }

  damage(d, attacker, explosive) {
    if (!this.alive) return;
    const g = this.game;
    if (this.isPlayer) d *= g.diff.playerDmg;
    this.hp -= d;
    if (attacker) this.lastAttacker = attacker;
    if (this.isPlayer) g.onPlayerHit(d);
    if (!this.smoke && this.hp < this.maxHp * 0.5) {
      this.smoke = g.fx.addEmitter({ kind: 'trail', rate: 12, scale: 1, fire: false, getPos: (v) => { if (this.removed) return false; v.copy(this.pos).addScaledVector(this.fwd, -3); return true; } });
    }
    // 零戦は防弾が弱く、被弾で発火しやすい
    if (this.smoke && !this.onFire && explosive && rand() < (this.side === 'jp' ? 0.35 : 0.2)) { this.onFire = true; this.smoke.fire = true; }
    if (this.hp <= 0) this.kill(attacker);
  }

  kill(attacker) {
    if (!this.alive) return;
    this.alive = false; this.falling = true;
    this.fallSpin = randSigned() * 2.5; this.fallT = 0;
    if (!this.smoke) this.smoke = this.game.fx.addEmitter({ kind: 'trail', rate: 18, scale: 1.4, fire: true, getPos: (v) => { if (this.removed) return false; v.copy(this.pos); return true; } });
    this.smoke.fire = true;
    if (rand() < 0.35) { this.game.fx.explosion(this.pos, 1.5); this.game.audio.explosion(this.pos, 0.6); }
    this.game.onAircraftKilled(this, attacker || this.lastAttacker);
  }

  remove() {
    this.removed = true; this.alive = false;
    this.game.scene.remove(this.model);
  }

  fireGuns(dt) {
    const g = this.game;
    this.spec.guns.forEach((gun, i) => {
      const on = this.trigger.mg;
      if (!on || this.ammo[i] <= 0) { this.gunAcc[i] = Math.min(this.gunAcc[i], 0.99); return; }
      this.gunAcc[i] += dt * gun.rate;
      const a = AMMO[gun.ammo];
      while (this.gunAcc[i] >= 1 && this.ammo[i] > 0) {
        this.gunAcc[i] -= 1;
        for (const lp of gun.pos) {
          if (this.ammo[i] <= 0) break;
          if (!this.isPlayer) this.ammo[i]--; // プレイヤーの機銃弾は無限
          const wp = _v.set(lp[0], lp[1], lp[2]).applyQuaternion(this.quat).add(this.pos);
          // 照準線上 300m に収束
          const conv = _w.copy(this.pos).addScaledVector(this.fwd, 300).addScaledVector(this.up, 0.6);
          const dir = _u.copy(conv).sub(wp).normalize();
          const vel = dir.multiplyScalar(a.speed).add(this.vel);
          g.bullets.fire(wp, vel, this.side, gun.ammo, this, this.isPlayer ? 0.0025 : 0.006);
          if (rand() < 0.5) g.fx.muzzle(wp, 1);
        }
        if (this.isPlayer || this.pos.distanceTo(g.camera.position) < 800) g.audio.gun(gun.ammo, this.pos, this.isPlayer);
      }
    });
  }

  update(dt) {
    const g = this.game;
    if (this.removed) return;
    if (this.falling) {
      this.fallT += dt;
      this.vel.y -= G * dt;
      this.vel.multiplyScalar(1 - 0.05 * dt);
      this.pos.addScaledVector(this.vel, dt);
      _q.setFromAxisAngle(this.fwd, this.fallSpin * dt); this.quat.premultiply(_q);
      this.fwd.set(0, 0, 1).applyQuaternion(this.quat);
      const gh = g.terrain.groundAt(this.pos.x, this.pos.z);
      if (this.pos.y <= gh + 1 || this.fallT > 40) {
        if (gh <= 0.01) g.fx.splash(this.pos, 3); else { g.fx.explosion(this.pos, 2.2); g.fx.addEmitter({ kind: 'fire', rate: 3, scale: 0.8, ttl: 40, getPos: (v) => !!v.set(this.pos.x, gh, this.pos.z) }); }
        g.audio.explosion(this.pos, 0.8);
        this.remove();
        if (this.isPlayer) g.onPlayerCrashed();
        return;
      }
    } else {
      if (this.brain) this.brain.update(dt);
      if (this.removed) return;
      if (this.spec.guns.length) this.fireGuns(dt);
      // 地面衝突
      if (!this.isPlayer) {
        const gh = g.terrain.groundAt(this.pos.x, this.pos.z);
        if (this.pos.y < gh + 2) { this.kill(null); }
      }
    }
    this.model.position.copy(this.pos);
    this.model.quaternion.copy(this.quat);
    const cs = this.model.userData.ctrl;
    if (cs) {
      let p = this.ctrl.p, r = this.ctrl.r, y = this.ctrl.y;
      if (this.isPlayer && g.input) { p = g.input.pitch; r = g.input.roll; y = g.input.yaw; }
      cs.ailL.children[0].rotation.x = -r * 0.35; cs.ailR.children[0].rotation.x = r * 0.35;
      cs.elL.children[0].rotation.x = cs.elR.children[0].rotation.x = p * 0.4;
      cs.rud.children[0].rotation.y = y * 0.4;
    }
    const pr = this.model.userData.prop;
    if (pr) {
      this.propSpin += dt * (40 + this.throttle * 120);
      pr.userData.blades.rotation.z = this.propSpin;
      const fast = !this.falling;
      pr.userData.disc.visible = fast;
      pr.userData.blades.visible = !fast || this.game.camMode === 'cockpit' ? true : (this.pos.distanceTo(g.camera.position) < 60 ? (Math.floor(this.propSpin * 3) % 2 === 0) : false);
    }
  }
}
