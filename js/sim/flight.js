// プレイヤー機の飛行力学（零戦二一型を基準）
import * as THREE from 'three';
import { t } from '../i18n.js';
import { clamp, lerp, DEG } from '../util.js';

const G = 9.81;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const P = {
  mass: 2410, S: 22.44, CLa: 4.9, CLmax: 1.38, stall: 15.5 * DEG, Cd0: 0.021, K: 0.055,
  power: 1900000, eff: 0.8, Tstatic: 17000, gearDrag: 0.012, gearH: 1.95,
};

export class PlayerFlight {
  constructor(ac, game) {
    this.ac = ac; this.game = game;
    this.omega = new THREE.Vector3(); // 機体軸角速度 (x:ピッチ, y:ヨー, z:ロール)
    this.onGround = null; // {kind:'deck'|'land', ship}
    this.gear = false;
    this.aoa = 0; this.slip = 0; this.gload = 1; this.stalled = false;
    this.ac.throttle = 0.85;
    this.groundPitch = 11 * DEG; this.groundYaw = 0;
    this.arrest = false;
  }

  massTotal() {
    let m = P.mass;
    for (const s of this.ac.model.userData.stores || []) if (s.parent) m += s.userData.kind === 250 ? 250 : 60;
    return m;
  }

  surfaceAt(x, z) {
    const g = this.game;
    for (const s of g.ships) {
      if (!s.carrier || s.sunk) continue;
      const c = s.carrier;
      const q = s.toLocal(_w.set(x, 0, z));
      if (Math.abs(q.x) < c.deckW / 2 && Math.abs(q.z - c.deckZ) < c.deckL / 2) return { y: s.pos.y + c.deckY, kind: 'deck', ship: s, local: q.clone() };
    }
    const water = g.terrain.isWater(x, z);
    return { y: water ? 0 : g.terrain.heightAt(x, z), kind: water ? 'water' : 'land' };
  }

