// 航空機モデル（前方 +Z, 上 +Y, 左翼 +X）
import * as THREE from 'three';
import { Builder, mat4, wingGeometry, taperedSections, latheZ } from './builder.js';

const D = Math.PI / 180;
export const MAT = {};
let atlas;

export const DECAL = { HINO: 0, HINO_W: 1, STAR: 2, RED: 3, AI101: 4, AI102: 5, AI103: 6, AI1XX: 7, AI3: 8, AI2: 9 };

function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  const cell = (i) => [(i % 4) * 128, Math.floor(i / 4) * 128];
  // 日の丸
  let [cx, cy] = cell(0);
  x.fillStyle = '#b3141b'; x.beginPath(); x.arc(cx + 64, cy + 64, 60, 0, Math.PI * 2); x.fill();
  [cx, cy] = cell(1);
  x.fillStyle = '#f2f2ee'; x.beginPath(); x.arc(cx + 64, cy + 64, 62, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#b3141b'; x.beginPath(); x.arc(cx + 64, cy + 64, 50, 0, Math.PI * 2); x.fill();
  // 米軍国籍標識 (1941: 青円・白星・中央赤丸)
  [cx, cy] = cell(2);
  x.fillStyle = '#1e2f6a'; x.beginPath(); x.arc(cx + 64, cy + 64, 62, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f4f4f4'; x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 23 : 60, a = -Math.PI / 2 + i * Math.PI / 5;
    x.lineTo(cx + 64 + Math.cos(a) * r, cy + 64 + Math.sin(a) * r);
  }
  x.fill();
  x.fillStyle = '#c0171d'; x.beginPath(); x.arc(cx + 64, cy + 64, 20, 0, Math.PI * 2); x.fill();
  [cx, cy] = cell(3); x.fillStyle = '#b3141b'; x.fillRect(cx, cy, 128, 128);
  const txt = (i, s, col) => {
    const [px, py] = cell(i);
    x.fillStyle = col; x.font = 'bold 40px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(s, px + 64, py + 64, 120);
  };
  txt(4, 'AI-101', '#f2f2ee'); txt(5, 'AI-102', '#f2f2ee'); txt(6, 'AI-103', '#f2f2ee'); txt(7, 'AI-108', '#f2f2ee');
  txt(8, 'AI-311', '#f2f2ee'); txt(9, 'AI-211', '#f2f2ee');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function initMaterials() {
  atlas = makeAtlas();
  MAT.vehicle = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.18, side: THREE.DoubleSide });
  MAT.ship = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
  MAT.glass = new THREE.MeshStandardMaterial({ color: 0x1d2b38, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.5 });
  MAT.decal = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
  MAT.prop = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
  MAT.disc = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
}

// ---- 共通部品 ----
function addProp(group, z, radius, blades, hub = 0) {
  const prop = new THREE.Group(); prop.position.set(0, hub, z);
  const bl = new THREE.Group();
  for (let i = 0; i < blades; i++) {
    const g = new THREE.BoxGeometry(0.2, radius, 0.05);
    g.translate(0, radius / 2, 0);
    // 先端を細く
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) > radius * 0.6) p.setX(k, p.getX(k) * 0.6);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, MAT.prop);
    m.rotation.z = i * Math.PI * 2 / blades; m.rotation.y = 0.25;
    bl.add(m);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), MAT.disc);
  disc.visible = false;
  prop.add(bl, disc);
  prop.userData = { blades: bl, disc };
  group.add(prop);
  return prop;
}

function gearLeg(b, x, z, len, wheelR, col, yTop) {
  b.cyl(0.05, 0.05, len, 6, col, x, yTop - len / 2, z);
  b.cyl(wheelR, wheelR, 0.14, 12, '#1b1b1b', x, yTop - len, z, 0, 0, Math.PI / 2);
}

