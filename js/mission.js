// 作戦: 世界の構築・敵味方の配置・増援
import * as THREE from 'three';
import { t } from './i18n.js';
import { buildBattleship, buildCarrier, buildCruiser, buildDestroyer, buildAux, buildKongo, BB_SPECS } from './models/ships.js';
import { Ship } from './sim/ship.js';
import { Aircraft } from './sim/aircraft.js';
import { FighterBrain, BomberBrain } from './sim/ai.js';
import { fordPt, DRYDOCKS, AIRFIELDS, KIDO_BUTAI, US_TF, ROUTE_WEST, BARBERS, ll } from './world/geo.js';
import { DECAL } from './models/aircraft.js';
import { rand, randSigned, clamp } from './util.js';

const ROW_HDG = 220; // 戦艦列: 艦首は南西

function circleMover(center, R, speed, phase0, ox, oz, dir = 1) {
  const w = speed / R * dir;
  return (t) => {
    const ph = phase0 + w * t;
    const ax = center[0] + Math.cos(ph) * R, az = center[1] + Math.sin(ph) * R;
    const dx = -Math.sin(ph) * dir, dz = Math.cos(ph) * dir;
    const h = Math.atan2(dx, -dz);
    const fx = Math.sin(h), fz = -Math.cos(h), sx = Math.cos(h), sz = Math.sin(h);
    return { x: ax + fx * oz + sx * ox, z: az + fz * oz + sz * ox, h };
  };
}

