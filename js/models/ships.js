// 艦艇モデル（前方 +Z, 左舷 +X, 喫水線 y=0）
import * as THREE from 'three';
import { Builder, mat4 } from './builder.js';
import { MAT } from './aircraft.js';

const US = { hull: '#4e5458', sup: '#585f63', top: '#8e9599', deck: '#565d62', gun: '#3e4447', boot: '#161616', red: '#6a2a22' };
const JP = { hull: '#5c6164', sup: '#666b6e', top: '#7c8184', deck: '#8a6d4a', gun: '#46494b', boot: '#161616', red: '#6a2a22' };

function sub(b, fn, matrix) {
  const nb = new Builder(); fn(nb);
  const g = nb.geometry(); if (matrix) g.applyMatrix4(matrix);
  b.parts.push(g);
}

// 船体
function hull(b, { L, B, draft, fb, bowStart = 0.68, sternW = 0.55, colors, deckColor, N = 34, flare = 0 }) {
  const ring = [], rings = [];
  const sec = (hb, d, deck) => [[hb * (1 + flare), deck], [hb, 0.5], [hb, 0.45], [hb, -0.4], [hb, -0.45], [hb * 0.96, -d * 0.5], [hb * 0.8, -d * 0.88], [hb * 0.35, -d], [0, -d]];
  const deckAt = (t) => fb.mid + (t > 0.55 ? ((t - 0.55) / 0.45) ** 2 * (fb.bow - fb.mid) : 0) + (t < 0.2 ? ((0.2 - t) / 0.2) ** 2 * (fb.stern - fb.mid) : 0);
  const hbAt = (t) => {
    if (t > bowStart) return B / 2 * Math.pow(Math.max(0, 1 - ((t - bowStart) / (1 - bowStart)) ** 2.2), 0.55);
    if (t < 0.12) return B / 2 * (sternW + (1 - sternW) * Math.sqrt(t / 0.12));
    return B / 2;
  };
  const pos = [], cols = [], idx = [];
  const colAt = (y) => new THREE.Color(y > 0.47 ? colors.hull : y > -0.42 ? colors.boot : colors.red);
  for (let i = 0; i <= N; i++) {
    const t = i / N, z0 = -L / 2 + t * L, hb = hbAt(t), deck = deckAt(t);
    const s = sec(hb, draft * (t > 0.92 ? 1 - (t - 0.92) * 4 : 1), deck);
    const pts = [];
    for (const [x, y] of s) pts.push([x, y]);
    for (let k = s.length - 2; k >= 0; k--) pts.push([-s[k][0], s[k][1]]);
    for (const [x, y] of pts) {
      const rake = t > 0.88 ? ((y + draft) / (deck + draft)) * L * 0.015 * ((t - 0.88) / 0.12) : 0;
      pos.push(x, y, z0 + rake);
      const c = colAt(y); cols.push(c.r, c.g, c.b);
    }
    rings.push({ deck, hb, z: z0 });
  }
  const M = 17;
  for (let i = 0; i < N; i++) for (let k = 0; k < M - 1; k++) {
    const a = i * M + k, bb = (i + 1) * M + k;
    idx.push(a, bb, bb + 1, a, bb + 1, a + 1);
  }
  // 艦尾トランサム
  const ci = pos.length / 3; pos.push(0, rings[0].deck * 0.4, -L / 2); const c0 = new THREE.Color(colors.hull); cols.push(c0.r, c0.g, c0.b);
  for (let k = 0; k < M - 1; k++) idx.push(ci, k, k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const ng = g.toNonIndexed(); b.parts.push(ng);
  // 甲板
  if (deckColor) {
    const dp = [], dc = [], di = [];
    const dcol = new THREE.Color(deckColor);
    rings.forEach((r, i) => {
      const t = i / N; const rake = t > 0.88 ? L * 0.015 * ((t - 0.88) / 0.12) : 0;
      dp.push(r.hb * (1 + flare), r.deck, r.z + rake, -r.hb * (1 + flare), r.deck, r.z + rake);
      dc.push(dcol.r, dcol.g, dcol.b, dcol.r, dcol.g, dcol.b);
    });
    for (let i = 0; i < N; i++) { const a = i * 2; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dg.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
    dg.setIndex(di); dg.computeVertexNormals();
    b.parts.push(dg.toNonIndexed());
  }
  return { deckAt: (z) => deckAt((z + L / 2) / L), hbAt: (z) => hbAt((z + L / 2) / L) };
}

function turret(b, x, y, z, facing, guns, w, gunLen, col, gunCol, elev = 0.03) {
  sub(b, (t) => {
    const h = w * 0.36, d = w * 1.15;
    const g = new THREE.BoxGeometry(w, h, d);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getZ(i) > 0) { p.setX(i, p.getX(i) * 0.82); if (p.getY(i) > 0) { p.setY(i, p.getY(i) * 0.6); p.setZ(i, p.getZ(i) * 0.75); } }
      if (p.getZ(i) < 0 && p.getY(i) > 0) p.setZ(i, p.getZ(i) * 0.95);
    }
    g.computeVertexNormals();
    t.add(g, col, mat4(0, h / 2, 0));
    const sp = w * (guns === 3 ? 0.3 : 0.36);
    for (let k = 0; k < guns; k++) {
      const gx = (k - (guns - 1) / 2) * sp;
      t.add(new THREE.CylinderGeometry(w * 0.035, w * 0.05, gunLen, 8), gunCol, mat4(gx, h * 0.45 + Math.sin(elev) * gunLen / 2, d * 0.35 + gunLen / 2, Math.PI / 2 - elev, 0, 0));
    }
  }, mat4(x, y, z, 0, facing < 0 ? Math.PI : 0, 0));
}

