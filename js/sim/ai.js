// AI: 戦闘機・攻撃機
import * as THREE from 'three';
import { clamp, rand, randSigned, gauss } from '../util.js';
import { predictImpact } from './weapons.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3();

function avoidTerrain(ac, desired, minAlt = 120) {
  const g = ac.game;
  let worst = 0;
  for (const t of [1.5, 3, 5]) {
    const px = ac.pos.x + ac.vel.x * t, pz = ac.pos.z + ac.vel.z * t, py = ac.pos.y + ac.vel.y * t;
    const gh = g.terrain.groundAt(px, pz);
    worst = Math.max(worst, gh + minAlt - py);
  }
  const ghNow = g.terrain.groundAt(ac.pos.x, ac.pos.z);
  worst = Math.max(worst, ghNow + minAlt * 0.6 - ac.pos.y);
  if (worst > 0) {
    desired.normalize();
    desired.y = Math.max(desired.y, clamp(worst / 150, 0.15, 0.8));
  }
  return desired;
}

// ---------- 戦闘機 ----------
export class FighterBrain {
  // opts: {role:'wingman'|'cap'|'strafe'|'escort', leader, slot:Vector3, field:{x,z,id}, home:[x,z]}
  constructor(ac, opts = {}) {
    this.ac = ac; Object.assign(this, opts);
    this.target = null; this.think = rand() * 0.5;
    this.evadeT = 0; this.evadeDir = new THREE.Vector3();
    this.noise = new THREE.Vector3(); this.noiseT = 0;
    this.fireHold = 0;
    this.strafeTarget = null; this.strafePhase = 'approach';
    this.patrol = new THREE.Vector3(opts.home ? opts.home[0] : 0, 1500, opts.home ? opts.home[1] : 0);
  }

  pickTarget() {
    const ac = this.ac, g = ac.game;
    let best = null, bs = Infinity;
    const range = this.role === 'wingman' ? (g.wingOrder === 'free' ? 3500 : 1800) : 7000;
    const ref = this.role === 'wingman' && this.leader && this.leader.alive ? this.leader.pos : ac.pos;
    for (const o of g.aircraft) {
      if (!o.alive || o.side === ac.side) continue;
      const d = o.pos.distanceTo(ref);
      if (d > range) continue;
      let score = d;
      if (o.isPlayer) score *= g.diff.playerFocus;
      if (o.brain && o.brain.target === this.leader) score *= 0.4; // 長機を狙う敵を優先
      if (o.brain && o.brain.target === ac) score *= 0.6;
      if ((o.type === 'kate' || o.type === 'val') && this.ac.side === 'us') score *= 1.6; // 米戦闘機は戦闘機を優先
      if (score < bs) { bs = score; best = o; }
    }
    this.target = best;
  }

  update(dt) {
    const ac = this.ac, g = ac.game;
    this.think -= dt;
    if (this.think <= 0) { this.think = 0.6 + rand() * 0.5; this.pickTarget(); this.checkThreat(); }
    this.noiseT -= dt;
    if (this.noiseT <= 0) { this.noiseT = 0.8 + rand(); this.noise.set(gauss(), gauss(), gauss()).multiplyScalar(g.diff.aiAimErr * (ac.side === 'us' ? 1 : 0.7)); }
    ac.trigger.mg = false;
    const desired = _a;
    let speed = ac.spec.cruise;

    if (this.evadeT > 0) {
      this.evadeT -= dt;
      desired.copy(this.evadeDir);
      speed = ac.spec.maxSpeed;
    } else if (this.target && this.target.alive && !(this.role === 'strafe' && this.strafeTarget && this.target.pos.distanceTo(ac.pos) > 1500)) {
      const t = this.target;
      const dist = t.pos.distanceTo(ac.pos);
      const tof = dist / 800;
      const lead = _v.copy(t.pos).addScaledVector(t.vel, tof).add(this.noise);
      lead.y += 0.5 * 9.81 * tof * tof;
      desired.copy(lead).sub(ac.pos);
      const ang = ac.fwd.angleTo(desired);
      if (dist < 140 && ac.fwd.dot(_w.copy(t.pos).sub(ac.pos).normalize()) > 0.5) {
        // 衝突回避
        desired.copy(ac.up).multiplyScalar(rand() < 0.5 ? 1 : -1).addScaledVector(ac.fwd, 0.6);
      }
      if (ang < 0.045 && dist < 650 && dist > 60) ac.trigger.mg = true;
      speed = dist > 600 ? ac.spec.maxSpeed : clamp(t.speed + (dist - 200) * 0.1, ac.spec.minSpeed + 15, ac.spec.maxSpeed);
      if (ac.side === 'jp') ac.trigger.cannon = ac.trigger.mg && dist < 350; 
    } else if (this.role === 'wingman' && this.leader && this.leader.alive) {
      this.formation(desired);
      speed = this._fspeed;
    } else if (this.role === 'strafe') {
      speed = this.strafe(desired);
    } else {
      // 哨戒
      if (ac.pos.distanceTo(this.patrol) < 1500) this.patrol.set(this.patrol.x + randSigned() * 4000, 1200 + rand() * 1500, this.patrol.z + randSigned() * 4000);
      desired.copy(this.patrol).sub(ac.pos);
    }
    avoidTerrain(ac, desired, this.role === 'strafe' ? 45 : 120);
    ac.steer(dt, desired, speed);
  }

