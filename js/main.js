// エントリーポイント・画面遷移
import { Game } from './game.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const audio = new Audio();
let game = null;

const ui = {
  showRespawn() {
    $('respawnInfo').textContent = `残機 ${game.lives}`;
    $('respawn').classList.remove('hidden');
  },
  hideRespawn() { $('respawn').classList.add('hidden'); },
  showPause(on) { $('pause').classList.toggle('hidden', !on); },
  toggleHelp() { $('help').classList.toggle('hidden'); },
  showResult(win, s, t, usLeft) {
    $('resTitle').textContent = win ? '作戦成功 — 米太平洋艦隊 壊滅' : '作戦失敗 — 未帰還';
    const min = Math.floor(t / 60), sec = Math.floor(t % 60);
    const score = s.score + (win ? 5000 : 0);
    const rank = score > 12000 ? '撃墜王・金鵄勲章' : score > 8000 ? '殊勲甲' : score > 4000 ? '殊勲乙' : score > 1500 ? '武功抜群' : '奮戦';
    $('resBody').innerHTML = `
      <div class="rank">${rank}</div>
      <table>
        <tr><td>戦艦撃沈</td><td>${s.bbSunk} / 8</td></tr>
        <tr><td>空母撃沈</td><td>${s.cvSunk} / 3</td></tr>
        <tr><td>撃墜（小隊長機）</td><td>${s.kills}</td></tr>
        <tr><td>地上撃破</td><td>${s.ground}</td></tr>
        <tr><td>米軍機 残存</td><td>${usLeft} / 400</td></tr>
        <tr><td>被撃墜</td><td>${s.losses}</td></tr>
        <tr><td>作戦時間</td><td>${min}分${sec}秒</td></tr>
        <tr><td>戦果点数</td><td>${score}</td></tr>
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
    $('loadmsg').textContent = '初期化に失敗しました: ' + e.message;
  }
});
$('rsAkagi').onclick = () => game.respawn('akagi');
$('resumeBtn').onclick = () => { game.state = 'play'; ui.showPause(false); };
$('muteBtn').onclick = () => { audio.setMuted(!audio.muted); $('muteBtn').textContent = '音: ' + (audio.muted ? '切' : '入'); };
const ENG = [['普通', 1], ['小', 0.4], ['切', 0], ['大', 1.6]];
let engI = 0;
$('engBtn').onclick = () => { engI = (engI + 1) % ENG.length; audio.setEngineVolume(ENG[engI][1]); $('engBtn').textContent = 'エンジン音: ' + ENG[engI][0]; };
ui.syncBgm = (on) => { $('bgmBtn').textContent = 'BGM: ' + (on ? '入' : '切') + ' (K)'; };
$('bgmBtn').onclick = () => ui.syncBgm(game.music.toggle());
$('helpClose').onclick = () => ui.toggleHelp();
$('howBtn').onclick = () => ui.toggleHelp();