export function setupShips(game) {
  const D = game.diff;
  const add = (def) => { const s = new Ship(game, def); game.ships.push(s); return s; };
  const BBHP = 650 * D.shipHp, CVHP = 600 * D.shipHp;
  const aaBB = { heavy: 1.1 * D.aaRate, light: 9 * D.aaRate }, aaCA = { heavy: 0.9 * D.aaRate, light: 7 * D.aaRate }, aaDD = { heavy: 0.45 * D.aaRate, light: 4 * D.aaRate }, aaAux = { heavy: 0.2, light: 3 };
  const at = (t, off) => { const p = fordPt(t, off); return { x: p[0], z: p[1] }; };
  // ---- 戦艦列 (フォード島南東岸 F岸壁) ----
  const row = [
    ['カリフォルニア', 'tennessee', -760, 575],
    ['メリーランド', 'colorado', -322, 575], ['オクラホマ', 'nevada', -322, 611, 'oklahoma'],
    ['テネシー', 'tennessee', -92, 575], ['ウェストバージニア', 'colorado', -92, 611],
    ['アリゾナ', 'pennsylvania', 136, 575, 'arizona'],
    ['ネバダ', 'nevada', 358, 575],
  ];
  for (const [name, spec, t, off, special] of row) {
    add({ name: `戦艦${name}`, cls: 'BB', side: 'us', target: true, hp: BBHP, harbor: true, special, model: buildBattleship(BB_SPECS[spec]), ...at(t, off), heading: ROW_HDG, aa: aaBB });
  }
  add({ name: '給油艦ネオショー', cls: 'AUX', side: 'us', hp: 200, harbor: true, model: buildAux({ L: 168, B: 23, kind: 'oiler' }), ...at(-541, 578), heading: ROW_HDG, aa: aaAux });
  add({ name: '工作艦ヴェスタル', cls: 'AUX', side: 'us', hp: 180, harbor: true, model: buildAux({ L: 141, B: 18.6, kind: 'repair' }), ...at(136, 606), heading: ROW_HDG, aa: aaAux });
  // ペンシルベニア（第1乾ドック）
  const dd = DRYDOCKS[0];
  add({ name: '戦艦ペンシルベニア', cls: 'BB', side: 'us', target: true, hp: BBHP, harbor: true, model: buildBattleship(BB_SPECS.pennsylvania), x: dd.c[0], z: dd.c[1], heading: 130, aa: aaBB });
  add({ name: '駆逐艦ショー', cls: 'DD', side: 'us', hp: 120, harbor: true, model: buildDestroyer({ L: 104, funnels: 1, guns: 5 }), x: DRYDOCKS[1].c[0], z: DRYDOCKS[1].c[1], heading: 130, aa: aaDD });
  // フォード島北西岸
  add({ name: '標的艦ユタ', cls: 'AUX', side: 'us', hp: 250, harbor: true, model: buildAux({ L: 159, B: 32, kind: 'target' }), ...at(-150, -610), heading: 40, aa: aaAux });
  add({ name: '軽巡ローリー', cls: 'CL', side: 'us', hp: 300, harbor: true, model: buildCruiser({ L: 169, B: 16.9, fwd: 1, aft: 1, guns: 2, funnels: 4 }), ...at(130, -600), heading: 40, aa: aaCA });
  add({ name: '軽巡デトロイト', cls: 'CL', side: 'us', hp: 300, harbor: true, model: buildCruiser({ L: 169, B: 16.9, fwd: 1, aft: 1, guns: 2, funnels: 4 }), ...at(380, -580), heading: 40, aa: aaCA });
  // 海軍工廠
  add({ name: '軽巡ヘレナ', cls: 'CL', side: 'us', hp: 320, harbor: true, model: buildCruiser({ L: 185, B: 18.8 }), ...at(150, 1145), heading: 40, aa: aaCA });
  add({ name: '重巡ニューオーリンズ', cls: 'CA', side: 'us', hp: 340, harbor: true, model: buildCruiser({ L: 179, B: 18.8, fwd: 2, aft: 1 }), ...at(700, 1110), heading: 220, aa: aaCA });
  add({ name: '軽巡ホノルル', cls: 'CL', side: 'us', hp: 320, harbor: true, model: buildCruiser({ L: 185, B: 18.8 }), x: 1550, z: 1000, heading: 100, aa: aaCA });
  add({ name: '軽巡セントルイス', cls: 'CL', side: 'us', hp: 320, harbor: true, model: buildCruiser({ L: 185, B: 18.8 }), x: 2150, z: 790, heading: 100, aa: aaCA });
  // 東入江の駆逐艦群
  let k = 0;
  for (const [cx, cz] of [[1250, -2100], [1450, -2700], [1650, -3200]]) for (let i = 0; i < 3; i++) {
    add({ name: `駆逐艦${['フェルプス', 'デューイ', 'ファラガット', 'ハル', 'マクドノー', 'ワーデン', 'デール', 'モナハン', 'アイルウィン'][k++]}`, cls: 'DD', side: 'us', hp: 120, harbor: true, model: buildDestroyer({ funnels: 1 + (i % 2), guns: 4 + (i % 2) }), x: cx + i * 13, z: cz, heading: 160, aa: aaDD });
  }

  // ---- 米空母機動部隊（真珠湾南方を哨戒）----
  const tf = (ox, oz) => circleMover(US_TF.center, US_TF.radius, US_TF.speed, 0.3, ox, oz);
  const lex = (name, kind, ox, oz) => {
    const m = buildCarrier(kind);
    return add({ name, cls: 'CV', side: 'us', target: true, hp: CVHP, model: m, x: 0, z: 0, mover: tf(ox, oz), aa: { heavy: 1.2 * D.aaRate, light: 10 * D.aaRate }, carrier: { deckW: m.deckW, deckL: m.deckL, deckZ: m.deckZ, deckY: m.deckY } });
  };
  game.usCarriers = [lex('空母レキシントン', 'lex', 0, 0), lex('空母サラトガ', 'sara', 1600, -700), lex('空母エンタープライズ', 'ent', -1600, -700)];
  add({ name: '重巡インディアナポリス', cls: 'CA', side: 'us', hp: 340, model: buildCruiser({ L: 186, B: 20, fwd: 2, aft: 1 }), mover: tf(0, 2100), aa: aaCA, x: 0, z: 0 });
  add({ name: '重巡シカゴ', cls: 'CA', side: 'us', hp: 340, model: buildCruiser({ L: 183, B: 20, fwd: 2, aft: 1 }), mover: tf(0, -2300), aa: aaCA, x: 0, z: 0 });
  for (const [ox, oz] of [[2300, 1100], [-2300, 1100], [2400, -1600], [-2400, -1600]]) add({ name: '駆逐艦', cls: 'DD', side: 'us', hp: 120, model: buildDestroyer({ funnels: 2 }), mover: tf(ox, oz), aa: aaDD, x: 0, z: 0 });

  // ---- 第一航空艦隊（機動部隊）----
  // 機動部隊: 真珠湾へ艦首を向けて前進（艦首方向と地図の点線がそろう）
  const kd = KIDO_BUTAI, dl = Math.hypot(kd.center[0], kd.center[1]);
  const dir = [kd.center[0] / dl, kd.center[1] / dl];           // 真珠湾 → 機動部隊 の向き
  const kbH = Math.atan2(-dir[0], dir[1]);                       // 艦首は真珠湾へ
  const kb = (ox, oz) => (t) => {
    const dist = Math.max(kd.stopDist, kd.startDist - kd.speed * t);
    const ax = dir[0] * dist, az = dir[1] * dist;
    const fx = Math.sin(kbH), fz = -Math.cos(kbH), sx = Math.cos(kbH), sz = Math.sin(kbH);
    return { x: ax + fx * oz + sx * ox, z: az + fz * oz + sz * ox, h: kbH };
  };
  const mk = (name, kind, ox, oz) => { const m = buildCarrier(kind); return add({ name, cls: 'CV', side: 'jp', hp: 9999, model: m, mover: kb(ox, oz), x: 0, z: 0, carrier: { deckW: m.deckW, deckL: m.deckL, deckZ: m.deckZ, deckY: m.deckY } }); };
  game.akagi = mk('空母赤城', 'akagi', 0, 0);
  mk('空母加賀', 'kaga', -1800, -400);
  add({ name: '戦艦霧島', cls: 'BB', side: 'jp', hp: 9999, model: buildKongo(), mover: kb(0, 3200), x: 0, z: 0 });
  for (const ox of [2000, -2000]) add({ name: '駆逐艦', cls: 'DD', side: 'jp', hp: 9999, model: buildDestroyer({ jp: true, L: 118.5, funnels: 2 }), mover: kb(ox, 1500), x: 0, z: 0 });
}

