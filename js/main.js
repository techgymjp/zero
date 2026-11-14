// エントリーポイント・画面遷移・アプリ（Android）対応
import { Game } from './game.js';
import { Audio } from './audio.js';
import { t, setLang, applyHTML, LANG } from './i18n.js';
import { isTouchDevice } from './touch.js';

const $ = (id) => document.getElementById(id);
const audio = new Audio();
let game = null;
const Ads = window.Ads;
const cap = window.Capacitor;
const isApp = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
if (isApp) document.body.classList.add('app');
// タッチ操作の端末（スマホ・タブレット）: キーボードの説明を隠す
if (isTouchDevice()) document.body.classList.add('touch');

const REVIVE_MAX = 3;          // リワード広告で「その場で復活」できる回数（1 ゲーム）
const PRIVACY = { ja: 'https://techgym.jp/privacy-policy/', en: 'https://techgym.jp/privacy-policy-en/' };

// 広告の表示中はゲームの音を止める
Ads.onSuspend = () => { if (audio.ctx) audio.ctx.suspend(); };
// 一時停止中は広告が閉じても音を戻さない
const paused = () => !!game && game.state === 'pause';
Ads.onResume = () => { if (audio.ctx && document.visibilityState === 'visible' && !paused()) audio.ctx.resume(); };

const shown = (id) => !$(id).classList.contains('hidden');
// バナーはタイトル・あそびかた・ポーズ・結果画面だけ（プレイ中は出さない）
function syncBanner() {
  const menu = !game || shown('title') || shown('pause') || shown('result') || shown('help');
  Ads.setBanner(menu);
}

let busy = false; // 広告の表示待ちの間、ボタンの二重押しを防ぐ
async function withInterstitial(fn) {
  if (busy) return;
  busy = true;
  try { await Ads.showInterstitial(3000); } finally { busy = false; }
  fn();
}
function backToTitle() { withInterstitial(() => location.reload()); }

let rewardTimer = null;
function hideReward() { clearInterval(rewardTimer); rewardTimer = null; $('rsReward').classList.add('hidden'); }
// 撃墜後 2.5 秒待ってから「広告を見てその場で復活」を出し、8 秒で自動的に消す
function offerReward(onTimeout) {
  hideReward();
  if (!Ads.canReward || game.stats.revives >= REVIVE_MAX) return false;
  let left = 8;
  const label = () => { $('rsReward').innerHTML = `${t('広告を見てその場で復活')}<small>${t('あと {n} 回 ・ {s} 秒', { n: REVIVE_MAX - game.stats.revives, s: left })}</small>`; };
  setTimeout(() => {
    if (game.state !== 'dead') return;
    label(); $('rsReward').classList.remove('hidden');
    rewardTimer = setInterval(() => {
      left--; label();
      if (left <= 0) { hideReward(); if (onTimeout) onTimeout(); }
    }, 1000);
  }, 2500);
  return true;
}

