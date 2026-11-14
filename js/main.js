// エントリーポイント・画面遷移
import { Game } from './game.js';
import { Audio } from './audio.js';
import { t, setLang, applyHTML, LANG } from './i18n.js';

const $ = (id) => document.getElementById(id);
const audio = new Audio();
let game = null;

const ui = {
  showRespawn() {
    $('respawnInfo').textContent = t('残機 {l}', { l: game.lives });
    $('respawn').classList.remove('hidden');
  },
  hideRespawn() { $('respawn').classList.add('hidden'); },
  showPause(on) { $('pause').classList.toggle('hidden', !on); },
  toggleHelp() { $('help').classList.toggle('hidden'); },
  showResult(win, s, time, usLeft) {
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
        <tr><td>${t('作戦時間')}</td><td>${t('{m}分{s}秒', { m: min, s: sec })}</td></tr>
        <tr><td>${t('戦果点数')}</td><td>${score}</td></tr>
      </table>`;
    $('result').classList.remove('hidden');
  },
};

$('startBtn').addEventListener('click', async () => {
  $('startBtn').disabled = true;
  audio.init(); audio.resume();
  $('loading').classList.remove('hidden');
  try {
    game = new Game({ difficulty: 'normal', audio });
    game.ui = ui;
    window.game = game;
    await game.init((msg, pct) => { $('loadmsg').textContent = msg; $('loadbar').style.width = pct + '%'; });
    $('title').classList.add('hidden');
    game.start();
  } catch (e) {
    console.error(e);
    $('loadmsg').textContent = t('初期化に失敗しました: ') + e.message;
  }
});
$('rsAkagi').onclick = () => game.respawn('akagi');
$('resumeBtn').onclick = () => { game.state = 'play'; ui.showPause(false); };
const syncLabels = () => {
  $('muteBtn').textContent = t('音: {s}', { s: t(audio.muted ? '切' : '入') });
  $('engBtn').textContent = t('エンジン音: {s}', { s: t(ENG[engI][0]) });
  $('bgmBtn').textContent = t('BGM: {s} (K)', { s: t(game && game.music && !game.music.playing ? '切' : '入') });
};
$('muteBtn').onclick = () => { audio.setMuted(!audio.muted); syncLabels(); };
const ENG = [['普通', 1], ['小', 0.4], ['切', 0], ['大', 1.6]];
let engI = 0;
$('engBtn').onclick = () => { engI = (engI + 1) % ENG.length; audio.setEngineVolume(ENG[engI][1]); syncLabels(); };
ui.syncBgm = () => syncLabels();
$('bgmBtn').onclick = () => { game.music.toggle(); syncLabels(); };
// 言語切替
for (const b of document.querySelectorAll('[data-lang]')) b.onclick = () => setLang(b.dataset.lang);
// ヘルプの閉じるボタンは言語切替で作り直されるため委譲で処理
document.addEventListener('click', (e) => { if (e.target && e.target.id === 'helpClose') ui.toggleHelp(); });
document.addEventListener('langchange', () => syncLabels());
applyHTML();
$('howBtn').onclick = () => ui.toggleHelp();