// ---- 航空機生成 ----
export function spawnAircraft(game, type, pos, fwd, speed, brain, opts = {}) {
  const ac = new Aircraft(game, type, opts);
  ac.setPose(pos, fwd, speed);
  if (brain) ac.brain = brain(ac);
  game.aircraft.push(ac);
  return ac;
}

const SLOT_L = new THREE.Vector3(45, -6, -40), SLOT_R = new THREE.Vector3(-45, -6, -40); // 左後方・右後方

export function spawnWingmen(game, leader) {
  const codes = [DECAL.AI102, DECAL.AI103];
  return [SLOT_L, SLOT_R].map((slot, i) => {
    const p = slot.clone().applyQuaternion(leader.quat).add(leader.pos);
    const ac = spawnAircraft(game, 'zero', p, leader.fwd, leader.speed, (a) => new FighterBrain(a, { role: 'wingman', leader, slot: slot.clone() }), { modelOpts: { code: codes[i] }, name: `列機${i + 1}番`, hpMul: 1.2 });
    ac.wingman = true;
    return ac;
  });
}

// 第一次攻撃隊（カフク岬上空から西回りルートで進撃）
export function spawnFirstWave(game, origin, fwd) {
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const route = ROUTE_WEST.slice(1);
  const at = (dx, dy, dz) => origin.clone().addScaledVector(right, dx).addScaledVector(fwd, dz).add(new THREE.Vector3(0, dy, 0));
  // 雷撃隊（九七艦攻）
  for (let i = 0; i < 8; i++) spawnAircraft(game, 'kate', at(-300 + (i % 4) * 40, -400 - Math.floor(i / 4) * 15, 400 - (i % 4) * 30 - Math.floor(i / 4) * 60), fwd, 100, (a) => new BomberBrain(a, { kind: 'torpedo', route, alt: 2600, pref: 'BB' }), { modelOpts: { torpedo: true } });
  // 急降下爆撃隊（九九艦爆）
  for (let i = 0; i < 6; i++) spawnAircraft(game, 'val', at(250 + (i % 3) * 40, 300 - Math.floor(i / 3) * 15, 300 - (i % 3) * 30 - Math.floor(i / 3) * 60), fwd, 100, (a) => new BomberBrain(a, { kind: 'dive', route, alt: 3200, pref: 'BB' }));
  // 制空隊の零戦：ホイラー・ヒッカム・カネオヘへ散開
  const fields = ['wheeler', 'hickam', 'kaneohe'];
  fields.forEach((f, k) => {
    for (let i = 0; i < 3; i++) {
      spawnAircraft(game, 'zero', at(-600 + k * 600 + i * 40, 200 + i * 10, -200 - i * 40), fwd, 110, (a) => new FighterBrain(a, { role: 'strafe', field: f, home: AIRFIELDS.find(x => x.id === f).c }), { modelOpts: { code: DECAL.AI1XX } });
    }
  });
}

