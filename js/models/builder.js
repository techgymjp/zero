// 頂点カラーで部品を合成するビルダー
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), _c2 = new THREE.Color();

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'XYZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

export class Builder {
  constructor() { this.parts = []; this.decals = []; }

  // color: hex または {top, bottom} で法線の上下で塗り分け
  add(geo, color, matrix, opts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const nrm = g.attributes.normal.array, pos = g.attributes.position.array;
    const two = typeof color === 'object' && color !== null && color.top !== undefined;
    const vary = opts.vary ?? 0;
    for (let i = 0; i < n; i++) {
      let c;
      if (two) {
        const below = opts.split !== undefined ? pos[i * 3 + 1] < opts.split : nrm[i * 3 + 1] < -0.25;
        c = _c.set(below ? color.bottom : color.top);
      } else if (typeof color === 'function') c = _c.set(color(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nrm[i * 3 + 1]));
      else c = _c.set(color);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    if (vary) {
      const k = 1 + (Math.random() - 0.5) * vary;
      for (let i = 0; i < n * 3; i++) col[i] *= k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, opts) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, mat4(x, y, z, rx, ry, rz), opts);
  }
  // Y軸方向の円柱
  cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, opts) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, mat4(x, y, z, rx, ry, rz), opts);
  }
  // Z軸方向の円柱（砲身など）
  zcyl(rt, rb, len, seg, color, x, y, z, opts) {
    return this.add(new THREE.CylinderGeometry(rt, rb, len, seg), color, mat4(x, y, z, Math.PI / 2, 0, 0), opts);
  }
  sphere(r, color, x, y, z, sx = 1, sy = 1, sz = 1, seg = 10) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6)), color, mat4(x, y, z, 0, 0, 0, sx, sy, sz));
  }
  between(a, b, r, color, seg = 5) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    const m = new THREE.Matrix4();
    const dir = B.clone().sub(A).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    m.compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(g, color, m);
  }

  // デカール（アトラスのセル番号, 幅, 高さ, 行列）
  decal(cell, w, h, matrix, cols = 4) {
    const g = new THREE.PlaneGeometry(w, h);
    const cx = cell % cols, cy = Math.floor(cell / cols);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (cx + uv.getX(i)) / cols, 1 - (cy + 1 - uv.getY(i)) / cols);
    }
    const ng = g.toNonIndexed();
    ng.applyMatrix4(matrix);
    this.decals.push(ng);
    return this;
  }

  build(material, decalMaterial) {
    const geo = mergeGeometries(this.parts, false);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    if (this.decals.length && decalMaterial) {
      const dg = mergeGeometries(this.decals, false);
      const dm = new THREE.Mesh(dg, decalMaterial);
      dm.name = 'decals';
      mesh.add(dm);
    }
    return mesh;
  }
  geometry() {
    const geo = mergeGeometries(this.parts, false);
    geo.computeBoundingSphere();
    return geo;
  }
}

// 翼のロフト: sections [{s, zq, chord, t, y}] s は翼幅方向(+X)の位置
export function wingGeometry(sections, { mirror = true, camber = 0.012 } = {}) {
  const U = [1, 0.8, 0.6, 0.4, 0.25, 0.12, 0.05, 0.012, 0];
  const L = [0.012, 0.05, 0.12, 0.25, 0.4, 0.6, 0.8, 1];
  const prof = (u, t) => 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u ** 4);
  const sides = mirror ? [1, -1] : [1];
  const geos = [];
  for (const side of sides) {
    const pos = [], idx = [];
    const M = U.length + L.length;
    for (const sec of sections) {
      const zle = sec.zq + 0.25 * sec.chord;
      for (const u of U) { const yc = camber * sec.chord * Math.sin(Math.PI * u); pos.push(sec.s * side, sec.y + yc + prof(u, sec.t) * sec.chord, zle - u * sec.chord); }
      for (const u of L) { const yc = camber * sec.chord * Math.sin(Math.PI * u); pos.push(sec.s * side, sec.y + yc - prof(u, sec.t) * sec.chord * 0.85, zle - u * sec.chord); }
    }
    for (let i = 0; i < sections.length - 1; i++) {
      for (let j = 0; j < M - 1; j++) {
        const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + j + 1, d = i * M + j + 1;
        if (side > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
      }
    }
    // 翼端キャップ
    const last = (sections.length - 1) * M;
    pos.push(sections[sections.length - 1].s * side, sections[sections.length - 1].y, sections[sections.length - 1].zq);
    const ci = pos.length / 3 - 1;
    for (let j = 0; j < M - 1; j++) side > 0 ? idx.push(last + j, ci, last + j + 1) : idx.push(last + j, last + j + 1, ci);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    geos.push(g);
  }
  return geos.length === 1 ? geos[0] : mergeGeometries(geos.map(g => g.toNonIndexed()), false);
}

// 楕円/テーパー翼の断面生成
export function taperedSections({ span, rootChord, tipChord, sweepQ = 0, zq0 = 0, y0 = 0, dihedral = 0, tRoot = 0.15, tTip = 0.09, roundTip = 0.18, s0 = 0, n = 8 }) {
  const half = span / 2;
  const out = [];
  const straight = half * (1 - roundTip);
  for (let i = 0; i <= n; i++) {
    const s = s0 + (straight - s0) * (i / n);
    const f = (s - s0) / (half - s0);
    out.push({ s, zq: zq0 - sweepQ * s, chord: rootChord + (tipChord - rootChord) * ((s - s0) / (straight - s0)) * (straight - s0) / (half - s0) * 1.0, t: tRoot + (tTip - tRoot) * f, y: y0 + Math.tan(dihedral) * s });
  }
  // 丸い翼端
  const cs = out[out.length - 1].chord;
  for (let k = 1; k <= 5; k++) {
    const a = k / 5 * Math.PI / 2;
    const s = straight + (half - straight) * Math.sin(a);
    out.push({ s, zq: zq0 - sweepQ * s, chord: Math.max(0.04, cs * Math.cos(a)), t: tTip, y: y0 + Math.tan(dihedral) * s });
  }
  return out;
}

// 回転体（Z軸方向）: profile [[z, r], ...]
export function latheZ(profile, seg = 16, sy = 1) {
  const pts = profile.map(([z, r]) => new THREE.Vector2(Math.max(r, 0.0001), z));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * sy);
  g.computeVertexNormals();
  return g;
}
