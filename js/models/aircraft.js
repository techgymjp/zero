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

// 外板のパネルライン・リベット・汚れ・排気汚れをシェーダーで描く
function addSkinDetail(mat, scale = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vObj;
      float pline(float v, float period){
        float t = v / period;
        float w = fwidth(t);
        float d = min(fract(t), 1.0 - fract(t));
        float l = 1.0 - smoothstep(0.0, max(w * 1.2, 0.012 / period), d);
        return l * (1.0 - smoothstep(0.04, 0.2, w));
      }
      float hash3(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float vnoise(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 o = vObj * ${(1 / scale).toFixed(3)};
        float wing = smoothstep(0.55, 0.8, abs(o.x));
        float lines = max(pline(o.z + 0.13, 0.62), pline(o.x + 0.2, 1.05) * wing);
        lines = max(lines, pline(o.y + 0.05, 0.55) * (1.0 - wing) * 0.6);
        // リベット列
        float rv = pline(o.z + 0.44, 0.62) * step(0.5, fract(o.x * 9.0 + o.y * 9.0)) * 0.5;
        float n = vnoise(o * 3.1) * 0.6 + vnoise(o * 11.0) * 0.4;
        diffuseColor.rgb *= (1.0 - 0.28 * lines - 0.12 * rv) * (0.9 + 0.12 * n);
        // 排気の煤汚れ（機首側面の後方）
        float ex = smoothstep(0.32, 0.5, abs(o.x)) * (1.0 - smoothstep(0.85, 1.1, abs(o.x)))
          * smoothstep(0.2, 1.4, o.z) * (1.0 - smoothstep(2.9, 3.3, o.z)) * (1.0 - smoothstep(0.1, 0.45, abs(o.y + 0.12)));
        diffuseColor.rgb *= 1.0 - 0.35 * ex * (0.6 + 0.4 * n);
        // 主翼付け根の踏み跡（塗装の擦れ）
        float walk = smoothstep(0.45, 0.6, abs(o.x)) * (1.0 - smoothstep(1.3, 1.6, abs(o.x))) * smoothstep(-0.5, 0.0, o.z) * (1.0 - smoothstep(0.6, 1.0, o.z)) * step(-0.45, o.y) * step(o.y, -0.15);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.8, 0.76), walk * n);
      }`);
  };
  mat.customProgramCacheKey = () => 'skin' + scale;
  return mat;
}

function discTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(30,30,30,0.05)'); g.addColorStop(0.75, 'rgba(40,40,40,0.22)');
  g.addColorStop(0.86, 'rgba(200,170,60,0.28)'); g.addColorStop(0.92, 'rgba(40,40,40,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function initMaterials() {
  atlas = makeAtlas();
  MAT.vehicle = addSkinDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.22, side: THREE.DoubleSide }));
  MAT.parts = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25, side: THREE.DoubleSide });
  MAT.ship = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
  MAT.glass = new THREE.MeshPhysicalMaterial({ color: 0x8fa6b8, roughness: 0.03, metalness: 0.0, transmission: 0, transparent: true, opacity: 0.38, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false });
  MAT.decal = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
  MAT.prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide });
  MAT.disc = new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

// ---- 共通部品 ----
// プロペラ: 幅広・ねじれ付きの羽根（jp: 金属地に赤帯 / us: 黒に黄色の先端）
function bladeGeometry(R, style) {
  const pos = [], col = [], idx = [];
  const N = 10;
  const front = new THREE.Color(style === 'jp' ? '#a9a59a' : '#1c1c1c'), back = new THREE.Color(style === 'jp' ? '#5a3b26' : '#1c1c1c');
  const stripe = new THREE.Color(style === 'jp' ? '#b3141b' : '#e0b21c');
  for (let i = 0; i <= N; i++) {
    const t = i / N, r = 0.12 + t * (R - 0.12);
    const chord = (0.16 + 0.12 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.75)) * (t > 0.85 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.85) / 0.15) ** 2)) : 1);
    const tw = (0.9 - t * 0.65); // ねじれ
    const th = 0.04 * (1 - t * 0.6);
    const isStripe = style === 'jp' ? (t > 0.78 && t < 0.83) || (t > 0.86 && t < 0.91) : t > 0.9;
    for (const [cx, cy, face] of [[-chord / 2, 0, 1], [chord / 2, 0, 1], [chord / 2, 0, -1], [-chord / 2, 0, -1]]) {
      const lx = cx, lz = face * th / 2;
      const x = lx * Math.cos(tw) - lz * Math.sin(tw), z = lx * Math.sin(tw) + lz * Math.cos(tw);
      pos.push(x, r, z);
      const c = isStripe ? stripe : face > 0 ? front : back;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function addProp(group, z, radius, blades, hub = 0, style = 'jp') {
  const prop = new THREE.Group(); prop.position.set(0, hub, z);
  const bl = new THREE.Group();
  const bg = bladeGeometry(radius, style);
  for (let i = 0; i < blades; i++) {
    const m = new THREE.Mesh(bg, MAT.prop);
    m.rotation.z = i * Math.PI * 2 / blades;
    bl.add(m);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), MAT.disc);
  disc.visible = false;
  prop.add(bl, disc);
  prop.userData = { blades: bl, disc };
  group.add(prop);
  return prop;
}

// 操縦士（飛行帽・ゴーグル・救命胴衣）
function pilot(b, y, z, style = 'jp') {
  const helmet = style === 'jp' ? '#4a3220' : '#5b4630', suit = style === 'jp' ? '#6b5a3e' : '#7a6a4a';
  b.box(0.42, 0.3, 0.26, suit, 0, y - 0.18, z - 0.02);
  if (style === 'jp') b.box(0.44, 0.16, 0.28, '#c9b27a', 0, y - 0.1, z - 0.01); // 救命胴衣
  b.sphere(0.13, helmet, 0, y + 0.1, z, 1, 1.08, 1.1, 10);
  b.add(new THREE.TorusGeometry(0.1, 0.022, 5, 12, Math.PI), '#222', mat4(0, y + 0.12, z + 0.06, 0, 0, 0, 1, 0.55, 1));
  for (const s of [1, -1]) b.sphere(0.035, '#7aa0b0', s * 0.05, y + 0.11, z + 0.115, 1, 1, 0.5, 6);
  b.box(0.16, 0.22, 0.05, '#2a2a28', 0, y + 0.02, z - 0.2); // 防弾板・ヘッドレスト
}

// 操縦翼面（エルロン・昇降舵・方向舵）を別メッシュで
function addControls(g, c, color) {
  const mk = (w, h, d, zOff) => {
    const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, 0, -d / 2 + zOff);
    const bb = new Builder(); bb.add(geo, color); return bb.build(MAT.vehicle);
  };
  const ctrl = {};
  const piv = (x, y, z, mesh) => { const p = new THREE.Group(); p.position.set(x, y, z); p.add(mesh); g.add(p); return p; };
  ctrl.ailL = piv(c.ail.x, c.ail.y, c.ail.z, mk(c.ail.w, c.ail.t, c.ail.d, 0));
  ctrl.ailR = piv(-c.ail.x, c.ail.y, c.ail.z, mk(c.ail.w, c.ail.t, c.ail.d, 0));
  ctrl.ailL.rotation.z = c.ail.dih; ctrl.ailR.rotation.z = -c.ail.dih;
  ctrl.ailL.children[0].rotation.order = ctrl.ailR.children[0].rotation.order = 'XYZ';
  ctrl.elL = piv(c.el.x, c.el.y, c.el.z, mk(c.el.w, c.el.t, c.el.d, 0));
  ctrl.elR = piv(-c.el.x, c.el.y, c.el.z, mk(c.el.w, c.el.t, c.el.d, 0));
  ctrl.rud = piv(0, c.rud.y, c.rud.z, mk(c.rud.t, c.rud.h, c.rud.d, 0));
  return ctrl;
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
  // 気化器空気取入口・潤滑油冷却器・カウルフラップ
  b.box(0.22, 0.12, 0.5, COWL, 0, 0.66, 3.75);
  b.box(0.36, 0.2, 0.55, COWL, 0, -0.62, 3.35);
  b.box(0.3, 0.04, 0.05, '#111', 0, -0.58, 3.63);
  b.add(new THREE.CylinderGeometry(0.66, 0.64, 0.12, 18, 1, true), '#2a2a2a', mat4(0, 0, 3.05, Math.PI / 2, 0, 0, 1, 1, 1.05));
  // 空中線支柱とアンテナ線・ピトー管
  b.add(new THREE.CylinderGeometry(0.012, 0.03, 0.75, 5), AME, mat4(0, 0.98, -1.15, -0.25, 0, 0));
  b.between([0, 1.33, -1.25], [0, 1.6, -3.85], 0.006, '#222', 3);
  b.zcyl(0.012, 0.012, 0.55, 4, '#666', 4.6, -0.18, 1.05);
  // 主脚収納部の蓋線・翼端灯
  for (const s of [1, -1]) {
    b.sphere(0.05, s > 0 ? '#c03030' : '#30a040', s * 5.98, -0.4 + Math.tan(6 * D) * 5.98, 0.42, 1, 0.6, 1.6, 6);
  }
  pilot(b, 0.6, 0.12, 'jp');
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
    fb.add(new THREE.TorusGeometry(1, 0.03, 4, 20, Math.PI), '#8e8a74', mat4(0, 0.6, z, 0, 0, 0, 0.362 * k, 0.432 * k, 1));
  }
  // 風防の縦枠
  for (const a of [0.5, Math.PI / 2, Math.PI - 0.5]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const z = 1.25 - i * 0.28; const k = Math.sqrt(Math.max(0, 1 - ((z - 0.15) / 1.25) ** 2)); pts.push(new THREE.Vector3(Math.cos(a) * 0.362 * k, 0.6 + Math.sin(a) * 0.432 * k, z)); }
    fb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 4), '#8e8a74');
  }
  g.add(fb.build(MAT.parts));
  const prop = addProp(g, 4.45, 1.45, 3, 0, 'jp');
  const ctrl = addControls(g, {
    ail: { x: 4.55, y: -0.4 + Math.tan(6 * D) * 4.55, z: -0.36, w: 1.9, t: 0.05, d: 0.42, dih: 6 * D },
    el: { x: 1.25, y: 0.08, z: -4.2, w: 1.9, t: 0.05, d: 0.48 },
    rud: { y: 0.98, z: -4.42, t: 0.05, h: 1.25, d: 0.52 },
  }, AME);
  const gb = new Builder();
  for (const s of [1, -1]) gearLeg(gb, s * 1.75, 1.05, 1.35, 0.3, '#888', -0.42);
  gb.cyl(0.11, 0.11, 0.08, 8, '#111', 0, -0.55, -4.0, 0, 0, Math.PI / 2);
  const gear = gb.build(MAT.vehicle); gear.visible = false; g.add(gear);
  const stores = [];
  if (bombs) {
    const rk = new Builder();
    rk.box(0.1, 0.34, 0.9, '#3a3a36', 0, -0.62, 0.5);
    for (const s of [1, -1]) rk.box(0.06, 0.16, 0.5, '#3a3a36', s * 2.7, -0.38, 0.55);
    g.add(rk.build(MAT.parts));
    const b250 = bombMesh(1.75, 0.2); b250.position.set(0, -0.92, 0.5); b250.userData.kind = 250; g.add(b250); stores.push(b250);
    for (const s of [1, -1]) { const b60 = bombMesh(1.0, 0.115); b60.position.set(s * 2.7, -0.52, 0.55); b60.userData.kind = 60; g.add(b60); stores.push(b60); }
  }
  g.userData = { prop, gear, body, stores, propR: 1.45, ctrl };
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
  b.box(0.2, 0.14, 0.7, OD.top, 0, 0.66, 3.3); // 気化器空気取入口
  b.add(new THREE.CylinderGeometry(0.012, 0.03, 0.7, 5), OD.top, mat4(0, 0.95, -1.9, -0.2, 0, 0));
  b.between([0, 1.28, -2.0], [0, 1.85, -4.3], 0.006, '#222', 3);
  pilot(b, 0.6, -0.55, 'us');
  for (const s of [1, -1]) {
    const y = -0.48 + Math.tan(6 * D) * 3.9;
    if (s > 0) b.decal(DECAL.STAR, 1.25, 1.25, mat4(s * 3.9, y + 0.1, 0.65, -Math.PI / 2, 0, s * 6 * D));
    else b.decal(DECAL.STAR, 1.25, 1.25, mat4(s * 3.9, y - 0.08, 0.65, Math.PI / 2, 0, s * 6 * D));
  }
  return finishFighter(b, 1.55, 3, 4.6, 0.6, false, OD.top, {
    ail: { x: 4.3, y: -0.48 + Math.tan(6 * D) * 4.3, z: -0.05, w: 1.7, t: 0.05, d: 0.42, dih: 6 * D },
    el: { x: 1.05, y: 0.05, z: -4.35, w: 1.6, t: 0.05, d: 0.5 },
    rud: { y: 1.05, z: -4.65, t: 0.05, h: 1.3, d: 0.55 },
  });
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
  b.box(0.24, 0.14, 0.6, BG.top, 0, 0.78, 3.3);
  b.add(new THREE.CylinderGeometry(0.012, 0.03, 0.6, 5), BG.top, mat4(0, 1.0, -1.7, -0.15, 0, 0));
  pilot(b, 0.62, -0.25, 'us');
  for (const s of [1, -1]) {
    const y = -0.2 + Math.tan(4 * D) * 4.2;
    b.decal(DECAL.STAR, 1.3, 1.3, mat4(s * 4.2, y + 0.1, 0.45, -Math.PI / 2, 0, s * 4 * D));
    b.decal(DECAL.STAR, 1.3, 1.3, mat4(s * 4.2, y - 0.08, 0.45, Math.PI / 2, 0, s * 4 * D));
    b.decal(DECAL.STAR, 0.95, 0.95, mat4(s * 0.6, 0.05, -1.6, 0, s * Math.PI / 2, 0));
  }
  return finishFighter(b, 1.5, 3, 4.15, 0.62, true, BG.top, {
    ail: { x: 4.6, y: -0.2 + Math.tan(4 * D) * 4.6, z: -0.2, w: 1.6, t: 0.06, d: 0.45, dih: 4 * D },
    el: { x: 1.2, y: 0.15, z: -4.1, w: 1.7, t: 0.05, d: 0.45 },
    rud: { y: 1.0, z: -4.35, t: 0.05, h: 1.25, d: 0.5 },
  });
}

function finishFighter(b, propR, blades, propZ, canopyY, radial = false, color = '#777', ctrlSpec = null) {
  const g = new THREE.Group();
  const body = b.build(MAT.vehicle, MAT.decal); body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), MAT.glass);
  glass.scale.set(0.34, 0.42, 0.95); glass.position.set(0, canopyY, radial ? -0.2 : -0.5);
  g.add(glass);
  const fb = new Builder();
  for (const dz of [0.55, 0, -0.55]) {
    const k = Math.sqrt(1 - (dz / 0.95) ** 2);
    fb.add(new THREE.TorusGeometry(1, 0.03, 4, 20, Math.PI), '#333', mat4(0, canopyY, (radial ? -0.2 : -0.5) + dz, 0, 0, 0, 0.345 * k, 0.425 * k, 1));
  }
  g.add(fb.build(MAT.parts));
  const prop = addProp(g, propZ, propR, blades, 0, 'us');
  const ctrl = ctrlSpec ? addControls(g, ctrlSpec, color) : null;
  g.userData = { prop, body, stores: [], propR, ctrl };
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