// ---- 増援管理 ----
export class Director {
  constructor(game) {
    this.game = game;
    this.waveT = game.diff.waveFirst; this.waveN = 0;
    this.spawnT = {};
    this.launchT = 4;
    this.quietT = 0;
  }
  usFighterCount() { return this.game.aircraft.filter(a => a.alive && a.side === 'us').length; }

  initialCAP() {
    const g = this.game;
    // 米軍は臨戦態勢: 戦闘空中哨戒
    const cap = (type, x, z, alt, n) => {
      for (let i = 0; i < n; i++) {
        const p = new THREE.Vector3(x + randSigned() * 800, alt + randSigned() * 200, z + randSigned() * 800);
        spawnAircraft(g, type, p, new THREE.Vector3(randSigned(), 0, randSigned()).normalize(), 110, (a) => new FighterBrain(a, { role: 'cap', home: [x, z] }));
      }
    };
    const D = g.diff;
    cap('p40', -12000, -26000, 2500, D.capN);           // ハレイワ・北岸上空
    cap('p40', -9000, -12000, 2000, D.capN);            // ホイラー上空
    cap('f4f', -3000, 2000, 2200, D.capN);              // 真珠湾上空
    cap('f4f', US_TF.center[0], US_TF.center[1], 2000, D.capN); // 空母上空
  }

  update(dt) {
    const g = this.game, D = g.diff;
    // 米空母からの発艦
    this.launchT -= dt;
    if (this.launchT <= 0) {
      this.launchT = D.launchInterval * (0.8 + rand() * 0.4);
      for (const cv of g.usCarriers) {
        if (cv.sunk || cv.airGroup <= 0 || this.usFighterCount() >= D.usCap) continue;
        cv.airGroup--;
        const p = cv.localToWorld(new THREE.Vector3(0, cv.deckY + 3, cv.L * 0.3));
        const f = cv.fwd.clone();
        spawnAircraft(g, 'f4f', p, f, 52, (a) => new FighterBrain(a, { role: 'cap', home: [cv.pos.x, cv.pos.z] }));
      }
    }
    // 陸上飛行場からの緊急発進（駐機機が残っている場合）
    for (const f of AIRFIELDS) {
      if (!f.scramble) continue;
      this.spawnT[f.id] = (this.spawnT[f.id] ?? (10 + rand() * 20)) - dt;
      if (this.spawnT[f.id] > 0) continue;
      this.spawnT[f.id] = D.scrambleInterval * (0.7 + rand() * 0.6);
      if (this.usFighterCount() >= D.usCap) continue;
      const pk = g.ground.takeParked(f.id);
      if (!pk) continue;
      const rw = f.runways[0], hd = rw.hdg * Math.PI / 180;
      const dir = new THREE.Vector3(Math.sin(hd), 0.12, -Math.cos(hd)).normalize();
      const p = new THREE.Vector3(rw.c[0] - dir.x * rw.len * 0.3, g.terrain.fieldElev[f.id] + 4, rw.c[1] - dir.z * rw.len * 0.3);
      spawnAircraft(g, pk.type, p, dir, 55, (a) => new FighterBrain(a, { role: 'cap', home: rw.c }));
    }
    // プレイヤー周辺が静かすぎる時は迎撃機を差し向ける
    const pl = g.player;
    if (pl && pl.alive && !pl.brain.onGround) {
      const near = g.aircraft.some(a => a.alive && a.side === 'us' && a.pos.distanceTo(pl.pos) < 7000);
      this.quietT = near ? 0 : this.quietT + dt;
      if (this.quietT > D.raidQuiet) { this.quietT = 0; this.raid(pl); }
    }
    // 攻撃隊の増援
    this.waveT -= dt;
    if (this.waveT <= 0) {
      this.waveT = D.waveInterval;
      this.spawnWave();
    }
  }