function tripod(b, x, z, y0, h, spread, col, topCol, top = 'fc') {
  const apex = [x, y0 + h, z];
  b.between([x + spread, y0, z - spread * 0.6], apex, 0.45, col, 6);
  b.between([x - spread, y0, z - spread * 0.6], apex, 0.45, col, 6);
  b.between([x, y0, z + spread], apex, 0.55, col, 6);
  if (top === 'fc') {
    b.box(5, 2.6, 5, topCol, x, y0 + h - 0.8, z);
    b.box(6, 0.3, 6, topCol, x, y0 + h - 2.3, z);
    b.box(3.4, 2.2, 3.4, topCol, x, y0 + h + 1.4, z);
    b.cyl(0.15, 0.15, 6, 4, topCol, x, y0 + h + 5, z);
  } else b.cyl(0.15, 0.15, 6, 4, topCol, x, y0 + h + 3, z);
}

function cageMast(b, x, z, y0, h, r0, r1, col, topCol) {
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    for (const tw of [1.4, -1.4]) {
      b.between([x + Math.cos(a) * r0, y0, z + Math.sin(a) * r0], [x + Math.cos(a + tw) * r1, y0 + h, z + Math.sin(a + tw) * r1], 0.09, col, 3);
    }
  }
  for (const f of [0.33, 0.66]) b.add(new THREE.TorusGeometry(r0 + (r1 - r0) * f, 0.12, 3, 16), col, mat4(x, y0 + h * f, z, Math.PI / 2, 0, 0));
  // 檣楼
  b.cyl(3.4, 3.0, 2.4, 10, topCol, x, y0 + h + 1.2, z);
  b.cyl(3.6, 3.6, 0.3, 10, topCol, x, y0 + h - 0.2, z);
  b.cyl(2.6, 2.8, 2.2, 10, topCol, x, y0 + h + 3.5, z);
  b.cyl(0.15, 0.15, 5, 4, topCol, x, y0 + h + 7, z);
}

function funnel(b, x, z, y0, h, rx, rz, col, rake = 0) {
  b.add(new THREE.CylinderGeometry(1, 1.05, h, 14), col, mat4(x, y0 + h / 2, z - rake * h / 2, -rake, 0, 0, rx, 1, rz));
  b.add(new THREE.CylinderGeometry(0.92, 0.92, 0.8, 14), '#1a1a1a', mat4(x, y0 + h - 0.2, z - rake * h, -rake, 0, 0, rx, 1, rz));
}

function boat(b, x, y, z, len, col = '#c9c7bd') {
  b.add(new THREE.SphereGeometry(1, 8, 5), col, mat4(x, y + 0.6, z, 0, 0, 0, 1.2, 0.7, len / 2));
}