function bombMesh(len, r, col = '#3a3a35') {
  const b = new Builder();
  b.add(latheZ([[len / 2, 0], [len / 2 - r * 0.8, r * 0.7], [len / 2 - r * 1.8, r], [-len / 2 + r * 2, r], [-len / 2 + r * 0.5, r * 0.4], [-len / 2, r * 0.3]], 10), col);
  b.box(r * 2.6, 0.02, r * 1.6, col, 0, 0, -len / 2 + r * 0.6);
  b.box(0.02, r * 2.6, r * 1.6, col, 0, 0, -len / 2 + r * 0.6);
  b.cyl(r * 1.01, r * 1.01, 0.05, 10, '#c2a63a', 0, 0, len * 0.15, Math.PI / 2, 0, 0);
  const m = b.build(MAT.vehicle);
  m.castShadow = true;
  return m;
}
export function torpedoMesh() {
  const b = new Builder();
  b.add(latheZ([[2.65, 0], [2.55, 0.15], [2.3, 0.225], [-2.2, 0.225], [-2.5, 0.12], [-2.65, 0.05]], 10), '#5a5c58');
  b.box(0.7, 0.02, 0.4, '#4a4a46', 0, 0, -2.5); b.box(0.02, 0.7, 0.4, '#4a4a46', 0, 0, -2.5);
  return b.build(MAT.vehicle);
}
export { bombMesh };

function finSections(h, root, tip, zq) {
  return taperedSections({ span: h * 2, rootChord: root, tipChord: tip, zq0: zq, y0: 0, tRoot: 0.1, tTip: 0.08, roundTip: 0.35, n: 4 });
}