  checkThreat() {
    const ac = this.ac, g = ac.game;
    if (this.evadeT > 0) return;
    for (const o of g.aircraft) {
      if (!o.alive || o.side === ac.side || !o.spec.guns.length) continue;
      const d = o.pos.distanceTo(ac.pos);
      if (d > 600) continue;
      const toMe = _w.copy(ac.pos).sub(o.pos).normalize();
      if (o.fwd.dot(toMe) > 0.96 && ac.fwd.dot(toMe) > 0.2 && rand() < g.diff.aiEvade) {
        this.evadeT = 1.5 + rand() * 2;
        const side = new THREE.Vector3().crossVectors(ac.fwd, UPV).normalize().multiplyScalar(rand() < 0.5 ? 1 : -1);
        this.evadeDir.copy(side).addScaledVector(ac.fwd, 0.2).add(new THREE.Vector3(0, randSigned() * 0.5, 0)).normalize();
        return;
      }
    }
  }

  formation(desired) {
    const ac = this.ac, L = this.leader;
    const slot = _v.copy(this.slot).applyQuaternion(L.quat).add(L.pos);
    const ahead = _w.copy(slot).addScaledVector(L.fwd, 120);
    desired.copy(ahead).sub(ac.pos);
    const along = _v.copy(slot).sub(ac.pos).dot(L.fwd);
    this._fspeed = clamp(L.speed + along * 0.35, ac.spec.minSpeed + 5, ac.spec.maxSpeed * 1.1);
    // 遠く離れたら最大速度で追いつく
    if (ac.pos.distanceTo(slot) > 800) this._fspeed = ac.spec.maxSpeed * 1.1;
  }

  strafe(desired) {
    const ac = this.ac, g = ac.game;
    if (!this.strafeTarget || !this.strafeTarget.alive) {
      const f = g.ground.fields[this.field];
      const alive = f ? f.parked.filter(t => t.alive) : [];
      this.strafeTarget = alive.length ? alive[Math.floor(rand() * alive.length)] : null;
      this.strafePhase = 'approach';
      if (!this.strafeTarget) { this.role = 'cap'; this.patrol.set(ac.pos.x, 1500, ac.pos.z); return ac.spec.cruise; }
    }
    const t = this.strafeTarget;
    const flat = Math.hypot(t.pos.x - ac.pos.x, t.pos.z - ac.pos.z);
    const agl = ac.pos.y - t.pos.y;
    if (this.strafePhase === 'approach') {
      // 2.5km離れて低空進入
      if (flat < 2200 && agl > 50) {
        desired.set(t.pos.x - ac.pos.x, 0, t.pos.z - ac.pos.z).normalize();
        desired.y = clamp(-(agl - 60) / flat, -0.35, 0.1);
      } else desired.set(t.pos.x - ac.pos.x, (t.pos.y + 300 - ac.pos.y) / 4, t.pos.z - ac.pos.z);
      if (flat < 900 && ac.fwd.dot(desired.clone().normalize()) > 0.9) this.strafePhase = 'run';
      if (flat < 400) this.strafePhase = 'pull';
    } else if (this.strafePhase === 'run') {
      desired.copy(t.pos).sub(ac.pos);
      if (ac.fwd.angleTo(desired) < 0.05 && flat < 800) { ac.trigger.mg = true; ac.trigger.cannon = flat < 500; }
      if (flat < 150 || agl < 35) { this.strafePhase = 'pull'; this.pullT = 6; }
    } else {
      desired.copy(ac.fwd); desired.y = 0.35;
      this.pullT = (this.pullT || 6) - 0.016;
      if (flat > 1800) this.strafePhase = 'approach';
    }
    return ac.spec.cruise + 15;
  }
}
const UPV = new THREE.Vector3(0, 1, 0);