function aaMount(b, x, y, z, col, gunCol, aim = 0.7) {
  b.cyl(0.9, 1.1, 0.8, 8, col, x, y + 0.4, z);
  b.add(new THREE.CylinderGeometry(0.1, 0.13, 4.5, 5), gunCol, mat4(x, y + 1.3, z + 1.2, Math.PI / 2 - aim, 0, 0));
}

// ============ 戦艦 ============
// spec: {L, B, turrets:[[frac, guns, superfire, facing]], mast:'tripod'|'cage', funnels:1|2, cat:boolean}
export function buildBattleship(spec) {
  const b = new Builder();
  const { L, B } = spec;
  const C = US;
  const h = hull(b, { L, B, draft: 9.2, fb: { bow: 10.5, mid: 7.5, stern: 6.2 }, colors: C, deckColor: C.deck, bowStart: 0.7, sternW: 0.5 });
  const D = (f) => h.deckAt(f * L);
  const tw = spec.big ? 10.5 : 10;
  const aa = [];
  for (const [f, guns, sup, facing] of spec.turrets) {
    const z = f * L, y = D(f) + (sup ? 3 : 0);
    if (sup) b.cyl(tw * 0.45, tw * 0.45, 3, 14, C.sup, 0, D(f) + 1.5, z);
    b.cyl(tw * 0.48, tw * 0.48, 0.6, 14, C.sup, 0, y + 0.3, z);
    turret(b, 0, y + 0.5, z, facing, guns, guns === 3 ? tw : tw * 0.9, guns === 2 && spec.big ? 18 : 16, C.sup, C.gun);
  }
  const yM = D(0.05);
  // 上部構造
  b.box(B * 0.42, 5, L * 0.1, C.sup, 0, yM + 2.5, L * 0.12);
  b.box(B * 0.34, 4, L * 0.06, C.sup, 0, yM + 7, L * 0.13);
  b.cyl(2.6, 2.6, 4, 12, C.sup, 0, yM + 11, L * 0.155); // 司令塔
  b.box(B * 0.55, 0.4, 7, C.sup, 0, yM + 9.2, L * 0.15); // 艦橋ウイング
  b.box(B * 0.58, 3, L * 0.2, C.sup, 0, yM + 1.5, -L * 0.03); // 端艇甲板
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) boat(b, s * B * 0.17, yM + 3, -L * 0.07 + i * 7, 9);
  // 副砲 (5インチ/51 ケースメイト) と高角砲 (5インチ/25)
  for (let i = 0; i < 5; i++) for (const s of [1, -1]) {
    const z = L * 0.1 - i * L * 0.045;
    b.add(new THREE.CylinderGeometry(0.12, 0.15, 6, 6), C.gun, mat4(s * (B / 2 + 1.5), D(z / L) - 2, z, Math.PI / 2, 0, s * 0.0));
  }
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
    const x = s * B * 0.33, z = L * 0.05 - i * L * 0.05, y = yM + 3;
    aaMount(b, x, y, z, C.sup, C.gun);
    aa.push([x, y + 2, z]);
  }
  // マスト
  const fy = yM + 9;
  if (spec.mast === 'cage') {
    cageMast(b, 0, L * 0.11, yM + 5, 30, 3.6, 2.4, C.sup, C.top);
    cageMast(b, 0, -L * 0.12, yM + 1, 26, 3.4, 2.3, C.sup, C.top);
    b.box(6, 4, 8, C.sup, 0, yM + 3, -L * 0.12);
  } else {
    tripod(b, 0, L * 0.1, yM + 5, 30, 4, C.sup, C.top);
    tripod(b, 0, -L * 0.13, yM + 1, 22, 3.5, C.sup, C.top);
    b.box(6, 3, 8, C.sup, 0, yM + 2.5, -L * 0.13);
  }
  // 煙突
  if (spec.funnels === 2) { funnel(b, 0, L * 0.04, yM + 3, 12, 2.4, 3.2, C.sup); funnel(b, 0, -L * 0.04, yM + 3, 12, 2.4, 3.2, C.sup); }
  else funnel(b, 0, L * 0.015, yM + 3, 13, 3.0, 4.5, C.sup);
  // 艦尾カタパルト
  b.box(1.5, 1.2, 20, C.gun, B * 0.25, D(-0.45) + 0.8, -L * 0.42, 0, 0.3, 0);
  b.box(1.2, 1.2, 18, C.gun, 0, D(-0.22) + 6.5, -L * 0.22);
  b.cyl(0.2, 0.2, 8, 4, C.sup, 0, D(0.47) + 4, L * 0.47);
  b.cyl(0.15, 0.15, 6, 4, C.sup, 0, D(-0.48) + 3, -L * 0.48);
  const mesh = b.build(MAT.ship);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  return { group: g, L, B, top: fy + 30, draft: 9.2, deckY: yM, aa, funnelPos: [0, yM + 15, L * 0.015] };
}