// ---- 零式艦上戦闘機二一型 ----
export function buildZero({ code = DECAL.AI101, leader = false, bombs = false } = {}) {
  const AME = '#bdb999', COWL = '#1d1d1f';
  const b = new Builder();
  b.add(latheZ([[4.62, 0], [4.56, 0.12], [4.42, 0.22], [4.26, 0.27], [4.24, 0.2]], 14), '#a8a48a');
  b.add(latheZ([[4.22, 0.4], [4.16, 0.58], [3.95, 0.64], [3.5, 0.655], [3.1, 0.635]], 18, 1.05), COWL);
  b.add(latheZ([[3.12, 0.62], [2.2, 0.64], [1.0, 0.64], [0, 0.6], [-1, 0.53], [-2, 0.43], [-3, 0.31], [-4, 0.17], [-4.45, 0.05]], 18, 1.1), AME);
  // 後部胴体の背 (タートルデッキ)
  b.sphere(1, AME, 0, 0.5, -1.0, 0.3, 0.32, 1.7, 12);
  // 排気管
  for (const s of [1, -1]) b.zcyl(0.05, 0.05, 0.4, 6, '#3a2a20', s * 0.5, -0.2, 2.9);
  // 主翼・尾翼
  b.add(wingGeometry(taperedSections({ span: 12, rootChord: 2.55, tipChord: 1.4, zq0: 0.55, y0: -0.4, dihedral: 6 * D, tRoot: 0.15, tTip: 0.09, roundTip: 0.13, s0: 0.25, sweepQ: 0.02 })), AME);
  b.add(wingGeometry(taperedSections({ span: 4.8, rootChord: 1.3, tipChord: 0.8, zq0: -3.9, y0: 0.08, tRoot: 0.1, tTip: 0.08, roundTip: 0.35, n: 4 })), AME);
  const fin = wingGeometry(finSections(1.45, 1.45, 0.7, -3.85), { mirror: false });
  b.add(fin, AME, mat4(0, 0.25, 0, 0, 0, Math.PI / 2));
  // 20mm機銃 銃身
  for (const s of [1, -1]) b.zcyl(0.035, 0.035, 0.6, 6, '#222', s * 2.3, -0.28, 2.0);
  // 7.7mm機銃の溝
  for (const s of [1, -1]) b.box(0.06, 0.04, 0.8, '#111', s * 0.18, 0.66, 3.3);
  // 尾輪・着艦フック
  b.box(0.05, 0.05, 0.9, '#333', 0, -0.12, -4.15, -0.25, 0, 0);
  // 小隊長機の胴体帯
  if (leader) b.add(new THREE.CylinderGeometry(0.535, 0.535, 0.3, 18, 1, true), '#c01a1f', mat4(0, 0, -1.25, Math.PI / 2, 0, 0, 1.02, 1, 1.12));
  // デカール
  const dih = 6 * D;
  for (const s of [1, -1]) {
    const yT = -0.4 + Math.tan(dih) * 4.1;
    b.decal(DECAL.HINO, 1.15, 1.15, mat4(s * 4.1, yT + 0.1, 0.42, -Math.PI / 2, 0, s * dih));
    b.decal(DECAL.HINO, 1.15, 1.15, mat4(s * 4.1, yT - 0.07, 0.42, Math.PI / 2, 0, s * dih));
    b.decal(DECAL.HINO, 0.86, 0.86, mat4(s * 0.475, 0.04, -2.0, 0, s * Math.PI / 2, 0));
    b.decal(code, 1.0, 1.0, mat4(s * 0.07, 0.95, -4.15, 0, s * Math.PI / 2, 0));
  }
  const g = new THREE.Group();
  const body = b.build(MAT.vehicle, MAT.decal); body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), MAT.glass);
  glass.scale.set(0.36, 0.43, 1.25); glass.position.set(0, 0.6, 0.15);
  g.add(glass);
  // 風防枠
  const fb = new Builder();
  for (const z of [1.15, 0.5, -0.2, -0.75]) {
    const k = Math.sqrt(1 - ((z - 0.15) / 1.25) ** 2);
    fb.add(new THREE.TorusGeometry(1, 0.06, 4, 16, Math.PI), '#9c9880', mat4(0, 0.6, z, 0, 0, 0, 0.365 * k, 0.435 * k, 1));
  }
  g.add(fb.build(MAT.vehicle));
  const prop = addProp(g, 4.45, 1.45, 3);
  const gb = new Builder();
  for (const s of [1, -1]) gearLeg(gb, s * 1.75, 1.05, 1.35, 0.3, '#888', -0.42);
  gb.cyl(0.11, 0.11, 0.08, 8, '#111', 0, -0.55, -4.0, 0, 0, Math.PI / 2);
  const gear = gb.build(MAT.vehicle); gear.visible = false; g.add(gear);
  const stores = [];
  if (bombs) {
    const b250 = bombMesh(1.75, 0.2); b250.position.set(0, -0.92, 0.5); b250.userData.kind = 250; g.add(b250); stores.push(b250);
    for (const s of [1, -1]) { const b60 = bombMesh(1.0, 0.115); b60.position.set(s * 2.7, -0.55, 0.55); b60.userData.kind = 60; g.add(b60); stores.push(b60); }
  }
  g.userData = { prop, gear, body, stores, propR: 1.45 };
  return g;
}

