// 弾丸・爆弾・魚雷
import * as THREE from 'three';
import { segSphere, segAABB, rand, randSigned } from '../util.js';
import { bombMesh, torpedoMesh } from '../models/aircraft.js';

const G = 9.81;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();

// 弾種
export const AMMO = {
  mg77: { dmg: 1.6, shipDmg: 0.15, speed: 750, color: [1.0, 0.75, 0.3], width: 0.22, tracerEvery: 2, ground: 1 },
  mg20: { dmg: 13, shipDmg: 1.5, speed: 600, color: [1.0, 0.55, 0.2], width: 0.4, tracerEvery: 1, ground: 6, explosive: true },
  mg50: { dmg: 3.2, shipDmg: 0.2, speed: 870, color: [1.0, 0.35, 0.2], width: 0.25, tracerEvery: 2, ground: 1 },
  aa: { dmg: 4, shipDmg: 0, speed: 800, color: [1.0, 0.3, 0.15], width: 0.35, tracerEvery: 1, ground: 0 },
};

export class Bullets {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  fire(pos, vel, side, ammo, owner, spread = 0.003) {
    const a = AMMO[ammo];
    const b = {
      x: pos.x, y: pos.y, z: pos.z,
      vx: vel.x + randSigned() * a.speed * spread, vy: vel.y + randSigned() * a.speed * spread, vz: vel.z + randSigned() * a.speed * spread,
      side, a, owner, life: ammo === 'aa' ? 3.5 : 2.6, tracer: true,
    };
    this.list.push(b);
    return b;
  }

  update(dt) {
    const g = this.game, fx = g.fx;
    const list = this.list;
    const p0 = _a, p1 = _b;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.life -= dt;
      p0.set(b.x, b.y, b.z);
      b.vy -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      p1.set(b.x, b.y, b.z);
      let hit = false;
      // 航空機
      for (const ac of g.aircraft) {
        if (!ac.alive || ac.side === b.side) continue;
        const dx = ac.pos.x - b.x, dy = ac.pos.y - b.y, dz = ac.pos.z - b.z;
        if (dx * dx + dy * dy + dz * dz > 3600) continue;
        if (segSphere(p0, p1, ac.pos, ac.radius) >= 0) {
          ac.damage(b.a.dmg, b.owner, b.a.explosive);
          fx.spark(p1);
          if (b.a.explosive) fx.fire.emit(p1.x, p1.y, p1.z, 0, 0, 0, 0.12, 1.5, 3, [1, 0.8, 0.5, 1], [1, 0.4, 0.1, 0], 0, 0);
          hit = true; break;
        }
      }
      // 艦艇
      if (!hit && b.y < 60 && b.a.shipDmg > 0) {
        for (const s of g.ships) {
          if (s.side === b.side || s.sunk) continue;
          const dx = s.pos.x - b.x, dz = s.pos.z - b.z;
          if (dx * dx + dz * dz > (s.L * 0.5 + 40) ** 2) continue;
          if (s.hitSegment(p0, p1)) {
            s.damage(b.a.shipDmg, p1, b.owner, 'gun');
            fx.spark(p1); if (rand() < 0.3) fx.spark(p1);
            hit = true; break;
          }
        }
      }
      // 地上目標
      if (!hit && b.a.ground > 0) {
        const tg = g.ground.hitTest(p0, p1);
        if (tg) { tg.damage(b.a.ground, b.owner); fx.spark(p1); hit = true; }
      }
      if (!hit) {
        const gh = g.terrain.groundAt(b.x, b.z);
        if (b.y < gh) {
          if (gh <= 0.01) { if (rand() < 0.6) fx.bulletSplash(p1); }
          else if (rand() < 0.5) fx.dust(p1);
          hit = true;
        }
      }
      if (hit || b.life <= 0) { list[i] = list[list.length - 1]; list.pop(); }
    }
  }

  draw(streaks) {
    for (const b of this.list) {
      const c = b.a.color, k = 0.03;
      streaks.add(b.x - b.vx * k, b.y - b.vy * k, b.z - b.vz * k, b.x, b.y, b.z, c[0] * 2, c[1] * 2, c[2] * 2, 0.95, b.a.width);
    }
  }
}

// 爆弾
export class Bombs {
  constructor(game) { this.game = game; this.list = []; }

