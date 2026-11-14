// オアフ島 地形生成（高さ・テクスチャ・メッシュ）
import * as THREE from 'three';
import { TERRAIN, DETAIL, OAHU, RIDGES, CRATERS, HARBOR_STROKES, HARBOR_ELLIPSES, DRYDOCKS, AIRFIELDS, TOWNS, FORD, fordPt } from './geo.js';
import { fbm, ridged, valueNoise, smoothstep, clamp, lerp, segDist2D, mulberry32 } from '../util.js';

const MASK = 1024;
const GT = 2048;   // 全島テクスチャ
const DT = 4096;   // 真珠湾詳細テクスチャ

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(src);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0; const row = y * w;
      for (let x = -r; x <= r; x++) acc += out[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / (2 * r + 1);
        acc += out[row + clamp(x + r + 1, 0, w - 1)] - out[row + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / (2 * r + 1);
        acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
      }
    }
  }
  return out;
}

function sampleGrid(arr, w, h, fx, fy) {
  fx = clamp(fx, 0, w - 1.001); fy = clamp(fy, 0, h - 1.001);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const i = y0 * w + x0;
  return lerp(lerp(arr[i], arr[i + 1], tx), lerp(arr[i + w], arr[i + w + 1], tx), ty);
}

// 海岸線を細分化してノイズで凹凸を付ける
function buildCoast() {
  const out = [];
  const n = OAHU.length;
  for (let i = 0; i < n; i++) {
    const a = OAHU[i], b = OAHU[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len / 350));
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      let x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t);
      // 真珠湾入口付近は乱さない
      const nearPH = Math.hypot(x + 900, z - 5200) < 2500 ? 0.15 : 1;
      const j = (fbm(x / 3000, z / 3000, 4) - 0.5) * 900 * nearPH;
      out.push([x + nx * j, z + nz * j]);
    }
  }
  return out;
}

