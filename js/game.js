// ゲーム本体
import * as THREE from 'three';
import { Terrain } from './world/terrain.js';
import { buildSky, buildLights, buildWater, updateSunShadow, cloudTexture, cloudLayout, FOG_COLOR } from './world/environment.js';
import { staticBillboards } from './fx/particles.js';
import { Effects } from './fx/effects.js';
import { initMaterials } from './models/aircraft.js';
import { Bullets, Bombs, Torpedoes } from './sim/weapons.js';
import { Ground } from './sim/ground.js';
import { PlayerFlight } from './sim/flight.js';
import { Aircraft } from './sim/aircraft.js';
import { setupShips, spawnWingmen, spawnFirstWave, Director, spawnAircraft } from './mission.js';
import { KAHUKU_START, ROUTE_WEST } from './world/geo.js';
import { HUD } from './ui/hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Music } from './music.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { clamp, lerp, rand } from './util.js';
import { DECAL } from './models/aircraft.js';

export const DIFFS = {
  easy: { label: '易', playerDmg: 0.5, aaAcc: 0.6, aaDmg: 0.6, aaRate: 0.7, aiAimErr: 14, aiEvade: 0.35, playerFocus: 1.2, shipHp: 0.65, usCap: 9, capN: 2, launchInterval: 50, scrambleInterval: 70, waveFirst: 200, waveInterval: 110, waveSize: 6, lives: 5 },
  normal: { label: '並', playerDmg: 0.8, aaAcc: 0.85, aaDmg: 0.85, aaRate: 1, aiAimErr: 9, aiEvade: 0.55, playerFocus: 0.9, shipHp: 1, usCap: 14, capN: 3, launchInterval: 38, scrambleInterval: 50, waveFirst: 240, waveInterval: 120, waveSize: 8, lives: 3 },
  hard: { label: '難', playerDmg: 1.1, aaAcc: 1.1, aaDmg: 1.1, aaRate: 1.3, aiAimErr: 5, aiEvade: 0.8, playerFocus: 0.7, shipHp: 1.3, usCap: 20, capN: 4, launchInterval: 28, scrambleInterval: 38, waveFirst: 280, waveInterval: 140, waveSize: 4, lives: 2 },
};
export const US_TOTAL = 400;

export class Game {
  constructor(opts) {
    this.diff = DIFFS[opts.difficulty || 'normal'];
    this.state = 'loading';
    this.time = 0; this.missionTime = 0; this.timeScale = 1;
    this.aircraft = []; this.ships = []; this.aa = [];
    this.stats = { bbSunk: 0, cvSunk: 0, kills: 0, ground: 0, score: 0, shipDamage: 0, losses: 0 };
    this.lives = this.diff.lives;
    this.wingOrder = 'cover';
    this.camMode = 'chase';
    this.input = new Input();
    this.audio = opts.audio || new Audio();
    this.music = new Music(this.audio);
    this.isTouch = isTouchDevice();
  }