// ---- P-40B ウォーホーク ----
export function buildP40() {
  const OD = { top: '#545a3b', bottom: '#8c8f88' };
  const b = new Builder();
  b.add(latheZ([[5.0, 0], [4.86, 0.14], [4.62, 0.27], [4.55, 0.3]], 12), '#3a3d2c');
  b.add(latheZ([[4.55, 0.38], [4.2, 0.46], [3.6, 0.53], [2.8, 0.58], [2.0, 0.6], [1.0, 0.62], [0, 0.6], [-1, 0.54], [-2, 0.44], [-3, 0.31], [-4, 0.17], [-4.62, 0.05]], 16, 1.15), OD, null, { split: 0.05 });
  b.sphere(1, OD.bottom, 0, -0.52, 3.2, 0.42, 0.42, 1.2, 10); // あご下ラジエーター
  b.cyl(0.3, 0.3, 0.06, 10, '#111', 0, -0.52, 4.25, Math.PI / 2, 0, 0);
  b.sphere(1, OD.top, 0, 0.5, -1.6, 0.28, 0.3, 1.6, 10);
  for (const s of [1, -1]) for (let i = 0; i < 6; i++) b.box(0.05, 0.05, 0.12, '#2b2118', s * 0.5, 0.12, 3.6 - i * 0.18);
  b.add(wingGeometry(taperedSections({ span: 11.38, rootChord: 2.65, tipChord: 1.25, zq0: 0.85, y0: -0.48, dihedral: 6 * D, tRoot: 0.15, tTip: 0.09, roundTip: 0.1, s0: 0.25, sweepQ: 0.04 })), OD);
  b.add(wingGeometry(taperedSections({ span: 4.0, rootChord: 1.4, tipChord: 0.8, zq0: -4.0, y0: 0.05, tRoot: 0.1, tTip: 0.08, roundTip: 0.3, n: 4 })), OD);
  b.add(wingGeometry(finSections(1.5, 1.5, 0.75, -4.0), { mirror: false }), OD.top, mat4(0, 0.3, 0, 0, 0, Math.PI / 2));
  for (const s of [1, -1]) b.zcyl(0.03, 0.03, 0.5, 6, '#222', s * 2.6, -0.4, 2.0);
  for (const s of [1, -1]) {
    const y = -0.48 + Math.tan(6 * D) * 3.9;
    if (s > 0) b.decal(DECAL.STAR, 1.25, 1.25, mat4(s * 3.9, y + 0.1, 0.65, -Math.PI / 2, 0, s * 6 * D));
    else b.decal(DECAL.STAR, 1.25, 1.25, mat4(s * 3.9, y - 0.08, 0.65, Math.PI / 2, 0, s * 6 * D));
  }
  return finishFighter(b, 1.55, 3, 4.6, 0.6);
}

// ---- F4F-3 ワイルドキャット ----
export function buildF4F() {
  const BG = { top: '#6c7d8c', bottom: '#b8bcbb' };
  const b = new Builder();
  b.add(latheZ([[4.35, 0], [4.25, 0.16], [4.1, 0.25]], 12), '#555');
  b.add(latheZ([[4.08, 0.45], [4.0, 0.62], [3.7, 0.7], [3.1, 0.71]], 16, 1.05), BG.top);
  b.add(latheZ([[3.1, 0.71], [2.0, 0.74], [1.0, 0.73], [0, 0.66], [-1, 0.55], [-2, 0.42], [-3, 0.28], [-4, 0.13], [-4.4, 0.05]], 16, 1.18), BG, null, { split: -0.1 });
  b.sphere(1, BG.top, 0, 0.55, -1.4, 0.3, 0.32, 1.5, 10);
  b.add(wingGeometry(taperedSections({ span: 11.58, rootChord: 2.3, tipChord: 1.35, zq0: 0.6, y0: -0.2, dihedral: 4 * D, tRoot: 0.15, tTip: 0.1, roundTip: 0.05, s0: 0.3 })), BG);
  b.add(wingGeometry(taperedSections({ span: 4.4, rootChord: 1.3, tipChord: 0.8, zq0: -3.75, y0: 0.15, tRoot: 0.1, tTip: 0.08, roundTip: 0.15, n: 4 })), BG);
  b.add(wingGeometry(finSections(1.5, 1.3, 0.8, -3.8), { mirror: false }), BG.top, mat4(0, 0.35, 0, 0, 0, Math.PI / 2));
  for (const s of [1, -1]) b.zcyl(0.03, 0.03, 0.5, 6, '#222', s * 2.4, -0.15, 1.7);
  for (const s of [1, -1]) {
    const y = -0.2 + Math.tan(4 * D) * 4.2;
    b.decal(DECAL.STAR, 1.3, 1.3, mat4(s * 4.2, y + 0.1, 0.45, -Math.PI / 2, 0, s * 4 * D));
    b.decal(DECAL.STAR, 1.3, 1.3, mat4(s * 4.2, y - 0.08, 0.45, Math.PI / 2, 0, s * 4 * D));
    b.decal(DECAL.STAR, 0.95, 0.95, mat4(s * 0.6, 0.05, -1.6, 0, s * Math.PI / 2, 0));
  }
  return finishFighter(b, 1.5, 3, 4.15, 0.62, true);
}