// ============ 空母 ============
function deckTexture(kind, W, Lm) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 2048;
  const x = c.getContext('2d');
  const jp = kind === 'akagi' || kind === 'kaga';
  x.fillStyle = jp ? '#9b7d55' : '#6f6c63'; x.fillRect(0, 0, 256, 2048);
  for (let i = 0; i < 256; i += 4) {
    x.fillStyle = `rgba(${jp ? 60 : 30},${jp ? 40 : 30},20,${0.08 + Math.random() * 0.12})`; x.fillRect(i, 0, 1, 2048);
    for (let k = 0; k < 20; k++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; x.fillRect(i, Math.random() * 2048, 4, 40 + Math.random() * 120); }
  }
  const px = (m) => m / Lm * 2048; // 艦尾=上
  x.fillStyle = '#f0efe8';
  if (jp) {
    // 艦尾の紅白縞
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f0efe8' : '#b8211f'; x.fillRect(i * 32, 0, 32, px(5)); }
    x.fillStyle = '#f0efe8';
    for (let i = 0; i < 12; i++) x.fillRect(126, px(20 + i * 18), 4, px(9)); // 中心線
    x.save(); x.translate(128, px(32)); x.rotate(Math.PI);
    x.font = `bold ${px(16)}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(kind === 'akagi' ? 'ア' : 'カ', 0, 0); x.restore();
    for (const d of [55, 70]) { x.fillRect(20, px(d), 216, 3); }
  } else {
    x.fillRect(4, 0, 3, 2048); x.fillRect(249, 0, 3, 2048);
    for (let i = 0; i < 40; i++) x.fillRect(126, px(10 + i * 7), 4, px(4));
    const name = kind === 'lex' ? 'LEX' : kind === 'sara' ? 'SARA' : 'ENT';
    x.font = `bold ${px(14)}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(128, px(22)); x.rotate(Math.PI); x.fillText(name, 0, 0); x.restore();
    x.fillText(name, 128, 2048 - px(22));
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function buildCarrier(kind) {
  const b = new Builder();
  let L, B, deckL, deckW, deckY, deckZ = 0, C, islandSide = -1;
  const aa = [];
  if (kind === 'akagi') { L = 260.7; B = 31.3; deckL = 249; deckW = 30.5; deckY = 21; C = JP; islandSide = 1; }
  else if (kind === 'kaga') { L = 247.6; B = 32.5; deckL = 248; deckW = 30.5; deckY = 21; C = JP; islandSide = -1; }
  else if (kind === 'lex' || kind === 'sara') { L = 270.7; B = 32.3; deckL = 263; deckW = 32; deckY = 18.5; C = US; }
  else { L = 246.7; B = 25.4; deckL = 244; deckW = 26.2; deckY = 17; C = US; }
  const jp = C === JP;
  const hullFb = jp ? { bow: 11, mid: 8.5, stern: 8 } : kind === 'ent' ? { bow: 13, mid: 9, stern: 9 } : { bow: deckY - 0.5, mid: deckY - 2.5, stern: deckY - 6 };
  hull(b, { L, B, draft: 8.5, fb: hullFb, colors: C, deckColor: C.deck, bowStart: 0.7, sternW: 0.6, flare: kind === 'lex' || kind === 'sara' ? 0.05 : 0 });
  // 格納庫
  const hgL = deckL * (jp ? 0.78 : 0.8), hgZ = jp ? -L * 0.04 : -L * 0.02;
  const hgB = hullFb.mid;
  b.box(B * 0.9, deckY - hgB, hgL, C.hull, 0, (deckY + hgB) / 2, hgZ);
  if (kind === 'ent') {
    // 開放式格納庫の開口部
    for (let i = 0; i < 9; i++) for (const s of [1, -1]) b.box(0.3, 4, 16, '#1d2124', s * B * 0.451, deckY - 4.5, hgZ - hgL / 2 + 14 + i * 24);
  }
  // 飛行甲板（下面と側面）
  b.box(deckW, 0.9, deckL, C.sup, 0, deckY - 0.45, deckZ);
  // 支柱
  for (const zz of [deckL / 2 - 12, deckL / 2 - 30, -deckL / 2 + 10, -deckL / 2 + 26]) for (const s of [1, -1]) {
    b.box(0.8, deckY - 8, 0.8, C.hull, s * deckW * 0.35, (deckY + 8) / 2, zz);
  }
  // 艦橋（アイランド）
  const ix = islandSide * (deckW / 2 - 3.5);
  if (kind === 'akagi') {
    b.box(5, 8, 9, C.sup, ix, deckY + 4, L * 0.02);
    b.box(6, 2.5, 6, C.sup, ix, deckY + 9, L * 0.025);
    tripod(b, ix, L * 0.0, deckY + 10, 10, 1.4, C.sup, C.top, 'pole');
    // 右舷 下向き大煙突
    const fx = -B / 2 - 2;
    b.add(new THREE.CylinderGeometry(3.4, 3.4, 16, 14), C.sup, mat4(fx - 2, deckY - 6, L * 0.02, 0, 0, -1.0));
    b.add(new THREE.CylinderGeometry(3.0, 3.0, 1, 14), '#151515', mat4(fx - 8.4, deckY - 10.3, L * 0.02, 0, 0, -1.0));
    b.cyl(1.6, 1.6, 9, 10, C.sup, fx + 1.5, deckY - 1.5, L * 0.06);
    // 20cm 単装砲（後部ケースメイト）
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) b.add(new THREE.CylinderGeometry(0.2, 0.25, 9, 6), C.gun, mat4(s * (B / 2 + 3), 7, -L * 0.28 - i * 9, Math.PI / 2, 0, 0));
  } else if (kind === 'kaga') {
    b.box(5, 7, 10, C.sup, ix, deckY + 3.5, L * 0.13);
    b.box(6, 2.5, 7, C.sup, ix, deckY + 8, L * 0.13);
    tripod(b, ix, L * 0.11, deckY + 9, 9, 1.4, C.sup, C.top, 'pole');
    b.add(new THREE.CylinderGeometry(2.3, 2.3, 70, 12), C.sup, mat4(-B / 2 - 2.5, deckY - 7, -L * 0.1, Math.PI / 2, 0, 0));
    b.add(new THREE.CylinderGeometry(2.3, 2.3, 8, 12), C.sup, mat4(-B / 2 - 3.5, deckY - 9.5, -L * 0.25, 0, 0, -1.2));
    for (let i = 0; i < 5; i++) for (const s of [1, -1]) b.add(new THREE.CylinderGeometry(0.2, 0.25, 9, 6), C.gun, mat4(s * (B / 2 + 3), 7, -L * 0.26 - i * 8, Math.PI / 2, 0, 0));
  } else if (kind === 'lex' || kind === 'sara') {
    b.box(6, 10, 22, C.sup, ix, deckY + 5, L * 0.08);
    tripod(b, ix, L * 0.07, deckY + 10, 16, 2.2, C.sup, C.top);
    // 巨大煙突
    b.box(7.5, 24, 38, C.sup, ix - 0.5, deckY + 12, -L * 0.07);
    b.box(7.6, 1.2, 38.2, '#161616', ix - 0.5, deckY + 23.8, -L * 0.07);
    if (kind === 'sara') b.box(7.7, 23, 3.5, '#151515', ix - 0.5, deckY + 11.5, -L * 0.07);
    // 8インチ連装砲塔
    for (const [f, fac] of [[0.21, 1], [0.165, 1], [-0.2, -1], [-0.245, -1]]) {
      const sup = Math.abs(f) < 0.2 || f === -0.2 ? 2.5 : 0;
      turret(b, ix - 1.5, deckY + 0.2 + (f === 0.165 || f === -0.2 ? 2.5 : 0), f * L, fac, 2, 7, 10, C.sup, C.gun, 0.05);
    }
  } else {
    // ヨークタウン級
    b.box(6, 9, 26, C.sup, ix, deckY + 4.5, L * 0.03);
    b.box(5, 4, 12, C.sup, ix, deckY + 11, L * 0.05);
    b.box(6.5, 14, 10, C.sup, ix - 0.3, deckY + 9, -L * 0.03);
    b.box(6.6, 0.8, 10.2, '#161616', ix - 0.3, deckY + 16, -L * 0.03);
    tripod(b, ix, L * 0.06, deckY + 13, 12, 1.8, C.sup, C.top);
  }
  // 対空砲座（スポンソン）
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
    const z = (i < 2 ? 0.36 - i * 0.07 : -0.3 - (i - 2) * 0.07) * L;
    const x = s * (deckW / 2 + 1.5), y = deckY - 2.5;
    b.box(4, 0.5, 6, C.sup, x, y, z);
    aaMount(b, x, y, z, C.sup, C.gun);
    aa.push([x, y + 2, z]);
  }
  const mesh = b.build(MAT.ship); mesh.castShadow = true; mesh.receiveShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  // 甲板テクスチャ
  const dg = new THREE.PlaneGeometry(deckW, deckL); dg.rotateX(-Math.PI / 2);
  const dm = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ map: deckTexture(kind, deckW, deckL), roughness: 0.85 }));
  dm.position.set(0, deckY + 0.02, deckZ); dm.receiveShadow = true;
  g.add(dm);
  return { group: g, L, B, top: deckY + 30, draft: 8.5, deckY, deckL, deckW, deckZ, aa, islandSide, islandX: ix, funnelPos: [ix, deckY + 20, -L * 0.05] };
}

