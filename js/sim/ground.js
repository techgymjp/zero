// 地上目標（駐機・建物・石油タンク・対空陣地・レーダー）
import * as THREE from 'three';
import { Builder, mat4 } from '../models/builder.js';
import { parkedGeometry, MAT, WRECK_COLOR } from '../models/aircraft.js';
import { AIRFIELDS, fordPt, OPANA, ll } from '../world/geo.js';
import { segSphere, rand, randSigned, mulberry32 } from '../util.js';
import { AABattery } from './aa.js';

const CELL = 250;

export class Ground {
  constructor(game) {
    this.game = game;
    this.targets = [];
    this.grid = new Map();
    this.fields = {};
    this.instanced = {};
    this._buildParked();
    this._buildStructures();
    this._buildAA();
    for (const t of this.targets) this._index(t);
  }
  _key(cx, cz) { return (cx + 2000) * 5000 + (cz + 2000); }
  _cellKey(x, z) { return this._key(Math.floor(x / CELL), Math.floor(z / CELL)); }
  _index(t) {
    const r = t.r;
    for (let cx = Math.floor((t.pos.x - r) / CELL); cx <= Math.floor((t.pos.x + r) / CELL); cx++)
      for (let cz = Math.floor((t.pos.z - r) / CELL); cz <= Math.floor((t.pos.z + r) / CELL); cz++) {
        const k = this._key(cx, cz);
        if (!this.grid.has(k)) this.grid.set(k, new Set());
        this.grid.get(k).add(t);
      }
  }