  async init(progress) {
    const step = async (msg, pct) => { progress(msg, pct); await new Promise(r => setTimeout(r, 30)); };
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, isTouchDevice() ? 1 : 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = !isTouchDevice(); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
    document.getElementById('view').appendChild(renderer.domElement);
    this.renderer = renderer;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.000028);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 400000);
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    });
    await step('空と海を生成中…', 5);
    buildSky(scene, renderer);
    this.lights = buildLights(scene);
    this.water = buildWater(); scene.add(this.water);
    await step('オアフ島の地形を生成中…', 15);
    this.terrain = new Terrain();
    scene.add(this.terrain.mesh);
    await step('雲を生成中…', 45);
    this.clouds = staticBillboards(cloudLayout(), cloudTexture(), [1, 1, 1, 0.8]);
    scene.add(this.clouds.mesh);
    this.fx = new Effects(scene);
    initMaterials();
    await step('艦艇を建造中…', 55);
    this.bullets = new Bullets(this); this.bombs = new Bombs(this); this.torpedoes = new Torpedoes(this);
    setupShips(this);
    await step('飛行場を構築中…', 75);
    this.ground = new Ground(this);
    this.hud = new HUD(this);
    this.director = new Director(this);
    // 米軍機 総数 400機: 地上駐機 + 哨戒機 + 空母搭載機
    const parked = this.ground.targets.filter(t => t.kind === 'parked').length;
    const capTotal = this.diff.capN * 4;
    const cvTotal = Math.max(30, US_TOTAL - parked - capTotal);
    this.usCarriers.forEach((cv, i) => { cv.airGroup = Math.floor(cvTotal / 3) + (i < cvTotal % 3 ? 1 : 0); });
    this.usLost = 0;
    await step('攻撃隊 発進準備…', 90);
    // シェーダーを事前コンパイル
    renderer.compile(scene, this.camera);
    progress('準備完了', 100);
  }

  usRemaining() {
    const parked = this.ground.targets.filter(t => t.kind === 'parked' && t.alive).length;
    const air = this.aircraft.filter(a => a.alive && a.side === 'us').length;
    const cv = this.usCarriers.reduce((s, c) => s + (c.sunk ? 0 : c.airGroup), 0);
    return parked + air + cv;
  }

  start() {
    this.state = 'play';
    this.audio.init();
    this.music.start();
    if (this.isTouch) { this.input.touchUI = new TouchControls(this.input); this.hud.forceCompact = true; this.hud.resize(); }
    this.spawnPlayer('kahuku');
    spawnFirstWave(this, this.player.pos.clone(), this.player.fwd.clone());
    this.director.initialCAP();
    this.message('昭和16年12月7日 07:40（現地時間）— カフク岬上空に到達', 'big');
    setTimeout(() => this.message('第一次攻撃隊は西海岸沿いに南下、バーバーズ岬から真珠湾へ突入する', 'info'), 2500);
    setTimeout(() => this.message('オパナ・レーダーが編隊を探知！ 米軍は迎撃態勢 — 強襲となる', 'bad'), 7000);
    setTimeout(() => this.message('制空隊はホイラー・ヒッカム・カネオヘへ散開', 'info'), 11000);
    this.lastFrame = performance.now();
    requestAnimationFrame(() => this.loop());
  }

  spawnPlayer(where) {
    let pos, fwd, speed;
    const opts = { isPlayer: true, name: '小隊長機', modelOpts: { code: DECAL.AI101, leader: true, bombs: true } };
    const ac = new Aircraft(this, 'zero', opts);
    ac.stats = this.stats;
    if (where === 'kahuku') {
      pos = new THREE.Vector3(KAHUKU_START[0], 3000, KAHUKU_START[1]);
      const n = ROUTE_WEST[0];
      fwd = new THREE.Vector3(n[0] - pos.x, 0, n[1] - pos.z).normalize();
      speed = 115;
      ac.setPose(pos, fwd, speed);
      ac.brain = new PlayerFlight(ac, this);
    } else {
      // 赤城の甲板から
      const ak = this.akagi;
      pos = ak.localToWorld(new THREE.Vector3(0, ak.carrier.deckY + 1.95, -ak.L * 0.32));
      fwd = ak.fwd.clone();
      ac.setPose(pos, fwd, 0);
      ac.brain = new PlayerFlight(ac, this);
      ac.brain.gear = true;
      ac.brain.onGround = { kind: 'deck', ship: ak };
      ac.brain.groundYaw = Math.atan2(fwd.x, fwd.z);
      ac.vel.copy(ak.vel);
      ac.throttle = 0.3;
    }
    this.aircraft.push(ac);
    this.player = ac;
    this.camPos = null;
    // 列機
    if (this.wingmen) for (const w of this.wingmen) if (w.alive && w.brain) w.brain.leader = ac;
    const alive = (this.wingmen || []).filter(w => w.alive);
    if (where === 'kahuku' || alive.length === 0) {
      for (const w of alive) w.remove();
      this.wingmen = where === 'kahuku' ? spawnWingmen(this, ac) : [];
      this.pendingWingmen = where !== 'kahuku';
    }
  }

  message(t, k) { this.hud?.message(t, k); }

  // ---- イベント ----
  onAircraftKilled(ac, attacker) {
    if (ac.side === 'us') {
      this.usLost++;
      if (attacker && attacker.isPlayer) {
        this.stats.kills++; this.stats.score += ac.spec.score;
        this.message(`${ac.name} 撃墜！`, 'normal'); this.audio.beep(1200, 0.1);
      } else if (attacker && attacker.wingman) this.message(`${attacker.name}、${ac.name}を撃墜`, 'info');
    } else if (ac.wingman) this.message(`${ac.name} 被弾、墜落…`, 'bad');
    if (ac.isPlayer) this.onPlayerDown();
  }
  onPlayerHit(d) { this.hud.hitFlash = Math.min(0.5, this.hud.hitFlash + d * 0.02); this.audio.hit(); }
  onShipSunk(s, owner) {
    const byP = owner && owner.isPlayer;
    if (s.cls === 'BB') this.stats.bbSunk++;
    if (s.cls === 'CV') this.stats.cvSunk++;
    if (s.isTarget) this.stats.score += byP ? (s.cls === 'CV' ? 1500 : 1200) : 300;
    else if (byP) this.stats.score += 300;
    this.message(`${s.name} 撃沈！${byP ? '（小隊長機の戦果）' : ''}`, 'big');
    if (this.stats.bbSunk >= 8 && this.stats.cvSunk >= 3 && this.state === 'play') setTimeout(() => this.finish(true), 4000);
  }
  onGroundDestroyed(t, owner) {
    if (owner && owner.isPlayer) {
      this.stats.ground++; this.stats.score += t.score || 50;
      if (t.kind === 'parked' && t.type !== 'b17' && t.type !== 'pby') this.usLost++;
      if (t.name) this.message(`${t.name} 破壊！`);
    } else if (t.kind === 'parked') this.usLost++;
  }
  onTouchdown(surf, arrest) {
    if (surf.kind === 'deck') {
      this.message(arrest ? '着艦成功 — 制動索に掛かった' : '甲板に接地', 'info');
      this.stats.score += 200;
    } else this.message('着陸');
  }
  onTakeoff() { this.message('離陸'); }
  playerCrash(reason) {
    const p = this.player;
    if (!p || !p.alive) return;
    this.message(reason, 'bad');
    this.fx.explosion(p.pos, 2.5); this.audio.explosion(p.pos, 1.5);
    p.hp = 0; p.alive = false; p.remove();
    this.onPlayerDown();
  }
  onPlayerCrashed() {}
  onPlayerDown() {
    if (this.state !== 'play') return;
    this.stats.losses++;
    this.lives--;
    this.state = 'dead';
    this.deadT = 0;
    this.lastPlayer = this.player;
    this.audio.setEngine(0, 0, false);
    setTimeout(() => {
      if (this.lives <= 0) this.finish(false);
      else this.ui.showRespawn();
    }, 3500);
  }
  respawn(where) {
    this.ui.hideRespawn();
    this.state = 'play';
    this.spawnPlayer(where);
    if (where === 'kahuku') this.message('カフク岬上空より再出撃', 'info');
    else this.message('空母赤城より再出撃 — 補給完了', 'info');
  }
  finish(win) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.audio.setEngine(0, 0, false);
    this.ui.showResult(win, this.stats, this.missionTime, this.usRemaining());
  }

  autoLand() {
    const pl = this.player, ak = this.akagi;
    if (!pl || !pl.alive || pl.brain.onGround) return;
    if (pl.pos.distanceTo(ak.pos) > 3000 || pl.pos.y > 600) return;
    const pos = ak.localToWorld(new THREE.Vector3(0, ak.carrier.deckY + 1.95, -ak.L * 0.15));
    pl.pos.copy(pos); pl.vel.copy(ak.vel);
    const fl = pl.brain;
    fl.gear = true; fl.onGround = { kind: 'deck', ship: ak }; fl.groundYaw = Math.atan2(ak.fwd.x, ak.fwd.z); fl.arrest = false;
    pl.throttle = 0;
    this.message('着艦（自動）完了', 'info');
  }

  rearm() {
    const pl = this.player;
    // 爆弾・弾薬・機体修理
    pl.hp = pl.maxHp; pl.onFire = false;
    if (pl.smoke) { pl.smoke.dead = true; pl.smoke = null; }
    pl.ammo = pl.spec.guns.map(g => (g.ammo === 'mg20' ? 60 : 680) * g.pos.length);
    for (const s of pl.model.userData.stores) if (!s.parent) pl.model.add(s);
    this.message('補給・整備完了 — 爆装・弾薬 満載', 'info');
    this.pendingWingmen = true;
  }

  dropBomb() {
    const pl = this.player;
    const st = pl.model.userData.stores.filter(s => s.parent);
    if (!st.length) { this.message('爆弾なし — 赤城に着艦して補給せよ', 'bad'); return; }
    const pick = st.find(s => s.userData.kind === 250) || st[0];
    pl.model.position.copy(pl.pos); pl.model.quaternion.copy(pl.quat); pl.model.updateMatrixWorld(true);
    const wp = pick.getWorldPosition(new THREE.Vector3());
    pl.model.remove(pick);
    this.bombs.drop(wp, pl.vel.clone().add(new THREE.Vector3(0, -1, 0)), pick.userData.kind, 'jp', pl, pl.quat);
    this.message(`${pick.userData.kind}kg 爆弾 投下`);
    this.audio.bombRelease();
  }

  // ---- メインループ ----
  loop() {
    if (this.destroyed) return;
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const inp = this.input;
    inp.update(dt);
    if (inp.hit('KeyP') || inp.hit('Escape')) {
      if (this.state === 'play') { this.state = 'pause'; this.ui.showPause(true); }
      else if (this.state === 'pause') { this.state = 'play'; this.ui.showPause(false); }
    }
    if (this.state === 'play' || this.state === 'dead') {
      this.handleKeys();
      const steps = Math.ceil(this.timeScale * dt / (1 / 60) - 1e-6);
      const sdt = this.timeScale * dt / Math.max(1, steps);
      for (let i = 0; i < steps; i++) this.step(sdt);
    }
    this.updateCamera(dt);
    this.fx.streaks.begin(); this.bullets.draw(this.fx.streaks); this.fx.streaks.end();
    this.water.material.uniforms.uTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
    this.hud.draw(dt);
    inp.endFrame();
  }

  handleKeys() {
    const inp = this.input, pl = this.player;
    if (inp.hit('KeyV')) { this.camMode = { chase: 'cockpit', cockpit: 'far', far: 'chase' }[this.camMode]; }
    if (inp.hit('KeyM')) this.hud.mapZoom = (this.hud.mapZoom + 1) % 3;
    if (inp.hit('KeyT')) {
      const near = this.aircraft.some(a => a.alive && a.side === 'us' && pl && a.pos.distanceTo(pl.pos) < 4000);
      if (this.timeScale > 1) this.timeScale = this.timeScale === 4 ? 8 : 1;
      else if (!near) this.timeScale = 4;
      else this.message('敵機接近中 — 時間加速不可', 'bad');
      if (this.timeScale > 1) this.message(`時間加速 ×${this.timeScale}`);
    }
    if (inp.hit('KeyN')) { this.wingOrder = this.wingOrder === 'free' ? 'cover' : 'free'; this.message(this.wingOrder === 'free' ? '列機へ: 自由戦闘を許可' : '列機へ: 編隊に戻れ・長機を援護せよ', 'info'); }
    if (inp.hit('KeyH')) this.ui.toggleHelp();
    if (inp.hit('KeyK')) { const on = this.music.toggle(); this.message(on ? 'BGM 入' : 'BGM 切'); this.ui.syncBgm?.(on); }
    if (this.state !== 'play' || !pl || !pl.alive) return;
    if (inp.hit('KeyB')) this.dropBomb();
    if (inp.hit('KeyL')) this.autoLand();
    if (this.timeScale > 1 && this.aircraft.some(a => a.alive && a.side === 'us' && a.pos.distanceTo(pl.pos) < 3000)) { this.timeScale = 1; this.message('敵機接近！ 時間加速解除', 'bad'); }
  }

  step(dt) {
    this.time += dt; this.missionTime += dt;
    for (const s of this.ships) s.update(dt, this.time);
    for (const a of this.aircraft) a.update(dt);
    this.aircraft = this.aircraft.filter(a => !a.removed);
    for (const b of this.aa) b.update(dt);
    this.bullets.update(dt); this.bombs.update(dt); this.torpedoes.update(dt);
    if (this.state === 'play') this.director.update(dt);
    this.fx.update(dt);
    const pl = this.player;
    if (pl && pl.alive && this.state === 'play') {
      if (pl.onFire) pl.damage(dt * 2.5, null);
      // 甲板上で停止 → 補給
      const g = pl.brain.onGround;
      if (g && g.kind === 'deck' && g.ship === this.akagi) {
        const rel = pl.vel.clone().sub(g.ship.vel).length();
        if (rel < 2) {
          if (this.rearmT === undefined || this.rearmT === null) this.rearmT = 4;
          this.rearmT -= dt;
          if (this.rearmT <= 0 && !this.rearmed) { this.rearm(); this.rearmed = true; }
        }
      } else { this.rearmT = null; this.rearmed = false; }
      // 列機の合流
      if (this.pendingWingmen && !pl.brain.onGround && pl.pos.y > 300) {
        this.pendingWingmen = false;
        const alive = (this.wingmen || []).filter(w => w.alive);
        if (alive.length < 2) {
          for (const w of alive) w.remove();
          this.wingmen = spawnWingmen(this, pl);
          this.message('列機2機 合流', 'info');
        }
      }
      this.audio.setEngine(pl.throttle, pl.vel.length(), true);
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    const pl = this.player && this.player.alive ? this.player : null;
    const target = pl || this.lastPlayer;
    if (!target) return;
    const inp = this.input;
    this.orbit = this.orbit || { yaw: 0, pitch: 0 };
    if (inp.drag.active) { this.orbit.yaw -= inp.drag.dx * 0.005; this.orbit.pitch = clamp(this.orbit.pitch + inp.drag.dy * 0.004, -1.2, 1.2); }
    else { this.orbit.yaw *= 0.92; this.orbit.pitch *= 0.92; }
    inp.drag.dx = inp.drag.dy = 0;
    if (pl && this.camMode === 'cockpit') {
      const p = new THREE.Vector3(0, 0.98, -0.25).applyQuaternion(pl.quat).add(pl.pos);
      cam.position.copy(p);
      const q = pl.quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.orbit.pitch, Math.PI + this.orbit.yaw * 2, 0, 'YXZ')));
      cam.quaternion.copy(q);
      pl.model.userData.prop.visible = true;
    } else {
      const dist = this.camMode === 'far' ? 45 : 16;
      const height = this.camMode === 'far' ? 10 : 4.2;
      const back = target.fwd.clone().multiplyScalar(-dist).applyAxisAngle(target.up, this.orbit.yaw);
      const desired = target.pos.clone().add(back).addScaledVector(target.up, height + this.orbit.pitch * dist);
      if (!this.camPos) this.camPos = desired.clone();
      this.camPos.lerp(desired, 1 - Math.exp(-dt * 10));
      if (pl) this.camPos.addScaledVector(pl.vel, 0); 
      const gh = this.terrain.groundAt(this.camPos.x, this.camPos.z) + 1.5;
      if (this.camPos.y < gh) this.camPos.y = gh;
      cam.position.copy(this.camPos);
      cam.up.lerp(target.up, 1 - Math.exp(-dt * 4)).normalize();
      cam.lookAt(target.pos.clone().addScaledVector(target.fwd, 25));
    }
    this.audio.listener = cam.position;
    updateSunShadow(this.lights.sun, target.pos);
  }
}
