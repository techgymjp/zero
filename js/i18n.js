// 日本語 / English 切替
const KEY = 'zero.lang';
function detect() {
  try { const s = localStorage.getItem(KEY); if (s === 'ja' || s === 'en') return s; } catch (e) {}
  return (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}
export let LANG = detect();
export function setLang(l) { LANG = l; try { localStorage.setItem(KEY, l); } catch (e) {} applyHTML(); }

// 文字列テンプレート（日本語をキーに）: t('速度 {v} km/h', { v: 300 })
const EN = {
  '命中コース': 'ON TARGET', '着弾点': 'IMPACT',
  '▼ 赤城 {d}km': '▼ Akagi {d}km', '残機 {l}': 'Lives {l}', '残機{l}': 'Lives {l}',
  '失 速': 'STALL', '引き起こせ！': 'PULL UP!', '火災発生': 'ON FIRE',
  '「加速」長押し → スティックを上へで発艦': 'Hold BOOST → stick up to take off',
  'Shift で全開 → W で引き起こして発艦': 'Shift for full power → W to lift off',
  '補給中… {n}': 'Rearming… {n}', 'L: 着艦（自動）': 'L: Auto-land',
  '速度 {v} km/h': 'SPD {v} km/h', '高度 {v} m': 'ALT {v} m', '機体': 'HULL',
  '北': 'N', '北東': 'NE', '東': 'E', '南東': 'SE', '南': 'S', '南西': 'SW', '西': 'W', '北西': 'NW',
  '現地時間 {t}  (昭和16年12月7日)': 'Local time {t}  (Dec 7, 1941)',
  '戦艦 {a}/8  空母 {b}/3': 'BB {a}/8  CV {b}/3', '米軍機 {n}': 'US planes {n}',
  '戦艦撃沈   {n} / 8': 'Battleships  {n} / 8', '空母撃沈   {n} / 3': 'Carriers     {n} / 3',
  '撃墜 {k}  地上撃破 {g}': 'Kills {k}  Ground {g}', '戦果 {s} 点   {t}': 'Score {s}   {t}',
  '米軍機 残存 {n} / 400': 'US planes left {n} / 400',
  '地図 (M) {z}': 'Map (M) {z}', '全島': 'Island', '赤城 {d}km': 'Akagi {d}km', '赤城まで {d}km': 'To Akagi {d}km',
  '{n} 誘爆！': '{n} magazine explodes!', '{n} 撃沈！': '{n} sunk!', '{n} 撃墜': '{n} shot down', '{n} 被撃墜': '{n} lost',
  '脚下げ': 'Gear down', '脚上げ': 'Gear up', '海面に墜落': 'Crashed into the sea', '着艦失敗': 'Deck landing failed', '地面に激突': 'Crashed into the ground',
  '空と海を生成中…': 'Creating sky and ocean…', 'オアフ島の地形を生成中…': 'Generating Oahu terrain…', '雲を生成中…': 'Generating clouds…',
  '艦艇を建造中…': 'Building ships…', '飛行場を構築中…': 'Building airfields…', '音声を準備中…': 'Preparing audio…',
  '攻撃隊 発進準備…': 'Preparing strike force…', '準備完了': 'Ready',
  '赤城より発艦せよ': 'Take off from Akagi', '着艦': 'Landed', '補給完了': 'Rearmed', '爆弾なし（赤城で補給）': 'No bombs (rearm on Akagi)',
  '敵機接近 加速不可': 'Enemy near – no time warp', '列機：自由戦闘': 'Wingmen: free engage', '列機：援護': 'Wingmen: cover me',
  'BGM 入': 'Music on', 'BGM 切': 'Music off', '敵機接近': 'Enemy aircraft!', '攻撃隊 増援': 'Strike reinforcements',
  '作戦成功 — 米太平洋艦隊 壊滅': 'Mission accomplished — Pacific Fleet destroyed', '作戦失敗 — 未帰還': 'Mission failed — did not return',
  '撃墜王・金鵄勲章': 'Ace — Order of the Golden Kite', '殊勲甲': 'Distinguished Service, 1st class', '殊勲乙': 'Distinguished Service, 2nd class', '武功抜群': 'Outstanding Valor', '奮戦': 'Fought bravely',
  '初期化に失敗しました: ': 'Initialization failed: ',
  '音: {s}': 'Sound: {s}', 'エンジン音: {s}': 'Engine: {s}', 'BGM: {s} (K)': 'Music: {s} (K)',
  '入': 'On', '切': 'Off', '普通': 'Normal', '小': 'Low', '大': 'High',
  '戦艦撃沈': 'Battleships sunk', '空母撃沈': 'Carriers sunk', '撃墜（小隊長機）': 'Kills (you)', '地上撃破': 'Ground targets', '米軍機 残存': 'US planes left',
  '被撃墜': 'Times shot down', '作戦時間': 'Mission time', '戦果点数': 'Score', '{m}分{s}秒': '{m}m {s}s',
  '機銃': 'GUN', '加速': 'BOOST', '爆弾': 'BOMB', 'ここをなぞって操縦': 'Drag here to fly',
};
export function t(key, vars) {
  let s = LANG === 'en' && EN[key] !== undefined ? EN[key] : key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}

// 固有名詞
const NAMES = {
  '戦艦カリフォルニア': 'California', '戦艦メリーランド': 'Maryland', '戦艦オクラホマ': 'Oklahoma', '戦艦テネシー': 'Tennessee',
  '戦艦ウェストバージニア': 'West Virginia', '戦艦アリゾナ': 'Arizona', '戦艦ネバダ': 'Nevada', '戦艦ペンシルベニア': 'Pennsylvania',
  '給油艦ネオショー': 'Neosho', '工作艦ヴェスタル': 'Vestal', '駆逐艦ショー': 'Shaw', '標的艦ユタ': 'Utah',
  '軽巡ローリー': 'Raleigh', '軽巡デトロイト': 'Detroit', '軽巡ヘレナ': 'Helena', '重巡ニューオーリンズ': 'New Orleans',
  '軽巡ホノルル': 'Honolulu', '軽巡セントルイス': 'St. Louis', '空母レキシントン': 'Lexington', '空母サラトガ': 'Saratoga',
  '空母エンタープライズ': 'Enterprise', '重巡インディアナポリス': 'Indianapolis', '重巡シカゴ': 'Chicago', '駆逐艦': 'Destroyer',
  '空母赤城': 'Akagi', '空母加賀': 'Kaga', '戦艦霧島': 'Kirishima',
  '駆逐艦フェルプス': 'Phelps', '駆逐艦デューイ': 'Dewey', '駆逐艦ファラガット': 'Farragut', '駆逐艦ハル': 'Hull', '駆逐艦マクドノー': 'MacDonough',
  '駆逐艦ワーデン': 'Worden', '駆逐艦デール': 'Dale', '駆逐艦モナハン': 'Monaghan', '駆逐艦アイルウィン': 'Aylwin',
  '零戦': 'Zero', '九七艦攻': 'B5N Kate', '九九艦爆': 'D3A Val', '小隊長機': 'Leader', '列機1番': 'Wingman 1', '列機2番': 'Wingman 2',
  '真珠湾': 'Pearl Harbor', 'ホノルル': 'Honolulu', 'カエナ岬': 'Kaena Pt', 'カフク岬': 'Kahuku Pt', 'ダイヤモンドヘッド': 'Diamond Head',
};
export function nm(name) { return LANG === 'en' ? (NAMES[name] || name) : name; }
// 撃沈メッセージ用の短い艦名
export function shortName(name) { return LANG === 'en' ? nm(name) : name.replace(/^(戦艦|空母)/, ''); }

// ---- HTML（data-i18n 属性の要素を差し替え）----
const HTML_EN = {
  lead: 'You lead Akagi\'s fighter section. Destroy the US Pacific Fleet.<br><b>Win: sink 8 battleships and 3 carriers</b>',
  sub: 'December 8, 1941 (Japan time) — December 7 in Hawaii',
  start: 'SORTIE', how: 'HOW TO PLAY',
  mobile: 'On phones, play in landscape. Drag the left side to fly; buttons at lower right to fire and bomb.',
  shotdown: 'Shot down', respawn: 'Sortie again from Akagi', paused: 'Paused', pauseHint: 'Press P or Esc to resume', resume: 'Resume', again: 'Play again',
  help: `<h2>How to play</h2>
    <h3>Mission</h3>
    <p>December 7, 1941, 07:40 local time. You are a <b>section leader</b> of the carrier <b>Akagi</b>'s fighter unit. Take off from Akagi's deck and lead your two wingmen to Pearl Harbor. The first wave flies from over <b>Kahuku Point</b>, down the <b>west coast</b>, turns northeast at <b>Barbers Point</b> and strikes the harbor (dotted line on the map).</p>
    <p class="warn">In this game the US forces are on alert: anti-aircraft fire is ready, and interceptors keep taking off from every airfield and from <b>three US carriers</b> patrolling south of Pearl Harbor (400 US aircraft in total).</p>
    <p><b>Victory: sink all 8 battleships and 3 carriers.</b> Further strike waves (B5N Kates and D3A Vals) arrive as reinforcements.</p>
    <h3>Controls</h3>
    <ul>
      <li><b>Flight</b>: W/S (↑/↓) climb/dive, A/D (←/→) roll, Q/E rudder, Shift·R / Ctrl·F throttle</li>
      <li><b>Gun</b>: Space or click fires the 20 mm cannon</li>
      <li><b>Bombs</b>: B drops 250 kg then 60 kg bombs. The green ◇ shows the impact point; red means on target. Dive to aim.</li>
      <li><b>Other</b>: G gear, V camera, middle-drag / Shift+drag to look around, T time warp, M map zoom, N wingman orders, K music, P pause, H help</li>
      <li><b>Phone / tablet</b> (landscape): <b>drag the left half to fly</b> (up = climb, down = dive, left/right = roll). Hold <b>GUN</b> to fire, <b>BOMB</b> to drop, hold <b>BOOST</b> for full power. A <b>Land</b> button appears near Akagi. Ⅱ at the top right pauses.</li>
      <li><b>Gamepad</b>: left stick to fly, right stick rudder, RT/LT gun, A bomb, Y camera, LB/RB throttle</li>
    </ul>
    <h3>Rearming and landing</h3>
    <ul>
      <li>When out of bombs, land on <b>Akagi</b> (north of Oahu) to restore bombs, ammo and damage.</li>
      <li>Near Akagi (within 3 km, below 600 m) press <b>L</b> to land automatically. To land manually, lower the gear (G) and approach slowly from astern.</li>
      <li>Take-off: full power, then pull up (W / stick up) once you have speed. Your wingmen join after take-off.</li>
    </ul>
    <h3>Tactics</h3>
    <ul>
      <li>Each airfield scrambles fighters while it still has parked fighters. Destroy them on the ground to stop launches.</li>
      <li>US carriers keep launching aircraft until they are sunk.</li>
      <li>Your wingmen fly behind you on either side. N switches between "cover me" and "free engage".</li>
    </ul>
    <button class="btn" id="helpClose">Close</button>`,
};
export function applyHTML() {
  document.documentElement.lang = LANG;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const k = el.dataset.i18n;
    if (el.dataset.ja === undefined) el.dataset.ja = el.innerHTML;
    el.innerHTML = LANG === 'en' && HTML_EN[k] ? HTML_EN[k] : el.dataset.ja;
  }
  for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('active', b.dataset.lang === LANG);
  document.dispatchEvent(new Event('langchange'));
}