function finishFighter(b, propR, blades, propZ, canopyY, radial = false) {
  const g = new THREE.Group();
  const body = b.build(MAT.vehicle, MAT.decal); body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), MAT.glass);
  glass.scale.set(0.33, 0.4, 0.95); glass.position.set(0, canopyY, radial ? -0.2 : -0.5);
  g.add(glass);
  const prop = addProp(g, propZ, propR, blades);
  g.userData = { prop, body, stores: [], propR };
  return g;
}

// ---- 九七式艦上攻撃機 ----
export function buildKate({ torpedo = true } = {}) {
  const C = { top: '#45503a', bottom: '#a7a796' };
  const b = new Builder();
  b.add(latheZ([[5.05, 0], [4.95, 0.18], [4.75, 0.28]], 12), '#777');
  b.add(latheZ([[4.7, 0.5], [4.55, 0.66], [4.1, 0.72], [3.55, 0.7]], 16), '#1d1d1f');
  b.add(latheZ([[3.55, 0.68], [2, 0.68], [0, 0.62], [-2, 0.48], [-4, 0.24], [-5.2, 0.06]], 16, 1.1), C, null, { split: 0 });
  b.add(wingGeometry(taperedSections({ span: 15.5, rootChord: 3.0, tipChord: 1.4, zq0: 1.2, y0: -0.45, dihedral: 6 * D, tRoot: 0.15, tTip: 0.09, roundTip: 0.12, s0: 0.3 })), C);
  b.add(wingGeometry(taperedSections({ span: 5.2, rootChord: 1.5, tipChord: 0.9, zq0: -4.6, y0: 0.1, roundTip: 0.3, n: 4, tRoot: 0.1, tTip: 0.08 })), C);
  b.add(wingGeometry(finSections(1.7, 1.6, 0.8, -4.6), { mirror: false }), C.top, mat4(0, 0.3, 0, 0, 0, Math.PI / 2));
  for (const s of [1, -1]) {
    const y = -0.45 + Math.tan(6 * D) * 5;
    b.decal(DECAL.HINO, 1.3, 1.3, mat4(s * 5, y + 0.1, 1.0, -Math.PI / 2, 0, s * 6 * D));
    b.decal(DECAL.HINO, 1.3, 1.3, mat4(s * 5, y - 0.08, 1.0, Math.PI / 2, 0, s * 6 * D));
    b.decal(DECAL.AI3, 1.1, 1.1, mat4(s * 0.07, 1.0, -4.8, 0, s * Math.PI / 2, 0));
  }
  const g = new THREE.Group();
  const body = b.build(MAT.vehicle, MAT.decal); body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), MAT.glass);
  glass.scale.set(0.38, 0.42, 2.4); glass.position.set(0, 0.62, 0.3); g.add(glass);
  const prop = addProp(g, 4.85, 1.6, 3);
  const stores = [];
  if (torpedo) { const t = torpedoMesh(); t.position.set(0, -0.95, 0.6); g.add(t); stores.push(t); }
  g.userData = { prop, body, stores, propR: 1.6 };
  return g;
}