  update(dt) {
    const ac = this.ac, g = this.game, inp = g.input;
    // 入力
    const pitchIn = inp.pitch, rollIn = inp.roll, yawIn = inp.yaw;
    if (inp.touch) {
      // スマホ: 「加速」長押しで全開、離すと巡航出力（甲板上では停止）
      const tgt = inp.touch.boost ? 1 : (this.onGround ? 0 : 0.72);
      ac.throttle = clamp(ac.throttle + clamp(tgt - ac.throttle, -0.5 * dt, 0.8 * dt), 0, 1);
    } else ac.throttle = clamp(ac.throttle + inp.throttle * dt * 0.6, 0, 1);
    if (inp.gearToggle) { this.gear = !this.gear; g.message(t(this.gear ? '脚下げ' : '脚上げ')); }
    if (ac.model.userData.gear) ac.model.userData.gear.visible = this.gear;
    ac.trigger.mg = inp.fireMG; ac.trigger.cannon = inp.fireCannon;

    if (this.onGround) return this.groundUpdate(dt, pitchIn, yawIn, rollIn);

    const rho = 1.225 * Math.exp(-ac.pos.y / 8500);
    const V = Math.max(ac.vel.length(), 1);
    const qd = 0.5 * rho * V * V;
    // 機体座標の速度
    const invQ = _q.copy(ac.quat).invert();
    const vb = _v.copy(ac.vel).applyQuaternion(invQ);
    this.aoa = Math.atan2(-vb.y, vb.z);
    this.slip = Math.atan2(vb.x, vb.z);
    const a = this.aoa;
    let CL;
    if (Math.abs(a) < P.stall) CL = P.CLa * a;
    else CL = Math.sign(a) * P.CLmax * Math.max(0.35, 1 - (Math.abs(a) - P.stall) * 2.5);
    CL = clamp(CL, -P.CLmax, P.CLmax);
    this.stalled = Math.abs(a) > P.stall && V > 15;
    const m = this.massTotal();
    // 揚力（速度に垂直、機体上方向側）
    const velDir = _w.copy(ac.vel).normalize();
    const bodyUp = _f.set(0, 1, 0).applyQuaternion(ac.quat);
    const liftDir = bodyUp.addScaledVector(velDir, -bodyUp.dot(velDir)).normalize();
    const L = qd * P.S * CL;
    const F = new THREE.Vector3().addScaledVector(liftDir, L);
    // 抗力
    const Cd = P.Cd0 + P.K * CL * CL + (this.gear ? P.gearDrag : 0) + (ac.model.userData.stores?.filter(s => s.parent).length || 0) * 0.002;
    F.addScaledVector(velDir, -qd * P.S * Cd);
    // 横力
    const bodyX = new THREE.Vector3(1, 0, 0).applyQuaternion(ac.quat);
    F.addScaledVector(bodyX, -Math.sin(this.slip) * qd * P.S * 0.9);
    // 推力（栄一二型 950馬力）
    const thrust = ac.throttle * Math.min(P.Tstatic, P.power * P.eff / V) * Math.pow(rho / 1.225, 0.6);
    F.addScaledVector(ac.fwd, thrust);
    F.y -= m * G;
    const acc = F.divideScalar(m);
    this.gload = L / (m * G);
    ac.vel.addScaledVector(acc, dt);
    ac.pos.addScaledVector(ac.vel, dt);

    // 回転: 入力→目標角速度。高速では舵が重くなる（零戦の特性）
    const eff = clamp(qd / 3500, 0.08, 1) * (1 - clamp((V - 165) / 90, 0, 0.45));
    const stallK = this.stalled ? 0.35 : 1;
    const target = new THREE.Vector3(-pitchIn * 1.5 * eff * stallK, -yawIn * 0.45 * eff, rollIn * 3.3 * eff * stallK);
    this.omega.lerp(target, Math.min(1, dt * 7));
    // 安定性（機首を速度方向へ）
    const vbn = vb.normalize();
    const kStab = 5.0 * clamp(qd / 3500, 0.15, 1.2);
    const stab = new THREE.Vector3(vbn.y * kStab * 1.0, -vbn.x * kStab * 0.8, 0);
    const w = new THREE.Vector3(this.omega.x - stab.x * -1, this.omega.y + stab.y * -1, this.omega.z);
    // stab: vb.y>0 → 速度が上向き → 機首上げ（x回転負）
    // 自動トリム: 1G 水平飛行に必要な迎角へ機首を保つ
    const aoaTrim = clamp(m * (G - 0.25 * ac.vel.y) / Math.max(qd * P.S * P.CLa, 1), -0.02, 0.1);
    w.x = this.omega.x - (vbn.y + Math.sin(aoaTrim)) * kStab; w.y = this.omega.y + vbn.x * kStab;
    if (this.stalled) { w.x += 0.4; w.z += Math.sin(g.time * 3) * 0.6; }
    const ang = w.length();
    if (ang > 1e-6) {
      _q.setFromAxisAngle(w.clone().divideScalar(ang), ang * dt);
      ac.quat.multiply(_q).normalize();
    }
    ac.fwd.set(0, 0, 1).applyQuaternion(ac.quat);
    ac.up.set(0, 1, 0).applyQuaternion(ac.quat);
    ac.speed = ac.vel.length();

    // 接地判定
    const surf = this.surfaceAt(ac.pos.x, ac.pos.z);
    const h = ac.pos.y - surf.y;
    if (h < P.gearH) {
      const relV = surf.ship ? _v.copy(ac.vel).sub(surf.ship.vel) : _v.copy(ac.vel);
      const pitch = Math.asin(clamp(ac.fwd.y, -1, 1));
      const roll = Math.atan2(-ac.up.x * ac.fwd.z + ac.up.z * ac.fwd.x, ac.up.y);
      const ok = this.gear && surf.kind !== 'water' && relV.y > -5.5 && Math.abs(roll) < 0.4 && pitch > -0.12 && relV.length() < 75;
      if (ok) {
        this.onGround = surf;
        this.groundYaw = Math.atan2(ac.fwd.x, ac.fwd.z);
        this.groundPitch = clamp(pitch, 0, 13 * DEG);
        this.arrest = surf.kind === 'deck' && relV.length() > 20;
        ac.pos.y = surf.y + P.gearH;
        g.onTouchdown(surf, this.arrest);
      } else if (h < 0.4) {
        g.playerCrash(t(surf.kind === 'water' ? '海面に墜落' : surf.kind === 'deck' ? '着艦失敗' : '地面に激突'));
      }
    }
  }