// ---------- 攻撃機（雷撃・急降下爆撃）----------
export class BomberBrain {
  // opts: {kind:'torpedo'|'dive', route:[[x,z],...], alt}
  constructor(ac, opts) {
    this.ac = ac; Object.assign(this, opts);
    this.wp = 0; this.phase = 'route'; this.target = null; this.egressT = 0;
    this.alt = opts.alt || (this.kind === 'torpedo' ? 1500 : 3000);
    this.offset = new THREE.Vector3(randSigned() * 18, 0, randSigned() * 18);
  }
  pickShip() {
    const g = this.ac.game;
    const cands = g.ships.filter(s => s.side === 'us' && !s.sunk && s.isTarget);
    if (!cands.length) return null;
    // 近い目標を優先、時々ランダム
    cands.sort((a, b) => a.pos.distanceTo(this.ac.pos) - b.pos.distanceTo(this.ac.pos));
    return cands[Math.min(cands.length - 1, Math.floor(rand() * rand() * 4))];
  }
  update(dt) {
    const ac = this.ac, g = ac.game;
    const desired = _a; let speed = ac.spec.cruise;
    ac.trigger.mg = false;
    if (!this.target || this.target.sunk) { if (this.phase !== 'egress') this.target = this.pickShip(); if (!this.target) this.phase = 'egress'; }
    const tg = this.target;
    if (this.phase === 'route') {
      const p = this.route[this.wp];
      desired.set(p[0] - ac.pos.x, (this.alt - ac.pos.y) * 0.08, p[1] - ac.pos.z);
      if (Math.hypot(p[0] - ac.pos.x, p[1] - ac.pos.z) < 1500) this.wp++;
      if (this.wp >= this.route.length) this.phase = 'attack';
      if (tg && ac.pos.distanceTo(tg.pos) < 9000 && this.wp >= this.route.length - 1) this.phase = 'attack';
      speed = ac.spec.maxSpeed * 1.15;
    } else if (this.phase === 'attack' && tg) {
      if (this.kind === 'torpedo') speed = this.torpedoRun(desired, tg);
      else speed = this.diveRun(desired, tg);
    } else {
      // 離脱：北西へ
      this.egressT += dt;
      desired.set(-1, (800 - ac.pos.y) * 0.002, -0.6);
      if (this.egressT > 60 && ac.pos.distanceTo(g.camera.position) > 4000) { ac.remove(); return; }
    }
    avoidTerrain(ac, desired, this.phase === 'attack' && this.kind === 'torpedo' ? 25 : 110);
    ac.steer(dt, desired, speed);
  }
  // 雷撃進入方位（目標から水面が続く方向）を求める
  approachBearing(tg) {
    const g = this.ac.game;
    const cur = Math.atan2(this.ac.pos.z - tg.pos.z, this.ac.pos.x - tg.pos.x);
    let best = null, bd = Infinity;
    for (let a = 0; a < 360; a += 10) {
      const r = a * Math.PI / 180, dx = Math.cos(r), dz = Math.sin(r);
      let ok = true;
      const p = new THREE.Vector3();
      // 艦の外側から 750m まで水面であること
      let start = 0;
      for (let d = 0; d < 200; d += 5) { p.set(tg.pos.x + dx * d, 0, tg.pos.z + dz * d); if (tg.distanceToHull(p) > 3) { start = d; break; } }
      for (let d = start + 30; d < start + 750; d += 30) { if (!g.terrain.isWater(tg.pos.x + dx * d, tg.pos.z + dz * d)) { ok = false; break; } }
      if (!ok) continue;
      let diff = Math.abs(((r - cur) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      // 艦の真横（舷側）から狙う方位を優先
      const f = tg.fwd; diff += 2.0 * Math.abs(dx * f.x + dz * f.z);
      if (diff < bd) { bd = diff; best = new THREE.Vector3(dx, 0, dz); }
    }
    return best;
  }
  torpedoRun(desired, tg) {
    const ac = this.ac, g = ac.game;
    if (this.apprFor !== tg) { this.apprFor = tg; this.appr = this.approachBearing(tg); this.sub = 'toAP'; }
    if (!this.appr) { this.kind = 'dive'; return ac.spec.cruise; } // 雷撃不可 → 爆撃へ
    const to = _v.copy(tg.pos).sub(ac.pos); to.y = 0;
    const dist = to.length();
    const gh = g.terrain.groundAt(ac.pos.x, ac.pos.z);
    if (this.sub === 'toAP') {
      const ap = _w.copy(tg.pos).addScaledVector(this.appr, 2600);
      desired.set(ap.x - ac.pos.x, 0, ap.z - ac.pos.z);
      const dAP = desired.length(); desired.normalize();
      desired.y = clamp((gh + 200 - ac.pos.y) / 400, -0.4, 0.4);
      const onLine = _w.copy(ac.pos).sub(tg.pos).setY(0).normalize().dot(this.appr) > 0.96;
      if (dAP < 500 || (onLine && dist > 1300 && dist < 3200)) this.sub = 'run';
      return ac.spec.maxSpeed;
    }
    const lead = _w.copy(tg.pos).addScaledVector(tg.vel, dist / 22);
    desired.copy(lead).sub(ac.pos); desired.y = 0; desired.normalize();
    const wantAlt = Math.max(gh, 0) + (dist < 2000 ? 28 : 120);
    desired.y = clamp((wantAlt - ac.pos.y) / 250, -0.45, 0.3);
    if (dist < 760 && dist > 380 && g.terrain.isWater(ac.pos.x, ac.pos.z) && ac.pos.y < 70) {
      const ang = ac.fwd.angleTo(_v.copy(lead).sub(ac.pos).setY(0));
      if (ang < 0.25) {
        g.torpedoes.launch(ac.pos.clone().add(new THREE.Vector3(0, -1.5, 0)), ac.fwd, 'jp', ac);
        for (const s of ac.model.userData.stores) s.visible = false;
        this.phase = 'egress';
      }
    }
    if (dist < 330) { this.sub = 'toAP'; this.appr = this.approachBearing(tg); } // やり直し
    return ac.spec.maxSpeed * 0.92;
  }
  diveRun(desired, tg) {
    const ac = this.ac, g = ac.game;
    const flat = Math.hypot(tg.pos.x - ac.pos.x, tg.pos.z - ac.pos.z);
    const agl = ac.pos.y - tg.pos.y;
    if (!this.diving) {
      desired.set(tg.pos.x - ac.pos.x, (2800 - ac.pos.y) * 0.05, tg.pos.z - ac.pos.z);
      if (flat < agl * 0.8) this.diving = true;
      return ac.spec.cruise;
    }
    // 急降下（約60度）
    const aim = _v.copy(tg.pos).addScaledVector(tg.vel, agl / 120);
    aim.x += this.offset.x * 0.3; aim.z += this.offset.z * 0.3;
    // 着弾予測点が目標を越えないよう、狙いを手前に補正
    const ip = predictImpact(ac.pos, ac.vel, g.terrain, new THREE.Vector3());
    if (ip) { aim.x -= (ip.x - aim.x) * 0.6; aim.z -= (ip.z - aim.z) * 0.6; }
    desired.copy(aim).sub(ac.pos);
    const onTarget = ip && Math.hypot(ip.x - tg.pos.x, ip.z - tg.pos.z) < Math.max(18, tg.B * 0.6);
    if ((onTarget && agl < 1500) || agl < 450) {
      const vel = ac.vel.clone();
      g.bombs.drop(ac.pos.clone().add(new THREE.Vector3(0, -1.2, 0)), vel, 'ai', 'jp', ac, ac.quat);
      for (const s of ac.model.userData.stores) s.visible = false;
      this.phase = 'egress';
    }
    return 145;
  }
}