// ---- 九九式艦上爆撃機 ----
export function buildVal() {
  const C = '#bab697';
  const b = new Builder();
  b.add(latheZ([[5.0, 0], [4.9, 0.17], [4.7, 0.26]], 12), '#777');
  b.add(latheZ([[4.65, 0.5], [4.5, 0.64], [4.05, 0.7], [3.5, 0.68]], 16), '#1d1d1f');
  b.add(latheZ([[3.5, 0.66], [2, 0.66], [0, 0.6], [-2, 0.46], [-4, 0.22], [-5.1, 0.06]], 16, 1.1), C);
  b.add(wingGeometry(taperedSections({ span: 14.4, rootChord: 2.9, tipChord: 1.2, zq0: 1.1, y0: -0.45, dihedral: 6 * D, tRoot: 0.15, tTip: 0.09, roundTip: 0.35, s0: 0.3 })), C);
  b.add(wingGeometry(taperedSections({ span: 4.8, rootChord: 1.5, tipChord: 0.9, zq0: -4.5, y0: 0.1, roundTip: 0.35, n: 4, tRoot: 0.1, tTip: 0.08 })), C);
  b.add(wingGeometry(finSections(1.6, 1.6, 0.8, -4.5), { mirror: false }), C, mat4(0, 0.3, 0, 0, 0, Math.PI / 2));
  // 固定脚のスパッツ
  for (const s of [1, -1]) {
    b.box(0.12, 1.0, 0.5, C, s * 1.7, -0.95, 1.4);
    b.sphere(1, C, s * 1.7, -1.45, 1.35, 0.22, 0.42, 0.75, 10);
    const y = -0.45 + Math.tan(6 * D) * 4.6;
    b.decal(DECAL.HINO, 1.3, 1.3, mat4(s * 4.6, y + 0.1, 0.95, -Math.PI / 2, 0, s * 6 * D));
    b.decal(DECAL.HINO, 1.3, 1.3, mat4(s * 4.6, y - 0.08, 0.95, Math.PI / 2, 0, s * 6 * D));
    b.decal(DECAL.AI2, 1.1, 1.1, mat4(s * 0.07, 1.0, -4.7, 0, s * Math.PI / 2, 0));
  }
  const g = new THREE.Group();
  const body = b.build(MAT.vehicle, MAT.decal); body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), MAT.glass);
  glass.scale.set(0.37, 0.42, 2.1); glass.position.set(0, 0.62, 0.2); g.add(glass);
  const prop = addProp(g, 4.8, 1.6, 3);
  const bomb = bombMesh(1.75, 0.2); bomb.position.set(0, -0.95, 0.6); g.add(bomb);
  g.userData = { prop, body, stores: [bomb], propR: 1.6 };
  return g;
}