const ui = {
  showRespawn() {
    $('respawnTitle').textContent = t('撃墜された');
    $('respawnInfo').textContent = t('残機 {l}', { l: game.lives });
    $('rsAkagi').classList.remove('hidden');
    $('respawn').classList.remove('hidden');
    offerReward(null);
    syncBanner();
  },
  // 最後の残機を失ったとき: リワード広告で続行できるなら案内する（時間切れで作戦終了）
  offerContinue() {
    if (!Ads.canReward || game.stats.revives >= REVIVE_MAX) return false;
    $('respawnTitle').textContent = t('コンティニュー？');
    $('respawnInfo').textContent = t('残機 {l}', { l: 0 });
    $('rsAkagi').classList.add('hidden');
    $('respawn').classList.remove('hidden');
    offerReward(() => { $('respawn').classList.add('hidden'); game.finish(false); });
    return true;
  },
  hideRespawn() { hideReward(); $('respawn').classList.add('hidden'); syncBanner(); },
  showPause(on) { $('pause').classList.toggle('hidden', !on); syncBanner(); },
  pauseGame() {
    if (!game || game.state !== 'play') return;
    game.state = 'pause'; ui.showPause(true);
    // 時間が止まっているので BGM・効果音もすべて止める
    if (audio.ctx) audio.ctx.suspend();
  },
  // ポーズからの再開は全画面広告のあと
  resumeGame() {
    if (!game || game.state !== 'pause' || busy) return;
    $('pause').classList.add('hidden');
    syncBanner();
    withInterstitial(() => { game.state = 'play'; game.lastFrame = performance.now(); if (audio.ctx) audio.ctx.resume(); syncBanner(); });
  },
  toggleHelp() {
    const opening = !shown('help');
    $('help').classList.toggle('hidden');
    // タイトルから開いたあそびかたを閉じる = トップ画面に戻る
    if (!opening && !game) Ads.showInterstitial(3000);
    syncBanner();
  },
  showResult(win, s, time, usLeft) {
    hideReward();
    $('respawn').classList.add('hidden');
    $('resTitle').textContent = t(win ? '作戦成功 — 米太平洋艦隊 壊滅' : '作戦失敗 — 未帰還');
    const min = Math.floor(time / 60), sec = Math.floor(time % 60);
    const score = s.score + (win ? 5000 : 0);
    const rank = t(score > 12000 ? '撃墜王・金鵄勲章' : score > 8000 ? '殊勲甲' : score > 4000 ? '殊勲乙' : score > 1500 ? '武功抜群' : '奮戦');
    $('resBody').innerHTML = `
      <div class="rank">${rank}</div>
      <table>
        <tr><td>${t('戦艦撃沈')}</td><td>${s.bbSunk} / 8</td></tr>
        <tr><td>${t('空母撃沈')}</td><td>${s.cvSunk} / 3</td></tr>
        <tr><td>${t('撃墜（小隊長機）')}</td><td>${s.kills}</td></tr>
        <tr><td>${t('地上撃破')}</td><td>${s.ground}</td></tr>
        <tr><td>${t('米軍機 残存')}</td><td>${usLeft} / 400</td></tr>
        <tr><td>${t('被撃墜')}</td><td>${s.losses}</td></tr>
        ${s.revives ? `<tr><td>${t('その場で復活')}</td><td>${s.revives}</td></tr>` : ''}
        <tr><td>${t('作戦時間')}</td><td>${t('{m}分{s}秒', { m: min, s: sec })}</td></tr>
        <tr><td>${t('戦果点数')}</td><td>${score}</td></tr>
      </table>`;
    ui.lastScore = { bb: s.bbSunk, cv: s.cvSunk, s: score, revives: s.revives };
    $('result').classList.remove('hidden');
    syncBanner();
  },
};

async function startGame() {
  $('startBtn').disabled = true;
  audio.init(); audio.resume();
  $('loading').classList.remove('hidden');
  try {
    game = new Game({ difficulty: 'normal', audio });
    game.ui = ui;
    window.game = game; // @web-only
    await game.init((msg, pct) => { $('loadmsg').textContent = msg; $('loadbar').style.width = pct + '%'; });
    $('title').classList.add('hidden');
    syncBanner();
    game.start();
  } catch (e) {
    console.error(e);
    $('loadmsg').textContent = t('初期化に失敗しました: ') + e.message;
  }
}