  _buildParked() {
    const g = this.game, T = g.terrain;
    const per = {};
    for (const f of AIRFIELDS) {
      if (!f.parked) continue;
      const elev = T.fieldElev[f.id];
      this.fields[f.id] = { def: f, parked: [], elev };
      for (const row of f.parked.rows) {
        const hd = row.dir * Math.PI / 180, dx = Math.sin(hd), dz = -Math.cos(hd);
        for (let i = 0; i < row.n; i++) {
          const x = row.from[0] + dx * i * row.gap, z = row.from[1] + dz * i * row.gap;
          (per[row.type || f.parked.type] ||= []).push({ x, z, y: elev, rot: Math.PI - hd + Math.PI / 2 + (rand() - 0.5) * 0.08, field: f.id });
        }
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (const [type, list] of Object.entries(per)) {
      const im = new THREE.InstancedMesh(parkedGeometry(type), MAT.vehicle, list.length);
      im.castShadow = true; im.receiveShadow = true;
      list.forEach((it, i) => {
        // 機首を列の方向と直角（エプロン前方）に
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
        p.set(it.x, it.y, it.z);
        m4.compose(p, q, s); im.setMatrixAt(i, m4);
        im.setColorAt(i, new THREE.Color(1, 1, 1));
        const r = type === 'b17' || type === 'pby' ? 15 : 6.5;
        const t = {
          kind: 'parked', type, pos: new THREE.Vector3(it.x, it.y + 2, it.z), r, hp: type === 'b17' || type === 'pby' ? 22 : 12, alive: true,
          im, idx: i, field: it.field, rot: it.rot, damage: (d, o) => this._damage(t, d, o), score: type === 'b17' ? 120 : 60,
        };
        this.targets.push(t);
        this.fields[it.field].parked.push(t);
      });
      im.instanceMatrix.needsUpdate = true;
      g.scene.add(im);
      this.instanced[type] = im;
    }
  }

  // 発進用に駐機機を一機消費
  takeParked(fieldId) {
    const f = this.fields[fieldId];
    if (!f) return null;
    const t = f.parked.find(t => t.alive && (t.type === 'p40' || t.type === 'f4f'));
    if (!t) return null;
    t.alive = false; t.gone = true;
    const m4 = new THREE.Matrix4().makeScale(0, 0, 0);
    t.im.setMatrixAt(t.idx, m4); t.im.instanceMatrix.needsUpdate = true;
    return t;
  }
  aliveParked(fieldId) { const f = this.fields[fieldId]; return f ? f.parked.filter(t => t.alive && (t.type === 'p40' || t.type === 'f4f')).length : 0; }

  _structure(kind, x, z, opts = {}) {
    const g = this.game, T = g.terrain;
    const y = opts.y ?? Math.max(T.heightAt(x, z), 1.5);
    const b = new Builder();
    let r = 20, hp = 40, score = 80, h = 10;
    const rot = opts.rot || 0;
    switch (kind) {
      case 'hangar': {
        const w = opts.w || 60, d = opts.d || 50; h = opts.h || 18;
        b.box(w, h * 0.55, d, '#9b968a', 0, h * 0.275, 0);
        b.add(new THREE.CylinderGeometry(w / 2, w / 2, d, 16, 1, false, -Math.PI / 2, Math.PI), '#6c6f6c', mat4(0, h * 0.55, 0, Math.PI / 2, 0, 0, 1, 1, h * 0.45 / (w / 2)));
        b.box(w * 0.8, h * 0.45, 0.4, '#2a2a28', 0, h * 0.25, d / 2 + 0.1);
        r = Math.max(w, d) * 0.55; hp = 70; score = 150; break;
      }
      case 'building': {
        const w = opts.w || 40, d = opts.d || 14; h = opts.h || 9;
        b.box(w, h, d, opts.color || '#d8d0bc', 0, h / 2, 0);
        b.box(w + 1, 1, d + 1, '#8a5a40', 0, h + 0.5, 0);
        r = Math.max(w, d) * 0.55; hp = 50; score = 60; break;
      }
      case 'tank': {
        const rr = opts.r || 22; h = 13;
        b.cyl(rr, rr, h, 24, '#bdbab0', 0, h / 2, 0);
        b.cyl(rr * 0.98, rr, 1.5, 24, '#9c9a92', 0, h + 0.75, 0);
        r = rr; hp = 45; score = 200; break;
      }
      case 'crane': {
        h = 50;
        b.box(6, h, 6, '#6b6f70', 0, h / 2, 0);
        b.box(70, 5, 5, '#6b6f70', 10, h + 2.5, 0);
        b.box(8, 6, 6, '#575b5c', -22, h + 2, 0);
        r = 12; hp = 80; score = 80; break;
      }
      case 'tower': {
        h = 22;
        b.box(5, h, 5, '#cfc8b5', 0, h / 2, 0); b.box(8, 4, 8, '#3a4650', 0, h + 2, 0);
        r = 8; hp = 30; score = 60; break;
      }
      case 'radar': {
        h = 14;
        b.box(4, 3, 6, '#7a7a64', 0, 1.5, 0);
        for (const s of [1, -1]) for (const k of [1, -1]) b.between([s * 2, 0, k * 2], [0, 10, 0], 0.15, '#555');
        b.box(9, 6, 0.4, '#555', 0, 12, 0);
        r = 10; hp = 25; score = 150; break;
      }
    }
    const mesh = b.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    mesh.position.set(x, y, z); mesh.rotation.y = rot;
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.scene.add(mesh);
    const t = { kind, pos: new THREE.Vector3(x, y + h * 0.4, z), r, hp, alive: true, mesh, score, h, name: opts.name };
    t.damage = (d, o) => this._damage(t, d, o);
    this.targets.push(t);
    return t;
  }

  _buildStructures() {
    const fp = (t, o) => fordPt(t, o);
    const hk = AIRFIELDS.find(f => f.id === 'hickam').c;
    // ヒッカム: 格納庫列
    for (let i = 0; i < 6; i++) this._structure('hangar', hk[0] - 1000 + i * 130 * 0.966, hk[1] - 650 - i * 130 * 0.259, { rot: 15 * Math.PI / 180, w: 75, d: 60, h: 22 });
    this._structure('building', hk[0] - 300, hk[1] - 1150, { w: 260, d: 18, h: 14, rot: -15 * Math.PI / 180, name: 'ヘイル・マカイ兵舎' });
    this._structure('tower', hk[0] - 500, hk[1] - 800);
    // フォード島
    for (let i = 0; i < 4; i++) { const p = fp(-600 + i * 110, -330); this._structure('hangar', p[0], p[1], { rot: 50 * Math.PI / 180, w: 55, d: 45, y: 2.5 }); }
    { const p = fp(-200, -420); this._structure('tower', p[0], p[1], { y: 2.5 }); }
    for (let i = 0; i < 6; i++) { const p = fp(-300 + i * 110, 330); this._structure('building', p[0], p[1], { rot: 50 * Math.PI / 180, w: 50, d: 15, h: 8, y: 2.5 }); }
    // 海軍工廠
    for (let i = 0; i < 9; i++) { const p = fp(-800 + i * 140, 1500 + (i % 3) * 110); this._structure('building', p[0], p[1], { rot: 50 * Math.PI / 180, w: 70 + (i % 2) * 40, d: 30, h: 16, color: '#b9b3a3' }); }
    { const p = fp(-300, 1250); this._structure('crane', p[0], p[1], { rot: 50 * Math.PI / 180 + Math.PI / 2 }); }
    // 石油タンク群
    for (const [x, z] of this.game.terrain.tankPositions()) {
      const t = this._structure('tank', x, z, { r: 25 });
      t.name = '石油タンク';
    }
    // 他飛行場の格納庫
    const add = (id, n, ox, oz, rot) => { const f = AIRFIELDS.find(a => a.id === id); for (let i = 0; i < n; i++) this._structure('hangar', f.c[0] + ox + i * 80 * Math.cos(rot), f.c[1] + oz + i * 80 * Math.sin(rot), { rot: -rot, w: 60, d: 45, h: 18 }); };
    add('wheeler', 5, -300, -380, 0.1);
    add('kaneohe', 4, -350, -300, 0.35);
    add('ewa', 2, -200, -250, 0);
    add('haleiwa', 1, 120, 60, 0.5);
    add('bellows', 2, 100, -150, 0.3);
    // オパナ・レーダー基地
    const r = this._structure('radar', OPANA[0], OPANA[1], { name: 'オパナ・レーダー基地' });
  }

  _buildAA() {
    const g = this.game, T = g.terrain;
    const sites = [];
    const fp = (t, o) => fordPt(t, o);
    for (const f of AIRFIELDS) {
      const n = f.id === 'hickam' || f.id === 'wheeler' ? 5 : 3;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; sites.push([f.c[0] + Math.cos(a) * 900, f.c[1] + Math.sin(a) * 700]); }
    }
    for (const t of [-800, -200, 400]) sites.push(fp(t, -380));
    for (const t of [-1100, -300, 600, 1300]) sites.push(fp(t, 1650));
    sites.push([2400, 1100], [3200, 0], [-2500, -500], [-1800, 3300], [-200, 4300], [1500, 5200], [4000, 2500]);
    const proto = new Builder();
    proto.cyl(4, 4.5, 1.2, 12, '#9c8f74', 0, 0.6, 0);
    proto.cyl(0.9, 1.1, 1.6, 8, '#4a4f4c', 0, 1.6, 0);
    proto.add(new THREE.CylinderGeometry(0.12, 0.16, 5, 6), '#3a3f3c', mat4(0, 3.2, 1.2, Math.PI / 2 - 0.8, 0, 0));
    const geo = proto.geometry();
    for (const [x, z] of sites) {
      if (T.isWater(x, z)) continue;
      const y = T.heightAt(x, z);
      const mesh = new THREE.Mesh(geo, MAT.vehicle);
      mesh.position.set(x, y, z); mesh.rotation.y = rand() * 6.28; mesh.castShadow = true;
      g.scene.add(mesh);
      const t = { kind: 'aa', pos: new THREE.Vector3(x, y + 2, z), r: 7, hp: 18, alive: true, mesh, score: 80 };
      t.damage = (d, o) => this._damage(t, d, o);
      this.targets.push(t);
      const bat = new AABattery(g, { side: 'us', heavy: 0.5, light: 4, range: 3600, getPos: (out) => out.set(x, y + 4, z), alive: () => t.alive });
      g.aa.push(bat);
    }
  }

  hitTest(p0, p1) {
    const set = this.grid.get(this._cellKey(p1.x, p1.z));
    if (!set) return null;
    for (const t of set) {
      if (!t.alive) continue;
      if (segSphere(p0, p1, t.pos, t.r) >= 0) return t;
    }
    return null;
  }
  blast(pos, radius, dmg, owner) {
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const set = this.grid.get(this._cellKey(pos.x + dx * CELL, pos.z + dz * CELL));
      if (!set) continue;
      for (const t of set) {
        if (!t.alive || seen.has(t)) continue;
        seen.add(t);
        const d = Math.max(0, t.pos.distanceTo(pos) - t.r);
        if (d < radius) t.damage(dmg * (1 - d / radius), owner);
      }
    }
  }

