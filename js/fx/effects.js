// 爆発・煙・火災・水柱・対空砲火
import * as THREE from 'three';
import { ParticleSystem, StreakSystem, softTexture } from './particles.js';
import { randSigned, rand } from '../util.js';

export class Effects {
  constructor(scene) {
    const smokeTex = softTexture('smoke'), glowTex = softTexture('glow');
    this.smoke = new ParticleSystem(7000, smokeTex);
    this.fire = new ParticleSystem(3000, glowTex, { additive: true, lit: 1 });
    this.water = new ParticleSystem(2500, smokeTex);
    this.streaks = new StreakSystem(3000);
    for (const s of [this.water, this.smoke, this.fire]) scene.add(s.mesh);
    scene.add(this.streaks.mesh);
    this.emitters = [];
    this.lights = [];
    // 閃光用ポイントライト（数個を使い回し）
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 300, 1.5);
      scene.add(l); this.lights.push({ l, t: 0 });
    }
  }

  flash(p, power = 1) {
    const s = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    s.l.position.copy(p); s.t = 0.25 * power; s.l.intensity = 40000 * power; s.l.distance = 400 * power;
  }

  explosion(p, scale = 1, opts = {}) {
    const n = Math.floor(18 * Math.min(scale, 4));
    for (let i = 0; i < n; i++) {
      const v = 12 * scale;
      this.fire.emit(p.x + randSigned() * 2 * scale, p.y + randSigned() * 2 * scale, p.z + randSigned() * 2 * scale,
        randSigned() * v, randSigned() * v + 4 * scale, randSigned() * v,
        0.5 + rand() * 0.7, 4 * scale, 14 * scale, [1, 0.75, 0.35, 1], [0.8, 0.2, 0.05, 0], 2.5, 0);
    }
    for (let i = 0; i < n; i++) {
      const v = 7 * scale;
      this.smoke.emit(p.x + randSigned() * 3 * scale, p.y + randSigned() * 3 * scale, p.z + randSigned() * 3 * scale,
        randSigned() * v, rand() * v + 2, randSigned() * v,
        3 + rand() * 4 * Math.sqrt(scale), 5 * scale, 22 * scale, [0.12, 0.11, 0.1, 0.85], [0.35, 0.34, 0.33, 0], 1.2, 1.5);
    }
    if (opts.debris !== false) {
      for (let i = 0; i < 8 * Math.min(scale, 3); i++) {
        const v = 25 * Math.sqrt(scale);
        this.fire.emit(p.x, p.y, p.z, randSigned() * v, rand() * v * 1.2, randSigned() * v, 0.8 + rand() * 0.8, 1.2, 0.6, [1, 0.8, 0.4, 1], [1, 0.3, 0.1, 0], 0.4, -12);
      }
    }
    this.flash(p, Math.min(2.5, 0.6 + scale * 0.3));
  }

  // 巨大爆発（弾薬庫誘爆）
  megaExplosion(p) {
    this.explosion(p, 8);
    for (let i = 0; i < 120; i++) {
      const a = rand() * Math.PI * 2, up = 30 + rand() * 60;
      this.fire.emit(p.x, p.y + 10, p.z, Math.cos(a) * 40 * rand(), up, Math.sin(a) * 40 * rand(), 1.5 + rand() * 2, 20, 70, [1, 0.8, 0.4, 1], [0.7, 0.15, 0.02, 0], 1.0, -6);
    }
    for (let i = 0; i < 160; i++) {
      this.smoke.emit(p.x + randSigned() * 40, p.y + rand() * 200, p.z + randSigned() * 40, randSigned() * 10, 20 + rand() * 30, randSigned() * 10, 15 + rand() * 15, 40, 160, [0.08, 0.07, 0.06, 0.9], [0.25, 0.24, 0.23, 0], 0.4, 2);
    }
    this.flash(p, 4);
  }

  splash(p, scale = 1) {
    const n = Math.floor(10 + 14 * Math.min(scale, 4));
    for (let i = 0; i < n; i++) {
      const v = 3 * scale;
      this.water.emit(p.x + randSigned() * 2 * scale, 0.5, p.z + randSigned() * 2 * scale, randSigned() * v, (10 + rand() * 18) * Math.sqrt(scale), randSigned() * v,
        1.2 + rand() * 1.5 * Math.sqrt(scale), 2 * scale, 9 * scale, [0.95, 0.97, 1, 0.85], [0.9, 0.93, 0.95, 0], 0.6, -14);
    }
  }
  bulletSplash(p) {
    this.water.emit(p.x, 0.3, p.z, 0, 7 + rand() * 4, 0, 0.7, 0.6, 2.2, [0.95, 0.97, 1, 0.8], [1, 1, 1, 0], 0.5, -14);
  }
  dust(p) {
    this.smoke.emit(p.x, p.y + 0.5, p.z, randSigned(), 3 + rand() * 3, randSigned(), 1.2, 1, 4, [0.55, 0.47, 0.36, 0.7], [0.6, 0.55, 0.45, 0], 1, 0);
  }
  spark(p) {
    this.fire.emit(p.x, p.y, p.z, randSigned() * 8, randSigned() * 8, randSigned() * 8, 0.18, 1.2, 0.3, [1, 0.9, 0.6, 1], [1, 0.5, 0.2, 0], 1, 0);
  }
  flak(p) {
    this.fire.emit(p.x, p.y, p.z, 0, 0, 0, 0.18, 6, 14, [1, 0.8, 0.5, 1], [1, 0.4, 0.1, 0], 0, 0);
    for (let i = 0; i < 5; i++) {
      this.smoke.emit(p.x + randSigned() * 3, p.y + randSigned() * 3, p.z + randSigned() * 3, randSigned() * 4, randSigned() * 4, randSigned() * 4,
        5 + rand() * 3, 6, 16, [0.08, 0.08, 0.08, 0.9], [0.2, 0.2, 0.2, 0], 1.5, 0.3);
    }
  }
  muzzle(p, scale = 1) {
    this.fire.emit(p.x, p.y, p.z, 0, 0, 0, 0.05, 0.9 * scale, 1.6 * scale, [1, 0.85, 0.5, 1], [1, 0.5, 0.2, 0], 0, 0);
  }

  // 持続エミッタ: getPos(out) が false を返すと終了
  addEmitter(e) {
    // e = {getPos(v):bool, rate, kind:'fire'|'smoke'|'trail'|'blackcolumn', scale, ttl}
    e.acc = 0; e.age = 0; e.tmp = new THREE.Vector3();
    this.emitters.push(e);
    return e;
  }

  update(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.age += dt;
      if ((e.ttl && e.age > e.ttl) || e.dead || !e.getPos(e.tmp)) { this.emitters.splice(i, 1); continue; }
      e.acc += dt * e.rate;
      const p = e.tmp, s = e.scale || 1;
      while (e.acc >= 1) {
        e.acc -= 1;
        switch (e.kind) {
          case 'trail': // 被弾機の黒煙
            this.smoke.emit(p.x, p.y, p.z, randSigned(), randSigned(), randSigned(), 4 + rand() * 2, 2 * s, 10 * s, [0.1, 0.1, 0.1, 0.75], [0.3, 0.3, 0.3, 0], 0.5, 0.5);
            if (e.fire) this.fire.emit(p.x, p.y, p.z, 0, 0, 0, 0.25, 2.5 * s, 1, [1, 0.7, 0.3, 1], [1, 0.3, 0.1, 0], 0, 0);
            break;
          case 'whitetrail':
            this.smoke.emit(p.x, p.y, p.z, 0, 0, 0, 2.5, 1.2 * s, 5 * s, [0.85, 0.85, 0.85, 0.5], [0.9, 0.9, 0.9, 0], 0.5, 0);
            break;
          case 'fire': // 炎上（地上・艦上）
            this.fire.emit(p.x + randSigned() * 4 * s, p.y + rand() * 2, p.z + randSigned() * 4 * s, randSigned(), 6 + rand() * 6, randSigned(), 0.8 + rand() * 0.8, 6 * s, 2 * s, [1, 0.65, 0.25, 0.9], [0.9, 0.2, 0.05, 0], 0.3, 2);
            if (rand() < 0.5) this.smoke.emit(p.x, p.y + 6 * s, p.z, randSigned() * 2 + 2, 8 + rand() * 6, randSigned() * 2, 18 + rand() * 12, 8 * s, 50 * s, [0.06, 0.06, 0.06, 0.85], [0.28, 0.27, 0.26, 0], 0.15, 1.2);
            break;
          case 'smoke':
            this.smoke.emit(p.x + randSigned() * 3 * s, p.y, p.z + randSigned() * 3 * s, randSigned() + 2, 6 + rand() * 4, randSigned(), 14 + rand() * 8, 6 * s, 35 * s, [0.15, 0.15, 0.15, 0.7], [0.35, 0.35, 0.35, 0], 0.15, 1);
            break;
          case 'wake':
            this.water.emit(p.x + randSigned() * s, 0.4, p.z + randSigned() * s, randSigned() * 0.5, 0, randSigned() * 0.5, 12, 3 * s, 14 * s, [0.95, 0.97, 1, 0.45], [1, 1, 1, 0], 0.1, 0);
            break;
        }
      }
    }
    for (const L of this.lights) {
      if (L.t > 0) { L.t -= dt; L.l.intensity *= Math.max(0, 1 - dt * 8); if (L.t <= 0) L.l.intensity = 0; }
    }
    this.smoke.update(dt); this.fire.update(dt); this.water.update(dt);
  }
}