// プレイを始めるときは全画面広告のあと
$('startBtn').addEventListener('click', () => {
  if (busy) return;
  audio.init(); audio.resume(); // 音の再生許可はタップの直後に取る
  withInterstitial(startGame);
});
$('rsAkagi').onclick = () => { hideReward(); game.respawn(); };
$('rsReward').onclick = async () => {
  if (busy) return;
  busy = true;
  hideReward();
  const r = await Ads.showRewarded();
  busy = false;
  // 最後まで見たときだけ復活。途中で閉じた・読み込めなかったときは先へ進める
  if (r === 'rewarded') game.reviveHere();
  else if (game.lives <= 0) { $('respawn').classList.add('hidden'); game.finish(false); }
};
$('resumeBtn').onclick = () => ui.resumeGame();
$('pauseTitleBtn').onclick = () => backToTitle();
$('resTitleBtn').onclick = () => backToTitle();
// 結果画面からもう一度: 全画面広告のあと、タイトルを飛ばして新しいゲームを始める
$('againBtn').onclick = () => withInterstitial(() => {
  try { sessionStorage.setItem('zero.autostart', '1'); } catch (e) {}
  location.reload();
});
$('shareBtn').onclick = async () => {
  const r = ui.lastScore || { bb: 0, cv: 0, s: 0 };
  const text = t('『零戦 真珠湾攻撃』で戦艦 {bb}/8・空母 {cv}/3 を撃沈！ 戦果 {s} 点', { bb: r.bb, cv: r.cv, s: r.s })
    + (r.revives ? ` (${t('その場で復活')} ${r.revives})` : '');
  try {
    if (isApp && cap.Plugins.Share) await cap.Plugins.Share.share({ text });
    else if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); game?.message(t('コピーしました'), 'info'); }
  } catch (e) { /* キャンセル */ }
};

// ---- 設定ボタン ----
const syncLabels = () => {
  $('muteBtn').textContent = t('音: {s}', { s: t(audio.muted ? '切' : '入') });
  $('engBtn').textContent = t('エンジン音: {s}', { s: t(ENG[engI][0]) });
  $('bgmBtn').textContent = t(isTouchDevice() ? 'BGM: {s}' : 'BGM: {s} (K)', { s: t(game && game.music && !game.music.playing ? '切' : '入') });
  $('privacyLink').href = PRIVACY[LANG] || PRIVACY.en;
};
$('muteBtn').onclick = () => { audio.setMuted(!audio.muted); syncLabels(); };
const ENG = [['普通', 1], ['小', 0.4], ['切', 0], ['大', 1.6]];
let engI = 0;
$('engBtn').onclick = () => { engI = (engI + 1) % ENG.length; audio.setEngineVolume(ENG[engI][1]); syncLabels(); };
ui.syncBgm = () => syncLabels();
$('bgmBtn').onclick = () => { game.music.toggle(); syncLabels(); };

// ---- タイトル画面 ----
for (const b of document.querySelectorAll('[data-lang]')) b.onclick = () => setLang(b.dataset.lang);
// ヘルプの閉じるボタンは言語切替で作り直されるため委譲で処理
document.addEventListener('click', (e) => { if (e.target && e.target.id === 'helpClose') ui.toggleHelp(); });
document.addEventListener('langchange', () => syncLabels());
applyHTML();
$('howBtn').onclick = () => ui.toggleHelp();
$('appVersion').textContent = window.APP_VERSION && window.APP_VERSION !== 'dev' ? window.APP_VERSION : '';
// EU などで必要な「広告の設定」
Ads.initDone.then(() => { if (Ads.privacyOptionsRequired) $('adPrivacy').hidden = false; });
$('adPrivacy').onclick = () => Ads.showPrivacyOptions();
syncBanner();

// ---- アプリ: 戻るボタン・バックグラウンド ----
if (isApp && cap.Plugins.App) {
  const App = cap.Plugins.App;
  App.addListener('backButton', () => {
    if (busy || Ads.showing) return;
    if (shown('help')) { ui.toggleHelp(); return; }
    if (!game || shown('title') || shown('result')) { App.exitApp(); return; }
    if (game.state === 'play') ui.pauseGame();
    else if (game.state === 'pause') ui.resumeGame();
  });
}
// 別のアプリに切り替えたら自動でポーズし、音も止める
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (game && game.state === 'play') ui.pauseGame();
    if (audio.ctx) audio.ctx.suspend();
  } else if (audio.ctx && !Ads.showing && !paused()) audio.ctx.resume();
});

// 「もう一度」から来たときはタイトルを飛ばして始める（広告は直前に表示済み）
try {
  if (sessionStorage.getItem('zero.autostart')) { sessionStorage.removeItem('zero.autostart'); startGame(); }
} catch (e) {}