// ============ 巡洋艦・駆逐艦・その他 ============
export function buildCruiser({ L = 185, B = 18.8, fwd = 3, aft = 2, guns = 3, funnels = 2, jp = false, mast = 'tripod' } = {}) {
  const b = new Builder(); const C = jp ? JP : US; const aa = [];
  const h = hull(b, { L, B, draft: 6.5, fb: { bow: 9, mid: 6, stern: 5 }, colors: C, deckColor: C.deck, bowStart: 0.66, sternW: 0.5 });
  const D = (f) => h.deckAt(f * L);
  const tw = 7.5;
  for (let i = 0; i < fwd; i++) { const f = 0.32 - i * 0.065; const sup = i === 1 ? 2.5 : 0; if (sup) b.cyl(3.2, 3.2, 2.5, 10, C.sup, 0, D(f) + 1.2, f * L); turret(b, 0, D(f) + sup, f * L, 1, guns, tw, 11, C.sup, C.gun); }
  for (let i = 0; i < aft; i++) { const f = -0.3 + i * 0.065; const sup = i === 1 ? 2.5 : 0; if (sup) b.cyl(3.2, 3.2, 2.5, 10, C.sup, 0, D(f) + 1.2, f * L); turret(b, 0, D(f) + sup, f * L, -1, guns, tw, 11, C.sup, C.gun); }
  const y = D(0.1);
  b.box(B * 0.45, 9, L * 0.08, C.sup, 0, y + 4.5, L * 0.17);
  b.box(B * 0.3, 3, L * 0.05, C.sup, 0, y + 10, L * 0.17);
  tripod(b, 0, L * 0.13, y + 9, 16, 2.5, C.sup, C.top);
  b.box(B * 0.5, 3, L * 0.22, C.sup, 0, y + 1.5, 0);
  for (let i = 0; i < funnels; i++) funnel(b, 0, L * (0.06 - i * (funnels > 2 ? 0.05 : 0.1)), y + 3, 11, 1.8, 2.8, C.sup, 0.05);
  tripod(b, 0, -L * 0.12, y + 2, 14, 2, C.sup, C.top, 'pole');
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const p = [s * B * 0.32, y + 3, L * 0.04 - i * L * 0.05]; aaMount(b, p[0], p[1] - 0.5, p[2], C.sup, C.gun); aa.push([p[0], p[1] + 1.5, p[2]]); }
  const mesh = b.build(MAT.ship); mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  return { group: g, L, B, top: y + 30, draft: 6.5, deckY: y, aa, funnelPos: [0, y + 14, L * 0.06] };
}