  drop(pos, vel, kind, side, owner, quat) {
    const g = this.game;
    const spec = kind === 250 ? { len: 1.75, r: 0.2, dmg: 450, blast: 28 } : kind === 60 ? { len: 1.0, r: 0.115, dmg: 120, blast: 14 } : { len: 1.75, r: 0.2, dmg: 220, blast: 24 };
    const mesh = bombMesh(spec.len, spec.r);
    mesh.position.copy(pos);
    if (quat) mesh.quaternion.copy(quat);
    g.scene.add(mesh);
    this.list.push({ pos: pos.clone(), vel: vel.clone(), mesh, kind, side, owner, ...spec, t: 0 });
  }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.t += dt;
      const p0 = _a.copy(b.pos);
      b.vel.y -= G * dt;
      b.vel.multiplyScalar(1 - 0.006 * dt);
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.t > 0.2) {
        const dir = _b.copy(b.vel).normalize();
        b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      }
      let done = false;
      // 艦艇直撃
      for (const s of g.ships) {
        if (s.side === b.side || s.sunk) continue;
        const dx = s.pos.x - b.pos.x, dz = s.pos.z - b.pos.z;
        if (dx * dx + dz * dz > (s.L * 0.5 + 30) ** 2) continue;
        if (s.hitSegment(p0, b.pos, 1.5)) {
          const local = s.toLocal(b.pos.clone());
          s.damage(b.dmg, b.pos.clone(), b.owner, 'bomb', b.kind, local);
          g.fx.explosion(b.pos, b.kind === 60 ? 2.2 : 3.6);
          g.audio.explosion(b.pos, 1.2);
          done = true; break;
        }
      }
      if (!done) {
        const gh = g.terrain.groundAt(b.pos.x, b.pos.z);
        if (b.pos.y <= gh) {
          b.pos.y = gh;
          if (gh <= 0.01) {
            g.fx.splash(b.pos, b.kind === 60 ? 2.5 : 4.5);
            // 至近弾
            for (const s of g.ships) {
              if (s.side === b.side || s.sunk) continue;
              const d = s.distanceToHull(b.pos);
              if (d < b.blast) s.damage(b.dmg * 0.3 * (1 - d / b.blast), b.pos.clone(), b.owner, 'near');
            }
          } else {
            g.fx.explosion(b.pos, b.kind === 60 ? 2.0 : 3.2);
          }
          g.ground.blast(b.pos, b.blast, b.dmg * 0.6, b.owner);
          g.audio.explosion(b.pos, 1.0);
          done = true;
        }
      }
      if (done) {
        g.scene.remove(b.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}

// 航空魚雷（九一式）
export class Torpedoes {
  constructor(game) { this.game = game; this.list = []; this.proto = torpedoMesh(); }
  launch(pos, dir, side, owner) {
    const g = this.game;
    const d = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const t = { pos: new THREE.Vector3(pos.x, Math.max(pos.y, 0), pos.z), vy: -6, dir: d, speed: 22, run: 0, side, owner, state: 'drop', mesh: this.proto.clone() };
    t.mesh.position.copy(t.pos);
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    g.scene.add(t.mesh);
    this.list.push(t);
  }
  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      let done = false;
      if (t.state === 'drop') {
        t.vy -= G * dt; t.pos.y += t.vy * dt; t.pos.addScaledVector(t.dir, 40 * dt);
        if (t.pos.y <= 0) {
          t.state = 'run'; t.pos.y = -2.5; g.fx.splash(t.pos, 1.6);
          if (!g.terrain.isWater(t.pos.x, t.pos.z)) done = true;
          else g.fx.addEmitter({ kind: 'wake', rate: 6, scale: 0.6, getPos: (v) => { if (t.state !== 'run') return false; v.set(t.pos.x, 0, t.pos.z); return true; } });
        }
      } else {
        const p0 = _a.copy(t.pos);
        t.pos.addScaledVector(t.dir, t.speed * dt); t.run += t.speed * dt;
        for (const s of g.ships) {
          if (s.side === t.side || s.sunk) continue;
          const dx = s.pos.x - t.pos.x, dz = s.pos.z - t.pos.z;
          if (dx * dx + dz * dz > (s.L * 0.5 + 20) ** 2) continue;
          if (s.hitSegment(p0, t.pos, 0.5)) {
            const hp = t.pos.clone(); hp.y = 0;
            s.damage(260, hp, t.owner, 'torpedo');
            g.fx.splash(hp, 9); g.fx.explosion(new THREE.Vector3(hp.x, 2, hp.z), 2.5, { debris: false });
            g.audio.explosion(hp, 1.4);
            done = true; break;
          }
        }
        if (!g.terrain.isWater(t.pos.x, t.pos.z) || t.run > 3500) done = true;
      }
      t.mesh.position.copy(t.pos);
      if (done) { t.state = 'done'; g.scene.remove(t.mesh); this.list.splice(i, 1); }
    }
  }
}

// 弾道予測（爆撃照準用）: 着弾点を返す
export function predictImpact(pos, vel, terrain, out) {
  const p = _a.copy(pos), v = _b.copy(vel);
  const dt = 0.1;
  for (let i = 0; i < 400; i++) {
    v.y -= G * dt; v.multiplyScalar(1 - 0.006 * dt);
    p.addScaledVector(v, dt);
    const gh = terrain.groundAt(p.x, p.z);
    if (p.y <= gh) { out.set(p.x, gh, p.z); return out; }
  }
  return null;
}
