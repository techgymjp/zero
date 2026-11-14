// 対空砲火
import * as THREE from 'three';
import { gauss, rand, randSigned } from '../util.js';

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();

export class AABattery {
  // opts: {side, heavy(発/秒), light(発/秒), range, getPos(out), alive()}
  constructor(game, opts) {
    this.game = game; Object.assign(this, opts);
    this.hAcc = rand(); this.lAcc = rand();
    this.target = null; this.retarget = 0;
    this.pending = [];
  }
  pickTarget() {
    const g = this.game;
    this.getPos(_p);
    let best = null, bd = Infinity;
    for (const ac of g.aircraft) {
      if (!ac.alive || ac.side === this.side) continue;
      let d = ac.pos.distanceTo(_p);
      if (d > this.range) continue;
      if (ac.isPlayer) d *= 0.7;
      if (d < bd) { bd = d; best = ac; }
    }
    this.target = best;
  }
  update(dt) {
    const g = this.game;
    // 時限信管の炸裂処理
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const f = this.pending[i];
      f.t -= dt;
      if (f.t <= 0) {
        g.fx.flak(f.p);
        if (f.p.distanceTo(g.camera.position) < 2500) g.audio.flak(f.p);
        for (const ac of g.aircraft) {
          if (!ac.alive || ac.side === this.side) continue;
          const d = ac.pos.distanceTo(f.p);
          if (d < 32) ac.damage(28 * (1 - d / 32) * g.diff.aaDmg, null, true);
        }
        this.pending.splice(i, 1);
      }
    }
    if (!this.alive()) return;
    this.retarget -= dt;
    if (this.retarget <= 0) { this.pickTarget(); this.retarget = 1 + rand(); }
    const tg = this.target;
    if (!tg || !tg.alive) return;
    this.getPos(_p);
    const dist = tg.pos.distanceTo(_p);
    if (dist > this.range || tg.pos.y < 15) return;
    const acc = g.diff.aaAcc;
    // 重高角砲（5インチ等）
    if (this.heavy && dist > 500) {
      this.hAcc += dt * this.heavy;
      while (this.hAcc >= 1) {
        this.hAcc -= 1;
        const tof = dist / 650;
        const sig = (20 + dist * 0.035) / acc;
        const p = _t.copy(tg.pos).addScaledVector(tg.vel, tof);
        p.x += gauss() * sig; p.y += gauss() * sig * 0.8; p.z += gauss() * sig;
        this.pending.push({ p: p.clone(), t: tof });
      }
    }
    // 機銃（.50口径・1.1インチ）
    if (this.light && dist < 1700) {
      this.lAcc += dt * this.light;
      while (this.lAcc >= 1) {
        this.lAcc -= 1;
        const tof = dist / 800;
        const aim = _t.copy(tg.pos).addScaledVector(tg.vel, tof);
        aim.y += 0.5 * 9.81 * tof * tof;
        _d.copy(aim).sub(_p).normalize().multiplyScalar(800);
        const spread = 0.014 / acc;
        _d.x += randSigned() * 800 * spread; _d.y += randSigned() * 800 * spread; _d.z += randSigned() * 800 * spread;
        g.bullets.fire(_p, _d, this.side, 'aa', null, 0);
      }
    }
  }
}