export function buildDestroyer({ L = 104, B = 10.4, funnels = 2, guns = 4, jp = false } = {}) {
  const b = new Builder(); const C = jp ? JP : US; const aa = [];
  const h = hull(b, { L, B, draft: 3.6, fb: { bow: 7, mid: 4, stern: 3.5 }, colors: C, deckColor: C.deck, bowStart: 0.62, sternW: 0.5 });
  const D = (f) => h.deckAt(f * L);
  // 艦首楼段差
  b.box(B * 0.9, 2.5, L * 0.35, C.hull, 0, D(0.2) - 0.3, L * 0.27);
  const pos = jp ? [[0.36, 1], [-0.28, -1], [-0.36, -1]] : guns === 5 ? [[0.38, 1], [0.3, 1], [-0.25, -1], [-0.32, -1], [-0.4, -1]] : [[0.38, 1], [0.3, 1], [-0.3, -1], [-0.38, -1]];
  pos.forEach(([f, fac], i) => {
    const y = D(f) + (f > 0 ? 2.2 : 0) + (i === 1 && f > 0 ? 1.5 : 0);
    if (jp) turret(b, 0, y, f * L, fac, 2, 3.8, 5, C.sup, C.gun, 0.05);
    else { b.box(3, 2.4, 3.2, C.sup, 0, y + 1.2, f * L); b.add(new THREE.CylinderGeometry(0.1, 0.12, 5, 6), C.gun, mat4(0, y + 1.6, f * L + fac * 3.5, Math.PI / 2, 0, 0)); }
  });
  const y = D(0.15) + 2;
  b.box(B * 0.5, 5, L * 0.08, C.sup, 0, y + 2.5, L * 0.18);
  b.cyl(0.3, 0.35, 16, 5, C.sup, 0, y + 10, L * 0.13);
  b.box(3, 0.3, 0.4, C.sup, 0, y + 15, L * 0.13);
  for (let i = 0; i < funnels; i++) funnel(b, 0, L * (0.05 - i * 0.12), D(0) + 0.5, 8, 1.3, 2.0, C.sup, 0.08);
  // 魚雷発射管
  for (const f of [-0.05, -0.15]) b.add(new THREE.CylinderGeometry(0.35, 0.35, 7, 8), '#555', mat4(0, D(f) + 1, f * L, Math.PI / 2, 0.5, 0));
  aa.push([0, y + 2, 0]);
  const mesh = b.build(MAT.ship); mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  return { group: g, L, B, top: y + 16, draft: 3.6, deckY: D(0), aa, funnelPos: [0, D(0) + 9, L * 0.05] };
}