// ---- 駐機用（ジオメトリのみ、頂点カラー） ----
export function parkedGeometry(type) {
  const b = new Builder();
  if (type === 'p40' || type === 'f4f') {
    const C = type === 'p40' ? { top: '#545a3b', bottom: '#8c8f88' } : { top: '#6c7d8c', bottom: '#b8bcbb' };
    b.add(latheZ([[4.9, 0], [4.5, 0.32], [3.0, 0.58], [1.0, 0.62], [-1, 0.54], [-3, 0.31], [-4.6, 0.05]], 10, 1.15), C, null, { split: 0.05 });
    b.add(wingGeometry(taperedSections({ span: 11.4, rootChord: 2.6, tipChord: 1.25, zq0: 0.85, y0: -0.48, dihedral: 6 * D, roundTip: 0.1, s0: 0.25, n: 4 })), C);
    b.add(wingGeometry(taperedSections({ span: 4.0, rootChord: 1.4, tipChord: 0.8, zq0: -4.0, y0: 0.05, roundTip: 0.3, n: 2 })), C);
    b.box(0.1, 1.4, 1.2, C.top, 0, 0.75, -4.0);
    b.sphere(1, '#24303a', 0, 0.62, -0.5, 0.32, 0.38, 0.9, 8);
    for (let i = 0; i < 3; i++) b.box(0.2, 1.5, 0.05, '#222', 0, 0, 4.7, 0, 0, i * 2.1);
    for (const s of [1, -1]) gearLeg(b, s * 1.7, 1.0, 1.2, 0.32, '#666', -0.45);
    b.box(0.1, 0.4, 0.1, '#222', 0, -0.3, -4.2);
    const g = b.geometry(); g.translate(0, 1.55, 0); g.rotateX(-0.18); return g;
  }
  if (type === 'b17') {
    const C = { top: '#5a5e44', bottom: '#8d908a' };
    b.add(latheZ([[10.5, 0.2], [10, 0.9], [8, 1.3], [3, 1.45], [-2, 1.35], [-6, 0.95], [-10, 0.35]], 12, 1.05), C, null, { split: 0 });
    b.add(wingGeometry(taperedSections({ span: 31.6, rootChord: 6.0, tipChord: 2.4, zq0: 2.5, y0: -0.2, dihedral: 4 * D, roundTip: 0.06, s0: 1.0, n: 4 })), C);
    b.add(wingGeometry(taperedSections({ span: 13, rootChord: 3.6, tipChord: 1.8, zq0: -8.6, y0: 0.3, roundTip: 0.1, n: 2 })), C);
    b.box(0.35, 5.2, 4.5, C.top, 0, 3.2, -8.5);
    for (const s of [3.8, 8.2]) for (const k of [1, -1]) {
      b.zcyl(0.65, 0.7, 3.5, 10, C.top, k * s, -0.3 + s * 0.06, 4.2);
      for (let i = 0; i < 3; i++) b.box(0.25, 3.5, 0.06, '#222', k * s, -0.3 + s * 0.06, 6.0, 0, 0, i * 2.1);
    }
    b.sphere(1, '#2a3540', 0, 1.2, 8.3, 0.8, 0.6, 1.2, 8);
    for (const s of [1, -1]) gearLeg(b, s * 3.8, 3.5, 2.4, 0.65, '#555', -0.3);
    const g = b.geometry(); g.translate(0, 3.3, 0); g.rotateX(-0.08); return g;
  }
  if (type === 'pby') {
    const C = { top: '#6d7d8c', bottom: '#c5c8c6' };
    b.add(latheZ([[9.5, 0.1], [8.5, 1.1], [5, 1.4], [0, 1.4], [-4, 1.0], [-9.5, 0.3]], 10, 1.25), C, null, { split: -0.3 });
    b.box(1.0, 2.2, 3.0, C.top, 0, 2.4, 0.5);
    b.add(wingGeometry([{ s: 0, zq: 1.2, chord: 4.0, t: 0.16, y: 3.6 }, { s: 15.8, zq: 1.2, chord: 3.0, t: 0.12, y: 3.6 }]), C);
    b.add(wingGeometry(taperedSections({ span: 9, rootChord: 2.4, tipChord: 1.6, zq0: -8.6, y0: 1.6, roundTip: 0.1, n: 2 })), C);
    b.box(0.25, 3.4, 3.0, C.top, 0, 3.0, -8.7);
    for (const k of [1, -1]) {
      b.zcyl(0.6, 0.65, 3.0, 10, C.top, k * 3.3, 3.6, 2.8);
      for (let i = 0; i < 3; i++) b.box(0.22, 3.0, 0.06, '#222', k * 3.3, 3.6, 4.4, 0, 0, i * 2.1);
      b.box(0.6, 0.6, 2.2, C.top, k * 14.5, 1.6, 1.2);
      b.between([k * 14.5, 1.9, 1.2], [k * 14.5, 3.5, 1.2], 0.07, '#555');
      b.between([k * 1.2, 1.2, 1], [k * 6, 3.5, 1], 0.08, '#555');
    }
    const g = b.geometry(); g.translate(0, 1.6, 0); return g;
  }
  throw new Error('unknown parked type ' + type);
}

// 撃墜・破壊時の残骸色
export const WRECK_COLOR = new THREE.Color(0x2a2522);