function pathCoast(ctx, coast, tx) {
  ctx.beginPath();
  const n = coast.length;
  const mid = (i) => { const a = coast[i % n], b = coast[(i + 1) % n]; return tx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); };
  let m = mid(0); ctx.moveTo(m[0], m[1]);
  for (let i = 1; i <= n; i++) {
    const p = tx(coast[i % n][0], coast[i % n][1]); m = mid(i);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

function drawHarborWater(ctx, tx, scale) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of HARBOR_STROKES) {
    ctx.lineWidth = s.w * scale;
    ctx.beginPath();
    s.pts.forEach((p, i) => { const q = tx(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.stroke();
  }
  for (const e of HARBOR_ELLIPSES) {
    const q = tx(e.cx, e.cz);
    ctx.beginPath(); ctx.ellipse(q[0], q[1], e.a * scale, e.b * scale, e.ang * Math.PI / 180, 0, Math.PI * 2); ctx.fill();
  }
  for (const d of DRYDOCKS) {
    const q = tx(d.c[0], d.c[1]);
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(Math.atan2(d.dir[1], d.dir[0]));
    ctx.fillRect(-d.len * scale / 2, -d.w * scale / 2, d.len * scale, d.w * scale); ctx.restore();
  }
}
function drawFordIsland(ctx, tx, scale) {
  const q = tx(FORD.cx, FORD.cz);
  ctx.beginPath();
  ctx.ellipse(q[0], q[1], FORD.a * scale, FORD.b * scale, FORD.ang * Math.PI / 180, 0, Math.PI * 2);
  ctx.fill();
}

export class Terrain {
  constructor() {
    this.coast = buildCoast();
    this._buildMasks();
    this._buildHeights();
    this._buildTextures();
    this._buildMesh();
  }

  _buildMasks() {
    const c = document.createElement('canvas'); c.width = c.height = MASK;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const k = MASK / TERRAIN.size;
    const tx = (x, z) => [(x - TERRAIN.x0) * k, (z - TERRAIN.z0) * k];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, MASK, MASK);
    ctx.fillStyle = '#fff'; pathCoast(ctx, this.coast, tx); ctx.fill();
    const island = ctx.getImageData(0, 0, MASK, MASK).data;
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    drawHarborWater(ctx, tx, k);
    ctx.fillStyle = '#fff'; drawFordIsland(ctx, tx, k);
    const land = ctx.getImageData(0, 0, MASK, MASK).data;
    this.islandMask = new Float32Array(MASK * MASK);
    this.landMask = new Float32Array(MASK * MASK);
    for (let i = 0; i < MASK * MASK; i++) { this.islandMask[i] = island[i * 4] / 255; this.landMask[i] = land[i * 4] / 255; }
    this.blurA = boxBlur(this.landMask, MASK, MASK, 4);
    this.blurB = boxBlur(this.landMask, MASK, MASK, 22);
    this.maskCanvas = c;
  }

  mask(arr, x, z) {
    const k = MASK / TERRAIN.size;
    return sampleGrid(arr, MASK, MASK, (x - TERRAIN.x0) * k - 0.5, (z - TERRAIN.z0) * k - 0.5);
  }

  rawHeight(x, z) {
    const bA = this.mask(this.blurA, x, z), bB = this.mask(this.blurB, x, z);
    if (bA < 0.12) return lerp(-60, -6, bA / 0.12);
    let h = 4 + 270 * Math.pow(smoothstep(0.0, 1.0, bB), 1.4);
    h += (fbm(x / 2500, z / 2500, 4) - 0.5) * 60 * smoothstep(0.3, 0.8, bB);
    for (const r of RIDGES) {
      let best = 1e9, hb = 0, side = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const s = segDist2D(x, z, a[0], a[1], b[0], b[1]);
        if (s.d < best) { best = s.d; hb = lerp(a[2], b[2], s.t); side = s.side; }
      }
      // 尾根の東西で幅を変える (side>0 → 進行方向左=西側 for 南下ライン)
      const w = side > 0 ? r.wWest : r.wEast;
      const f = Math.exp(-Math.pow(best / w, 1.6));
      const rn = ridged(x / 1800, z / 1800, 5);
      const rh = hb * f * (0.45 + 0.65 * rn);
      h = Math.max(h, h * (1 - f) + rh);
    }
    for (const c of CRATERS) {
      const d = Math.hypot(x - c.p[0], z - c.p[1]);
      if (d < c.r * 2.2) {
        const ring = Math.exp(-Math.pow((d - c.r * 0.55) / (c.r * 0.3), 2));
        const bowl = d < c.r * 0.5 ? 0.45 : 1;
        h = Math.max(h, c.h * ring * bowl + (d < c.r * 0.55 ? c.h * 0.3 : 0));
      }
    }
    h *= smoothstep(0.12, 0.45, bA);
    return Math.max(h, 1.6);
  }

  _buildHeights() {
    const n = TERRAIN.seg + 1, step = TERRAIN.size / TERRAIN.seg;
    this.n = n; this.step = step;
    const H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = this.rawHeight(TERRAIN.x0 + i * step, TERRAIN.z0 + j * step);
    // 飛行場を平坦化
    this.fieldElev = {};
    for (const f of AIRFIELDS) {
      const e = f.id === 'ford' ? 2.5 : Math.max(3, this.rawHeight(f.c[0], f.c[1]));
      this.fieldElev[f.id] = e;
      for (const rw of f.runways) {
        const hd = rw.hdg * Math.PI / 180, dx = Math.sin(hd), dz = -Math.cos(hd);
        const L = rw.len / 2 + 300, W = rw.w / 2 + 350;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const x = TERRAIN.x0 + i * step - rw.c[0], z = TERRAIN.z0 + j * step - rw.c[1];
          const a = Math.abs(x * dx + z * dz), b = Math.abs(-x * dz + z * dx);
          if (a > L + 400 || b > W + 400) continue;
          const t = Math.max(smoothstep(L, L + 400, a), smoothstep(W, W + 400, b));
          const idx = j * n + i;
          if (H[idx] > 0) H[idx] = lerp(e, H[idx], t);
        }
      }
    }
    // 真珠湾の陸地は低平
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = TERRAIN.x0 + i * step, z = TERRAIN.z0 + j * step;
      const d = Math.hypot(x - 300, z - 800);
      if (d < 3500) { const idx = j * n + i; if (H[idx] > 0) H[idx] = lerp(2.5, H[idx], smoothstep(1800, 3500, d)); }
    }
    this.H = H;
  }

  heightAt(x, z) {
    return sampleGrid(this.H, this.n, this.n, (x - TERRAIN.x0) / this.step, (z - TERRAIN.z0) / this.step);
  }

  // 水面か？ (詳細範囲は精密マスク)
  isWater(x, z) {
    if (x > DETAIL.x0 && x < DETAIL.x0 + DETAIL.size && z > DETAIL.z0 && z < DETAIL.z0 + DETAIL.size) {
      const r = this.detailMaskRes;
      const i = Math.floor((x - DETAIL.x0) / DETAIL.size * r), j = Math.floor((z - DETAIL.z0) / DETAIL.size * r);
      return this.detailAlpha[j * r + i] < 128;
    }
    return this.mask(this.landMask, x, z) < 0.5;
  }

  // 地表高度 (水面は0)
  groundAt(x, z) {
    if (this.isWater(x, z)) return 0;
    return Math.max(0.5, this.heightAt(x, z));
  }

  _buildTextures() {
    // ---------- 全島テクスチャ ----------
    const g = document.createElement('canvas'); g.width = g.height = GT;
    const gx = g.getContext('2d');
    const img = gx.createImageData(GT, GT); const d = img.data;
    const pxm = TERRAIN.size / GT;
    for (let j = 0; j < GT; j++) {
      for (let i = 0; i < GT; i++) {
        const x = TERRAIN.x0 + (i + 0.5) * pxm, z = TERRAIN.z0 + (j + 0.5) * pxm;
        const m = this.mask(this.landMask, x, z);
        const o = (j * GT + i) * 4;
        if (m < 0.35) { d[o] = 30; d[o + 1] = 70; d[o + 2] = 90; d[o + 3] = 0; continue; }
        const h = this.heightAt(x, z);
        const hx = this.heightAt(x + 60, z) - this.heightAt(x - 60, z), hz = this.heightAt(x, z + 60) - this.heightAt(x, z - 60);
        const slope = Math.hypot(hx, hz) / 120;
        const bA = this.mask(this.blurA, x, z);
        const n1 = fbm(x / 700, z / 700, 4), n2 = valueNoise(x / 120, z / 120);
        let r, gg, b;
        // 低地: 草地・サトウキビ
        r = 104 + n1 * 40; gg = 128 + n1 * 30; b = 66;
        // 中央平原のパイナップル畑 (赤土と緑の区画)
        if (h > 60 && h < 380 && slope < 0.15) {
          const cx = Math.floor(x / 420 + valueNoise(z / 2000, 3) * 2), cz = Math.floor(z / 300);
          const k = valueNoise(cx * 1.7, cz * 2.3);
          if (k < 0.3) { r = 128 + n2 * 14; gg = 104 + n2 * 12; b = 66; }
          else if (k < 0.7) { r = 100 + n2 * 16; gg = 126 + n2 * 16; b = 66; }
          else { r = 118; gg = 140 + n2 * 20; b = 70; }
        }
        // 山地の森林
        const forest = smoothstep(180, 420, h + n1 * 150);
        r = lerp(r, 52 + n2 * 20, forest); gg = lerp(gg, 86 + n2 * 25, forest); b = lerp(b, 42, forest);
        // 急斜面の岩肌
        const rock = smoothstep(0.55, 1.0, slope);
        r = lerp(r, 96, rock * 0.7); gg = lerp(gg, 92, rock * 0.7); b = lerp(b, 72, rock * 0.7);
        // 砂浜
        const beach = (1 - smoothstep(0.35, 0.55, bA)) * (h < 12 ? 1 : 0);
        r = lerp(r, 214, beach); gg = lerp(gg, 200, beach); b = lerp(b, 160, beach);
        d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    gx.putImageData(img, 0, 0);
    const gk = GT / TERRAIN.size;
    const gtx = (x, z) => [(x - TERRAIN.x0) * gk, (z - TERRAIN.z0) * gk];
    gx.globalCompositeOperation = 'source-atop';
    // 市街地
    const rng = mulberry32(7);
    for (const t of TOWNS) {
      const c = gtx(t.c[0], t.c[1]);
      for (let k = 0; k < t.r / 6; k++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * t.r * gk;
        gx.fillStyle = `rgba(${150 + rng() * 50},${140 + rng() * 40},${120 + rng() * 30},0.8)`;
        gx.fillRect(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr, 2 + rng() * 2, 2 + rng() * 2);
      }
    }
    // 滑走路
    for (const f of AIRFIELDS) this._drawAirfield(gx, f, gtx, gk, false);
    gx.globalCompositeOperation = 'source-over';
    this.globalCanvas = g;

    // ---------- 真珠湾詳細テクスチャ ----------
    const dc = document.createElement('canvas'); dc.width = dc.height = DT;
    const dx = dc.getContext('2d');
    const dk = DT / DETAIL.size;
    const dtx = (x, z) => [(x - DETAIL.x0) * dk, (z - DETAIL.z0) * dk];
    dx.fillStyle = '#6f8546'; dx.fillRect(0, 0, DT, DT);
    dx.imageSmoothingEnabled = true;
    const sx = (DETAIL.x0 - TERRAIN.x0) * gk, sz = (DETAIL.z0 - TERRAIN.z0) * gk, ss = DETAIL.size * gk;
    dx.drawImage(g, sx, sz, ss, ss, 0, 0, DT, DT);
    // ノイズで質感
    const noiseC = document.createElement('canvas'); noiseC.width = noiseC.height = 256;
    const nx = noiseC.getContext('2d'); const nd = nx.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = fbm((i % 256) / 18, Math.floor(i / 256) / 18, 3) * 255;
      nd.data[i * 4] = v * 0.8; nd.data[i * 4 + 1] = v; nd.data[i * 4 + 2] = v * 0.6; nd.data[i * 4 + 3] = 50;
    }
    nx.putImageData(nd, 0, 0);
    dx.fillStyle = dx.createPattern(noiseC, 'repeat'); dx.globalCompositeOperation = 'multiply'; dx.fillRect(0, 0, DT, DT);
    dx.globalCompositeOperation = 'source-over';
    this._drawHarborDetail(dx, dtx, dk);
    // 海と湾を抜く
    dx.globalCompositeOperation = 'destination-in';
    dx.fillStyle = '#fff'; pathCoast(dx, this.coast, dtx); dx.fill();
    dx.globalCompositeOperation = 'destination-out';
    dx.fillStyle = '#000'; dx.strokeStyle = '#000';
    drawHarborWater(dx, dtx, dk);
    dx.globalCompositeOperation = 'source-over';
    // フォード島を塗り直す
    dx.save(); pathCoast(dx, this.coast, dtx); dx.clip();
    dx.fillStyle = '#7a8a50'; drawFordIsland(dx, dtx, dk);
    dx.restore();
    this._drawFordDetail(dx, dtx, dk);
    this._drawPiers(dx, dtx, dk);
    this.detailCanvas = dc;
    // CPU 用 水面マスク
    const r = 1024; this.detailMaskRes = r;
    const mc = document.createElement('canvas'); mc.width = mc.height = r;
    const mx = mc.getContext('2d', { willReadFrequently: true }); mx.drawImage(dc, 0, 0, r, r);
    const md = mx.getImageData(0, 0, r, r).data;
    this.detailAlpha = new Uint8Array(r * r);
    for (let i = 0; i < r * r; i++) this.detailAlpha[i] = md[i * 4 + 3];

    // ミニマップ
    const mm = document.createElement('canvas'); mm.width = mm.height = 512;
    const mmx = mm.getContext('2d');
    mmx.fillStyle = '#1d4660'; mmx.fillRect(0, 0, 512, 512);
    mmx.drawImage(g, 0, 0, 512, 512);
    this.minimapCanvas = mm;
  }

  _drawAirfield(ctx, f, tx, k, detail) {
    const grass = f.id === 'wheeler';
    for (const rw of f.runways) {
      const c = tx(rw.c[0], rw.c[1]);
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(rw.hdg * Math.PI / 180);
      ctx.fillStyle = grass ? '#9aa86a' : '#7d7b74';
      ctx.fillRect(-rw.w * k / 2, -rw.len * k / 2, rw.w * k, rw.len * k);
      if (detail && !grass) {
        ctx.fillStyle = 'rgba(240,240,230,0.8)';
        for (let s = -rw.len / 2 + 40; s < rw.len / 2 - 40; s += 60) ctx.fillRect(-0.8 * k, s * k, 1.6 * k, 30 * k);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(-rw.w * k / 4, -rw.len * k / 2, rw.w * k / 2, rw.len * k);
      }
      ctx.restore();
    }
    if (f.parked) {
      for (const row of f.parked.rows) {
        const c = tx(row.from[0], row.from[1]);
        const hd = row.dir * Math.PI / 180;
        const L = (row.n * row.gap + 60);
        ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(hd - Math.PI / 2);
        ctx.fillStyle = grass ? '#a3a378' : '#8b8980';
        ctx.fillRect(-30 * k, -40 * k, L * k, 80 * k);
        ctx.restore();
      }
    }
  }

  _drawHarborDetail(ctx, tx, k) {
    // ヒッカム
    const hk = AIRFIELDS.find(f => f.id === 'hickam');
    const c = tx(hk.c[0], hk.c[1]);
    ctx.fillStyle = '#878377';
    ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(75 * Math.PI / 180 - Math.PI / 2);
    ctx.fillRect(-900 * k, -950 * k, 1300 * k, 420 * k); // エプロン
    ctx.restore();
    for (const f of AIRFIELDS) this._drawAirfield(ctx, f, tx, k, true);
    // 海軍工廠
    const yard = [fordPt(-900, 1250), fordPt(500, 1250), fordPt(500, 1900), fordPt(-900, 1900)];
    ctx.fillStyle = '#8e8a80'; ctx.beginPath(); yard.forEach((p, i) => { const q = tx(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.fill();
    // 建物の屋根
    const rng = mulberry32(11);
    ctx.save();
    for (let i = 0; i < 180; i++) {
      const t = -850 + rng() * 1300, off = 1300 + rng() * 550;
      const p = tx(...fordPt(t, off));
      ctx.fillStyle = `rgb(${90 + rng() * 60},${85 + rng() * 50},${80 + rng() * 40})`;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-50 * Math.PI / 180);
      ctx.fillRect(0, 0, (15 + rng() * 50) * k, (10 + rng() * 30) * k); ctx.restore();
    }
    ctx.restore();
    // 石油タンク群
    ctx.fillStyle = '#8f8f88';
    for (const p of this.tankPositions()) { const q = tx(p[0], p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 30 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#c9c7bd';
    for (const p of this.tankPositions()) { const q = tx(p[0], p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 22 * k, 0, Math.PI * 2); ctx.fill(); }
    // 道路
    ctx.strokeStyle = 'rgba(170,160,140,0.8)'; ctx.lineWidth = 9 * k;
    const roads = [[[-900, 2600], [600, 2400], [2500, 1800], [4500, 1500]], [[600, 2400], [1300, 1600], [2400, 900], [3800, -800]], [[-4500, -3200], [-1500, -2600], [800, -2900], [3800, -3600]]];
    for (const r of roads) { ctx.beginPath(); r.forEach((p, i) => { const q = tx(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
  }

  _drawFordDetail(ctx, tx, k) {
    // フォード島の滑走路と施設
    const f = AIRFIELDS.find(a => a.id === 'ford');
    this._drawAirfield(ctx, f, tx, k, true);
    const rng = mulberry32(5);
    for (let i = 0; i < 60; i++) {
      const t = -800 + rng() * 1600, off = (rng() < 0.5 ? -1 : 1) * (200 + rng() * 220);
      if (Math.abs(off) > 520 * Math.sqrt(Math.max(0, 1 - (t / 1000) ** 2)) - 30) continue;
      const p = tx(...fordPt(t, off));
      ctx.fillStyle = `rgb(${120 + rng() * 50},${110 + rng() * 40},${100 + rng() * 30})`;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-50 * Math.PI / 180);
      ctx.fillRect(0, 0, (12 + rng() * 25) * k, (10 + rng() * 15) * k); ctx.restore();
    }
  }

  _drawPiers(ctx, tx, k) {
    ctx.fillStyle = '#8c8a82';
    // 戦艦用係留柱 (F岸壁)
    for (const t of [-760, -541, -322, -92, 136, 358]) {
      for (const dt of [-55, 55]) {
        const p = tx(...fordPt(t + dt, 548));
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-50 * Math.PI / 180);
        ctx.fillRect(-9 * k, -6 * k, 18 * k, 12 * k); ctx.restore();
      }
    }
    // 1010 岸壁と工廠の桟橋
    const piers = [[fordPt(150, 1180), 420, 22, -50], [fordPt(700, 1130), 260, 20, 40], [fordPt(-700, 1180), 200, 20, 40], [[2000, 820], 180, 18, 0], [[2350, 760], 180, 18, 0], [[2700, 780], 160, 18, 0]];
    for (const [p, L, W, rot] of piers) {
      const q = tx(p[0], p[1]);
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(rot * Math.PI / 180);
      ctx.fillRect(-L * k / 2, -W * k / 2, L * k, W * k); ctx.restore();
    }
  }

  tankPositions() {
    if (this._tanks) return this._tanks;
    const out = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
      out.push([2500 + i * 110 + (j % 2) * 50, 150 + j * 100]);
    }
    for (let i = 0; i < 4; i++) out.push([3300 + i * 110, -400 - (i % 2) * 90]);
    this._tanks = out;
    return out;
  }

  _buildMesh() {
    const n = this.n, step = this.step;
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), nor = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const idx = j * n + i;
      const x = TERRAIN.x0 + i * step, z = TERRAIN.z0 + j * step;
      pos[idx * 3] = x; pos[idx * 3 + 1] = this.H[idx]; pos[idx * 3 + 2] = z;
      uv[idx * 2] = i / (n - 1); uv[idx * 2 + 1] = j / (n - 1);
      const hl = this.H[j * n + Math.max(0, i - 1)], hr = this.H[j * n + Math.min(n - 1, i + 1)];
      const hu = this.H[Math.max(0, j - 1) * n + i], hd = this.H[Math.min(n - 1, j + 1) * n + i];
      const nx = hl - hr, nz = hu - hd, ny = 2 * step;
      const l = Math.hypot(nx, ny, nz);
      nor[idx * 3] = nx / l; nor[idx * 3 + 1] = ny / l; nor[idx * 3 + 2] = nz / l;
    }
    const index = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      index[k++] = a; index[k++] = c; index[k++] = b;
      index[k++] = b; index[k++] = c; index[k++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();

    const mk = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    this.globalTex = mk(this.globalCanvas);
    this.detailTex = mk(this.detailCanvas);
    // 細部ノイズ
    const nc = document.createElement('canvas'); nc.width = nc.height = 256;
    const nx = nc.getContext('2d'); const nd = nx.createImageData(256, 256);
    for (let i = 0; i < 65536; i++) {
      const x = i % 256, y = Math.floor(i / 256);
      const v = (fbm(x / 16, y / 16, 4) * 0.7 + valueNoise(x / 3, y / 3) * 0.3) * 255;
      nd.data[i * 4] = nd.data[i * 4 + 1] = nd.data[i * 4 + 2] = v; nd.data[i * 4 + 3] = 255;
    }
    nx.putImageData(nd, 0, 0);
    const noiseTex = new THREE.CanvasTexture(nc); noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshLambertMaterial({ map: this.globalTex, alphaTest: 0.5 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = { value: this.detailTex };
      sh.uniforms.uNoise = { value: noiseTex };
      sh.uniforms.uDetailRect = { value: new THREE.Vector4(DETAIL.x0, DETAIL.z0, DETAIL.size, DETAIL.size) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uDetail;\nuniform sampler2D uNoise;\nuniform vec4 uDetailRect;')
        .replace('#include <map_fragment>', `
          vec2 duv = (vWPos.xz - uDetailRect.xy) / uDetailRect.zw;
          vec4 texel;
          if (duv.x > 0.001 && duv.x < 0.999 && duv.y > 0.001 && duv.y < 0.999) texel = texture2D(uDetail, duv);
          else texel = texture2D(map, vMapUv);
          float nz = texture2D(uNoise, vWPos.xz / 90.0).r * 0.6 + texture2D(uNoise, vWPos.xz / 900.0).r * 0.4;
          texel.rgb *= 0.78 + 0.45 * nz;
          diffuseColor *= texel;
        `);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
}
