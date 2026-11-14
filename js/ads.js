// Google AdMob 広告（Android / iOS アプリのときだけ動く。Web 版では何もしない）
// 構成は techgymjp/jackal・corner-kick の ads.js と同じ。リワード・インタースティシャル・バナーを使う
// 広告の表示中はゲームの音を止める（Ads.onSuspend / Ads.onResume をゲーム側で設定）
window.Ads = (() => {
  // AdMob では Android と iOS を別のアプリとして登録しているので、広告ユニットも OS ごとに分かれている
  const UNITS = {
    android: {
      // Google 公式のテスト用広告ユニット
      test: {
        interstitial: 'ca-app-pub-3940256099942544/1033173712',
        rewarded: 'ca-app-pub-3940256099942544/5224354917',
        banner: '', // バナー広告は使わない（プレイ画面に出さないため完全に無効）
      },
      // 本番の広告ユニット(AdMob の「零戦 真珠湾攻撃」Android)。届いたら入れる。空の種類は本番ビルドでは出さない
      production: {
        interstitial: 'ca-app-pub-6411535997477460/2405105701',
        rewarded: 'ca-app-pub-6411535997477460/1092024038',
        // 登録済みのバナー広告ユニット。プレイ画面に出ないよう、バナーは has('banner') で常に無効にしている
        banner: 'ca-app-pub-6411535997477460/6606085497',
      },
    },
    ios: {
      test: {
        interstitial: 'ca-app-pub-3940256099942544/4411468910',
        rewarded: 'ca-app-pub-3940256099942544/1712485313',
        banner: '', // バナー広告は使わない
      },
      // 本番の広告ユニット(iOS)。iOS 版を作るときに入れる
      production: {
        interstitial: '',
        rewarded: '',
        banner: '',
      },
    },
  };
  const RETRY_MS = 20000;      // 読み込みに失敗したら少し待って再挑戦する
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  let AdMob = native && cap.Plugins ? cap.Plugins.AdMob : null;
  const platform = native && cap.getPlatform && cap.getPlatform() === 'ios' ? 'ios' : 'android';
  const testing = window.AD_MODE !== 'production';
  const ids = UNITS[platform][testing ? 'test' : 'production'];
  // 広告ユニット ID がある種類だけ使う(1 つもなければ広告を使わない)
  const has = (kind) => kind !== 'banner' && !!ids[kind]; // バナーは常に無効
  if (!has('interstitial') && !has('rewarded') && !has('banner')) AdMob = null;

  // ゲーム側から設定する（広告の表示中に音を止める）
  const hooks = { suspend() {}, resume() {} };
  let ready = false;           // 広告をリクエストしてよい状態（初期化と同意確認が済んだ）
  let showing = false;
  let privacyRequired = false; // 「広告の設定」を利用者が開けるようにする必要があるか（EU など）
  const waiters = {};          // 表示中の広告が閉じたときに呼ぶ処理

  // 広告の種類ごとの読み込み状態
  const slots = {
    inter: { unit: 'interstitial', loaded: false, pending: null, load: () => AdMob.prepareInterstitial({ adId: ids.interstitial, isTesting: testing }) },
    reward: { unit: 'rewarded', loaded: false, pending: null, load: () => AdMob.prepareRewardVideoAd({ adId: ids.rewarded, isTesting: testing }) },
  };

  // 読み込みを始め、読み込めたら true で resolve する Promise を返す（読み込み中なら同じ Promise）
  function prepare(kind) {
    const s = slots[kind];
    if (!ready || !has(s.unit)) return Promise.resolve(false);
    if (s.loaded) return Promise.resolve(true);
    if (!s.pending) {
      s.pending = s.load()
        .then(() => { s.loaded = true; return true; })
        .catch(() => { setTimeout(() => prepare(kind), RETRY_MS); return false; })
        .finally(() => { s.pending = null; });
    }
    return s.pending;
  }

  // 読み込み済みでなければ、最大 timeout ミリ秒だけ読み込みを待つ
  function ensureLoaded(kind, timeout) {
    if (slots[kind].loaded) return Promise.resolve(true);
    return Promise.race([prepare(kind), new Promise((r) => setTimeout(() => r(false), timeout))]);
  }

  function finish(kind, result) {
    showing = false;
    hooks.resume();
    syncBanner();
    const w = waiters[kind];
    waiters[kind] = null;
    if (w) w(result);
  }

  async function init() {
    try {
      await AdMob.initialize({ initializeForTesting: testing });
    } catch (e) {
      return;
    }
    // EU・英国などで必要な広告の同意確認（必要な地域でだけフォームが出る）。
    // 確認自体が失敗した場合（AdMob 側でメッセージ未設定など）は、同意不要の地域とみなして続ける
    try {
      let consent = await AdMob.requestConsentInfo();
      if (consent.status === 'REQUIRED' && consent.isConsentFormAvailable) consent = await AdMob.showConsentForm();
      ready = consent.canRequestAds !== false;
      privacyRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch (e) {
      ready = true;
    }
    // iOS では、広告用の ID を使ってよいか(App Tracking Transparency)を利用者に確認する。
    // 同意確認のあとに一度だけ出る。断られても広告は出せる(パーソナライズされないだけ)
    if (platform === 'ios') {
      try {
        const { status } = await AdMob.trackingAuthorizationStatus();
        if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      } catch (e) { /* 非対応 */ }
    }
    let rewarded = false;
    AdMob.addListener('bannerAdLoaded', () => enforceBanner());
    AdMob.addListener('bannerAdSizeChanged', () => enforceBanner());
    // プレイ中は念のため定期的にも確認する
    enforceBanner();
    setInterval(enforceBanner, 2000);
    AdMob.addListener('interstitialAdDismissed', () => finish('inter'));
    AdMob.addListener('interstitialAdFailedToShow', () => finish('inter'));
    AdMob.addListener('onRewardedVideoAdShowed', () => { rewarded = false; });
    AdMob.addListener('onRewardedVideoAdReward', () => { rewarded = true; });
    AdMob.addListener('onRewardedVideoAdDismissed', () => finish('reward', rewarded));
    AdMob.addListener('onRewardedVideoAdFailedToShow', () => finish('reward', false));
    prepare('inter');
    prepare('reward');
    syncBanner();
  }

  // 全画面広告を表示し、閉じられたら resolve する（読み込めていないときは最大 timeout ミリ秒だけ待ち、だめなら出さずに resolve）
  async function showInterstitial(timeout = 0) {
    if (!AdMob || showing || !has('interstitial')) return;
    await initDone;
    if (!ready || !(await ensureLoaded('inter', timeout))) return;
    showing = true; slots.inter.loaded = false;
    hooks.suspend();
    syncBanner();
    return new Promise((resolve) => {
      waiters.inter = () => { prepare('inter'); resolve(); };
      AdMob.showInterstitial().catch(() => finish('inter'));
    });
  }

  // リワード広告を表示する。結果は 'rewarded'（最後まで見た）/ 'skipped'（途中で閉じた）/ 'unavailable'（読み込めなかった）
  async function showRewarded() {
    if (!AdMob || showing || !has('rewarded')) return 'unavailable';
    await initDone;
    if (!ready || !(await ensureLoaded('reward', 8000))) return 'unavailable';
    showing = true; slots.reward.loaded = false;
    hooks.suspend();
    syncBanner();
    return new Promise((resolve) => {
      waiters.reward = (ok) => { prepare('reward'); resolve(ok ? 'rewarded' : 'skipped'); };
      AdMob.showRewardVideoAd().catch(() => finish('reward', false));
    });
  }

  // ---------- バナー ----------
  // 操作ボタンと重ならないよう、タイトル・あそびかた・ポーズ・結果画面の下中央にだけ出す(プレイ中は隠す)
  const banner = { want: false, state: 'none', busy: false }; // state: none | shown | hidden
  function setBanner(want) {
    if (banner.want === want) return;
    banner.want = want;
    syncBanner();
  }
  async function syncBanner() {
    if (!AdMob || !ready || banner.busy || !has('banner')) return;
    const target = banner.want && !showing ? 'shown' : 'none';
    if (target === banner.state) return;
    banner.busy = true;
    try {
      if (target === 'shown') {
        await AdMob.showBanner({ adId: ids.banner, adSize: 'BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: testing });
        banner.state = 'shown';
      } else {
        // 隠すときは一時停止ではなく取り除く（読み込み途中の hide は無視され、あとから表示されることがあるため）
        await AdMob.removeBanner();
        banner.state = 'none';
      }
    } catch (e) {
      banner.state = target === 'shown' ? 'none' : banner.state;
    }
    banner.busy = false;
    // 待っている間に状態が変わっていたら追いかける
    const again = banner.want && !showing ? 'shown' : 'none';
    if (again !== banner.state) syncBanner();
  }
  // 読み込みが遅れて終わったバナーが、プレイ中に出てしまわないようにする
  function enforceBanner() {
    if (!AdMob) return; // バナーは使わないので、何かの拍子に出ていても常に消す
    AdMob.removeBanner().catch(() => {});
    banner.state = 'none';
  }

  // 同意した内容をあとから変更するための Google のフォームを開く
  function showPrivacyOptions() {
    if (!AdMob) return Promise.resolve();
    return AdMob.showPrivacyOptionsForm().catch(() => {});
  }

  const initDone = AdMob ? init() : Promise.resolve();

  return {
    set onSuspend(fn) { hooks.suspend = fn; },
    set onResume(fn) { hooks.resume = fn; },
    get available() { return !!AdMob; },
    get canReward() { return !!AdMob && has('rewarded'); },  // リワード広告(チート)を出せるか
    get showing() { return showing; },
    get privacyOptionsRequired() { return privacyRequired; },
    initDone,
    showInterstitial,
    showRewarded,
    setBanner,
    showPrivacyOptions,
  };
})();