  raid(pl) {
    const g = this.game;
    // 米空母の搭載機から差し向ける（総数400機の範囲内）
    const cv = g.usCarriers.filter(c => !c.sunk && c.airGroup > 0).sort((a, b) => b.airGroup - a.airGroup)[0];
    if (!cv || this.usFighterCount() >= g.diff.usCap + 4) return;
    const n = Math.min(cv.airGroup, 2 + Math.floor(rand() * 2));
    const fwd = pl.fwd.clone().setY(0).normalize();
    const ang = (rand() - 0.5) * 1.4;
    const dir = fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const overLand = !g.terrain.isWater(pl.pos.x, pl.pos.z);
    const type = overLand && rand() < 0.6 ? 'p40' : 'f4f';
    for (let i = 0; i < n; i++) {
      cv.airGroup--;
      const p = pl.pos.clone().addScaledVector(dir, 4500 + i * 60).add(new THREE.Vector3((i - 1) * 50, 250 + rand() * 300, 0));
      p.y = Math.max(p.y, g.terrain.groundAt(p.x, p.z) + 400);
      const toPl = pl.pos.clone().sub(p).normalize();
      spawnAircraft(g, type, p, toPl, 120, (a) => { const b = new FighterBrain(a, { role: 'cap', home: [pl.pos.x, pl.pos.z] }); b.target = pl; return b; });
    }
    g.message(t('敵機接近'), 'bad');
  }

  spawnWave() {
    const g = this.game;
    this.waveN++;
    const pref = this.waveN % 2 === 0 ? 'CV' : 'BB';
    const name = this.waveN === 1 ? '第二次攻撃隊' : `第${this.waveN + 1}次攻撃隊`;
    g.message(t('攻撃隊 増援'), 'info');
    const origin = new THREE.Vector3(BARBERS[0] + 2000, 2600, BARBERS[1] + 1000);
    const target = pref === 'CV' ? new THREE.Vector3(US_TF.center[0], 0, US_TF.center[1]) : new THREE.Vector3(0, 0, 0);
    const fwd = target.clone().sub(origin).setY(0).normalize();
    const route = [[target.x, target.z]];
    const n = this.game.diff.waveSize;
    for (let i = 0; i < n; i++) {
      const p = origin.clone().add(new THREE.Vector3(randSigned() * 300, randSigned() * 100, randSigned() * 300));
      const kind = i % 2 ? 'dive' : 'torpedo';
      spawnAircraft(g, kind === 'dive' ? 'val' : 'kate', p, fwd, 100, (a) => new BomberBrain(a, { kind, route, alt: kind === 'dive' ? 3000 : 1500, pref }));
    }
    for (let i = 0; i < 5; i++) {
      const p = origin.clone().add(new THREE.Vector3(randSigned() * 300, 400, randSigned() * 300));
      spawnAircraft(g, 'zero', p, fwd, 110, (a) => new FighterBrain(a, { role: 'cap', home: [target.x, target.z] }), { modelOpts: { code: DECAL.AI1XX } });
    }
  }
}