  groundUpdate(dt, pitchIn, yawIn, rollIn) {
    const ac = this.ac, g = this.game;
    const surf = this.surfaceAt(ac.pos.x, ac.pos.z);
    const ship = surf.ship;
    if (surf.kind === 'water') { this.onGround = null; return; }
    const base = ship ? ship.vel : _w.set(0, 0, 0);
    const rel = _v.copy(ac.vel).sub(base); rel.y = 0;
    let vs = rel.length();
    // 甲板上では艦に固定（回頭しても滑り落ちない）
    if (ship) {
      if (!this.deckLocal || this.deckShip !== ship) { this.deckLocal = ship.toLocal(ac.pos.clone()); this.deckShip = ship; }
      ac.pos.copy(ship.localToWorld(this.deckLocal.clone()));
    } else this.deckLocal = null;
    const dir = _f.set(Math.sin(this.groundYaw), 0, Math.cos(this.groundYaw));
    // 前進成分
    let fwdSpeed = rel.dot(dir);
    const thrust = ac.throttle * P.Tstatic / this.massTotal();
    let decel = 0.4 + (ac.throttle < 0.05 ? 3.5 : 0);
    if (this.arrest) { decel = 14; if (fwdSpeed < 2) { this.arrest = false; } }
    fwdSpeed += (thrust - decel * Math.sign(fwdSpeed)) * dt;
    if (ac.throttle < 0.05 && Math.abs(fwdSpeed) < 0.5) fwdSpeed = 0;
    // 艦の回頭に追従
    if (ship) this.groundYaw += (ship._lastH !== undefined ? ship.heading - ship._lastH : 0) * -1;
    this.groundYaw -= yawIn * dt * clamp(0.9 - fwdSpeed * 0.01, 0.2, 0.9) - rollIn * dt * 0.2;
    ac.vel.copy(dir).multiplyScalar(fwdSpeed).add(base);
    if (ship) { ac.pos.addScaledVector(dir, fwdSpeed * dt); this.deckLocal = ship.toLocal(ac.pos.clone()); }
    else ac.pos.addScaledVector(ac.vel, dt);
    ac.pos.y = surf.y + P.gearH;
    // 姿勢（尾輪式）
    const V = fwdSpeed;
    const tailUp = clamp((V - 18) / 14, 0, 1);
    let target = lerp(11 * DEG, 2 * DEG, tailUp) - pitchIn * 0;
    if (pitchIn > 0.2 && V > 28) target = 13 * DEG;
    this.groundPitch += (target - this.groundPitch) * Math.min(1, dt * 3);
    _q.setFromEuler(_e.set(-this.groundPitch, this.groundYaw, 0, 'YXZ'));
    ac.quat.copy(_q);
    ac.fwd.set(0, 0, 1).applyQuaternion(ac.quat);
    ac.up.set(0, 1, 0).applyQuaternion(ac.quat);
    ac.speed = ac.vel.length();
    // 離陸: 揚力が重量を超えたら
    const airV = ac.vel.length();
    const qd = 0.5 * 1.225 * airV * airV;
    const lift = qd * P.S * P.CLa * this.groundPitch;
    if (lift > this.massTotal() * G * 1.02 && pitchIn > 0.1) {
      this.onGround = null; this.deckLocal = null;
      ac.vel.y = 1.5;
      g.onTakeoff();
      return;
    }
    // 甲板から外れた
    if (ship && surf.kind !== 'deck') { this.onGround = null; this.deckLocal = null; }
    if (!ship && (surf.kind !== 'land')) this.onGround = null;
    if (!this.onGround && ship) { /* 艦首から飛び出した */ }
    this.aoa = 0; this.gload = 1; this.stalled = false;
  }
}