// 補助艦（工作艦・給油艦・標的艦）
export function buildAux({ L = 150, B = 20, kind = 'oiler' } = {}) {
  const b = new Builder(); const C = US; const aa = [];
  const h = hull(b, { L, B, draft: 7, fb: { bow: 9, mid: 6, stern: 7 }, colors: C, deckColor: C.deck, bowStart: 0.72, sternW: 0.6 });
  if (kind === 'target') {
    b.box(B * 0.6, 4, L * 0.5, C.sup, 0, 8, 0);
    for (const f of [0.3, 0.2, -0.2, -0.3]) b.cyl(4, 4, 2.5, 10, C.sup, 0, 7.5, f * L);
    tripod(b, 0, L * 0.12, 9, 14, 2, C.sup, C.top, 'pole');
    funnel(b, 0, 0, 9, 9, 2.2, 3, C.sup);
  } else {
    b.box(B * 0.7, 7, L * 0.12, C.sup, 0, 9, kind === 'oiler' ? -L * 0.35 : L * 0.25);
    b.box(B * 0.6, 3, L * 0.06, C.sup, 0, 14, kind === 'oiler' ? L * 0.3 : L * 0.25);
    funnel(b, 0, kind === 'oiler' ? -L * 0.36 : 0, 12, 9, 2, 2.6, C.sup);
    for (const f of [0.15, -0.15]) tripod(b, 0, f * L, 6, 14, 1.6, C.sup, C.top, 'pole');
    if (kind === 'oiler') for (let i = 0; i < 6; i++) b.box(B * 0.5, 0.8, 4, '#3a3f42', 0, 6.4, L * 0.25 - i * L * 0.08);
  }
  aa.push([B * 0.3, 10, 0], [-B * 0.3, 10, 0]);
  const mesh = b.build(MAT.ship); mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  return { group: g, L, B, top: 30, draft: 7, deckY: 6, aa, funnelPos: [0, 18, 0] };
}