  _damage(t, d, owner) {
    if (!t.alive) return;
    t.hp -= d;
    if (t.hp > 0) return;
    t.alive = false;
    const g = this.game;
    const fx = g.fx;
    const p = t.pos.clone();
    if (t.kind === 'parked') {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(randSigned() * 0.2, t.rot, randSigned() * 0.3));
      m4.compose(new THREE.Vector3(t.pos.x, t.pos.y - 2.5, t.pos.z), q, new THREE.Vector3(0.9, 0.45, 0.9));
      t.im.setMatrixAt(t.idx, m4); t.im.setColorAt(t.idx, WRECK_COLOR);
      t.im.instanceMatrix.needsUpdate = true; t.im.instanceColor.needsUpdate = true;
      fx.explosion(p, t.type === 'b17' ? 3 : 1.8);
      fx.addEmitter({ kind: 'fire', rate: 3, scale: t.type === 'b17' ? 1.4 : 0.8, ttl: 60 + rand() * 60, getPos: (v) => !!v.copy(p) });
    } else if (t.kind === 'tank') {
      fx.explosion(p, 6); fx.flash(p, 3);
      t.mesh.scale.y = 0.4;
      t.mesh.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.color = new THREE.Color(0x2a2522); } });
      fx.addEmitter({ kind: 'fire', rate: 8, scale: 3.2, getPos: (v) => !!v.set(p.x, p.y, p.z) });
    } else {
      fx.explosion(p, t.kind === 'aa' ? 1.5 : 3);
      if (t.mesh) {
        t.mesh.scale.y = t.kind === 'aa' ? 0.3 : 0.45;
        t.mesh.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.color = new THREE.Color(0x3a332e); } });
      }
      if (t.kind !== 'aa') fx.addEmitter({ kind: 'fire', rate: 5, scale: 1.8, ttl: 120, getPos: (v) => !!v.copy(p) });
    }
    g.audio.explosion(p, 1);
    g.onGroundDestroyed(t, owner);
  }
}