// 霧島（金剛型戦艦・パゴダマスト）
export function buildKongo() {
  const b = new Builder(); const C = JP; const L = 222, B = 31; const aa = [];
  const h = hull(b, { L, B, draft: 9.5, fb: { bow: 10, mid: 7.5, stern: 6 }, colors: C, deckColor: '#8a7656', bowStart: 0.68, sternW: 0.5 });
  const D = (f) => h.deckAt(f * L);
  for (const [f, sup, fac] of [[0.3, 0, 1], [0.22, 3, 1], [-0.02, 0, -1], [-0.3, 0, -1]]) {
    if (sup) b.cyl(4.6, 4.6, 3, 12, C.sup, 0, D(f) + 1.5, f * L);
    turret(b, 0, D(f) + sup, f * L, fac, 2, 9.5, 16, C.sup, C.gun);
  }
  const y = D(0.1);
  // パゴダマスト
  for (let i = 0; i < 7; i++) b.box(12 - i * 1.2, 3.6, 11 - i * 1.0, C.sup, 0, y + 2 + i * 3.6, L * 0.14);
  b.cyl(1.2, 1.5, 34, 6, C.sup, 0, y + 17, L * 0.14);
  b.box(5, 3, 5, C.top, 0, y + 31, L * 0.14);
  funnel(b, 0, L * 0.07, y + 2, 13, 2.6, 3.4, C.sup, 0.08);
  funnel(b, 0, -L * 0.07, y + 2, 11, 2.6, 3.4, C.sup, 0.08);
  tripod(b, 0, -L * 0.15, y + 2, 20, 2.5, C.sup, C.top, 'pole');
  aa.push([8, y + 4, 0], [-8, y + 4, 0]);
  const mesh = b.build(MAT.ship); mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  return { group: g, L, B, top: y + 34, draft: 9.5, deckY: y, aa, funnelPos: [0, y + 15, L * 0.07] };
}

// ---- 艦型諸元 ----
const T = (f, g, s, fac) => [f, g, s, fac];
export const BB_SPECS = {
  // ペンシルベニア級
  pennsylvania: { L: 185.3, B: 32.4, turrets: [T(0.31, 3, 0, 1), T(0.23, 3, 1, 1), T(-0.21, 3, 1, -1), T(-0.29, 3, 0, -1)], mast: 'tripod', funnels: 1 },
  // ネバダ級（三連装＋連装）
  nevada: { L: 177.7, B: 32.9, turrets: [T(0.31, 3, 0, 1), T(0.23, 2, 1, 1), T(-0.21, 2, 1, -1), T(-0.29, 3, 0, -1)], mast: 'tripod', funnels: 1 },
  // テネシー級
  tennessee: { L: 190.3, B: 29.7, turrets: [T(0.31, 3, 0, 1), T(0.23, 3, 1, 1), T(-0.21, 3, 1, -1), T(-0.29, 3, 0, -1)], mast: 'cage', funnels: 2 },
  // コロラド級（16インチ連装）
  colorado: { L: 190.2, B: 29.7, big: true, turrets: [T(0.31, 2, 0, 1), T(0.23, 2, 1, 1), T(-0.21, 2, 1, -1), T(-0.29, 2, 0, -1)], mast: 'cage', funnels: 2 },
};
