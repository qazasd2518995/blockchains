const UI_ASSET_BASE = "/qmoney/assets/";
const CONFIGURED_API_ORIGIN = String(window.__QMONEY_CONFIG__?.apiOrigin || "").replace(/\/$/, "");
const API_BASE = `${CONFIGURED_API_ORIGIN}/api`;
const AUTH_STORAGE_KEY = "bg-auth";
const PREFERENCES_STORAGE_KEY = "qmoney-lobby-preferences-v1";
const GAME_BGM_PREFERENCES_KEY = "bg.bgm.prefs";
const GAME_SFX_PREFERENCES_KEY = "bg.sfx.prefs";
const RETURN_PATH = "/qmoney/";
const TEST_PLAYER_PATTERN = /^testplayer(?:[1-6])?$/i;

const elements = {
  loginView: document.querySelector("#loginView"),
  lobbyView: document.querySelector("#lobbyView"),
  lobbyScroll: document.querySelector("#lobbyScroll"),
  categoryTabs: document.querySelector("#categoryTabs"),
  providerStrip: document.querySelector("#providerStrip"),
  gameGrid: document.querySelector("#gameGrid"),
  gameSearch: document.querySelector("#gameSearch"),
  gameSearchWrap: document.querySelector("#gameSearchWrap"),
  searchToggle: document.querySelector("#searchToggle"),
  searchClose: document.querySelector("#searchClose"),
  gamesTitle: document.querySelector("#gamesTitle"),
  gamesCount: document.querySelector("#gamesCount"),
  emptyState: document.querySelector("#emptyState"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  modalCard: document.querySelector("#modalCard"),
  modalContent: document.querySelector("#modalContent"),
  modalClose: document.querySelector("#modalClose"),
  toast: document.querySelector("#toast"),
  accountName: document.querySelector("#accountName"),
  accountId: document.querySelector("#accountId"),
  balanceValue: document.querySelector("#balanceValue"),
  balanceButton: document.querySelector(".balance-row"),
  tickerTrack: document.querySelector("#tickerTrack"),
  heroCarousel: document.querySelector("#heroCarousel"),
  heroTrack: document.querySelector("#heroTrack"),
  carouselDots: document.querySelector("#carouselDots"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingImage: document.querySelector("#loadingImage"),
  loadingGameName: document.querySelector("#loadingGameName"),
  loginMusic: document.querySelector("#loginMusic"),
  lobbyMusic: document.querySelector("#lobbyMusic"),
  clickTab: document.querySelector("#clickTab"),
  clickGame: document.querySelector("#clickGame"),
  clickConfirm: document.querySelector("#clickConfirm"),
  clickCancel: document.querySelector("#clickCancel"),
};

const SETTINGS_COPY = {
  terms: { title: "服務條款", body: "使用本服務前請確認您已符合所在地的法定年齡與相關規範。測試帳號、點數及遊戲結果僅限授權測試用途。" },
  privacy: { title: "隱私條款", body: "平台只會使用登入、會員、點數與遊戲紀錄資料來提供本服務及維護帳號安全；權杖儲存在目前裝置，不會顯示於畫面或記錄到前端日誌。" },
  rules: { title: "遊戲規章", body: "遊戲下注、派彩、免費遊戲及中斷續玩皆以伺服器正式結算結果為準。請勿重複送出下注或嘗試繞過帳號權限。" },
};

const state = {
  session: readStoredSession(),
  games: [],
  category: "熱門",
  provider: "全部",
  query: "",
  currentSlide: 0,
  ...readPreferences(),
  isLobby: false,
  musicScene: "login",
  activeGame: null,
  catalogError: "",
  accessDenied: false,
  notices: [],
  history: {
    period: "7d",
    items: [],
    summary: null,
    nextCursor: null,
    loading: false,
    error: "",
    requestId: 0,
  },
  modalKind: "",
  toastTimer: null,
  balanceTimer: null,
  lastFocus: null,
};

let refreshInFlight = null;

function uiAsset(path) {
  return `${UI_ASSET_BASE}${path}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return amount.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function readStoredSession() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    const session = stored?.state;
    if (!session?.user || !session?.accessToken || !session?.refreshToken) return null;
    return { user: session.user, accessToken: session.accessToken, refreshToken: session.refreshToken };
  } catch {
    return null;
  }
}

function persistSession(session) {
  state.session = session;
  if (!session) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ state: session, version: 0 }));
}

function readPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) || "null");
    if (stored && typeof stored === "object") {
      return { musicOn: stored.musicOn !== false, soundOn: stored.soundOn !== false };
    }
    const gameMusic = readGameAudioPreference(GAME_BGM_PREFERENCES_KEY);
    const gameSound = readGameAudioPreference(GAME_SFX_PREFERENCES_KEY);
    return { musicOn: gameMusic ? !gameMusic.muted : true, soundOn: gameSound ? !gameSound.muted : true };
  } catch {
    return { musicOn: true, soundOn: true };
  }
}

function readGameAudioPreference(key) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!stored || typeof stored !== "object") return null;
    return stored;
  } catch {
    return null;
  }
}

function writeGameAudioPreference(key, muted, fallbackVolume) {
  const current = readGameAudioPreference(key);
  const volume = Number(current?.volume);
  try {
    window.localStorage.setItem(key, JSON.stringify({
      muted,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : fallbackVolume,
    }));
  } catch {
    // Audio defaults remain enabled when persistent storage is unavailable.
  }
}

function syncGameAudioPreferences() {
  writeGameAudioPreference(GAME_BGM_PREFERENCES_KEY, !state.musicOn, 0.32);
  writeGameAudioPreference(GAME_SFX_PREFERENCES_KEY, !state.soundOn, 0.6);
}

function persistPreferences() {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ musicOn: state.musicOn, soundOn: state.soundOn }));
  syncGameAudioPreferences();
}

function isTestPlayer() {
  return TEST_PLAYER_PATTERN.test(String(state.session?.user?.username || "").normalize("NFKC").trim());
}

function apiErrorMessage(payload, status) {
  const known = {
    INVALID_CREDENTIALS: "帳號或密碼錯誤",
    INVALID_CAPTCHA: "驗證碼錯誤，請重新輸入",
    SESSION_REPLACED: "這個帳號已在其他裝置登入",
    SESSION_EXPIRED: "登入已過期，請重新登入",
    MEMBER_FROZEN: "會員帳號目前無法使用",
    FORBIDDEN: "這個帳號尚未開放此功能",
  };
  return known[payload?.code] || payload?.message || `連線失敗 (${status})`;
}

async function rawRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    body: options.body !== undefined && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(apiErrorMessage(payload, response.status));
    error.status = response.status;
    error.code = payload?.code;
    throw error;
  }
  return payload;
}

function adoptRotatedStoredSession(attemptedRefreshToken) {
  const latestSession = readStoredSession();
  if (!latestSession?.refreshToken || latestSession.refreshToken === attemptedRefreshToken) return null;
  state.session = latestSession;
  return { accessToken: latestSession.accessToken, refreshToken: latestSession.refreshToken };
}

function refreshTokens() {
  if (refreshInFlight) return refreshInFlight;
  const attemptedRefreshToken = state.session?.refreshToken;
  if (!attemptedRefreshToken) return Promise.reject(new Error("登入已過期"));

  const request = rawRequest("/auth/refresh", {
    method: "POST",
    body: { refreshToken: attemptedRefreshToken },
  })
    .then((tokens) => {
      if (!state.session || state.session.refreshToken !== attemptedRefreshToken) {
        const adopted = adoptRotatedStoredSession(attemptedRefreshToken);
        if (adopted) return adopted;
        throw new Error("登入狀態已變更，請重新登入");
      }
      persistSession({
        ...state.session,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      return tokens;
    })
    .catch((error) => {
      // The Seth iframe and lobby share rotating credentials. If another
      // same-origin context completed the rotation first, adopt that newer
      // persisted pair instead of treating the stale response as a logout.
      const adopted = adoptRotatedStoredSession(attemptedRefreshToken);
      if (adopted) return adopted;
      throw error;
    });

  refreshInFlight = request;
  const clearRefresh = () => {
    if (refreshInFlight === request) refreshInFlight = null;
  };
  void request.then(clearRefresh, clearRefresh);
  return request;
}

async function apiRequest(path, options = {}, retried = false) {
  if (!state.session?.accessToken) throw new Error("請先登入");
  try {
    return await rawRequest(path, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${state.session.accessToken}` },
    });
  } catch (error) {
    if (error.status === 401 && !retried && state.session?.refreshToken) {
      const attemptedRefreshToken = state.session.refreshToken;
      try {
        await refreshTokens();
        return await apiRequest(path, options, true);
      } catch {
        // Never let a stale failed refresh erase a newer session that another
        // concurrent request or same-origin game frame has already persisted.
        if (state.session?.refreshToken === attemptedRefreshToken) signOut(false);
        throw new Error("登入已過期，請重新登入");
      }
    }
    throw error;
  }
}

function playSound(node) {
  if (!state.soundOn || !node) return;
  try {
    node.volume = Number(node.dataset.volume || 0.7);
    node.currentTime = 0;
    node.play()?.catch(() => {});
  } catch {
    // Decorative sound must never block an interaction.
  }
}

function syncMusic(scene = state.musicScene) {
  state.musicScene = scene;
  const tracks = { login: elements.loginMusic, lobby: elements.lobbyMusic };
  const activeTrack = tracks[scene] || elements.lobbyMusic;
  for (const track of Object.values(tracks)) {
    if (track !== activeTrack) {
      track.pause();
      track.currentTime = 0;
    }
  }
  if (!state.musicOn) {
    for (const track of Object.values(tracks)) track.pause();
    return;
  }
  activeTrack.volume = 0.36;
  activeTrack.play()?.catch(() => {});
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function setModal(content, variant = "") {
  state.lastFocus = document.activeElement;
  elements.modalCard.className = `modal-card${variant ? ` ${variant}` : ""}`;
  elements.modalContent.innerHTML = content;
  elements.modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  window.requestAnimationFrame(() => elements.modalClose.focus());
}

function closeModal() {
  if (elements.modalBackdrop.hidden) return;
  elements.modalBackdrop.hidden = true;
  elements.modalContent.replaceChildren();
  elements.modalCard.className = "modal-card";
  state.modalKind = "";
  document.body.style.overflow = "";
  syncMusic(state.isLobby ? "lobby" : "login");
  if (state.lastFocus instanceof HTMLElement) state.lastFocus.focus();
}

function sourcePopup(ribbon, body) {
  return `<div class="source-popup-ribbon">${ribbon}</div><div class="source-popup-body">${body}</div>`;
}

function updateAccount() {
  const user = state.session?.user;
  const username = user?.username || "--";
  elements.accountName.textContent = user?.displayName || username || "會員";
  elements.accountId.textContent = username;
  elements.balanceValue.textContent = formatAmount(user?.balance);
}

function loginFormMarkup(captcha, message = "") {
  return `
    <img class="modal-icon" src="/qmoney/assets/brand/jin-baobao-avatar.webp" alt="">
    <h1 class="modal-title" id="modalTitle">會員登入</h1>
    <p class="modal-subtitle">登入後使用金寶寶娛樂城（JBB GAMES）獨立會員點數、測試帳號權限與正式遊戲結算。</p>
    <form class="real-login-form" id="realLoginForm">
      <label><span>會員帳號</span><input name="username" autocomplete="username" maxlength="40" required></label>
      <label><span>密碼</span><input name="password" type="password" autocomplete="current-password" required></label>
      <label><span>驗證碼</span><div class="captcha-row"><input name="captchaCode" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required><button type="button" data-login-action="captcha" aria-label="更新驗證碼">${escapeHtml(captcha.captchaCode)}</button></div></label>
      <p class="form-error" id="loginError" ${message ? "" : "hidden"}>${escapeHtml(message)}</p>
      <button class="modal-button modal-button--pink" type="submit"><span>登入遊戲大廳</span></button>
    </form>`;
}

async function showLoginForm(message = "") {
  syncMusic("login");
  setModal(`<img class="modal-icon" src="${uiAsset("imgs_soc/media/loading.gif")}" alt=""><h1 class="modal-title" id="modalTitle">正在連線到會員系統</h1>`);
  try {
    const captcha = await rawRequest("/auth/captcha");
    elements.modalContent.innerHTML = loginFormMarkup(captcha, message);
    bindLoginForm(captcha);
  } catch (error) {
    elements.modalContent.innerHTML = `
      <h1 class="modal-title" id="modalTitle">無法連線後端</h1>
      <p class="modal-subtitle">${escapeHtml(error.message)}。請確認金寶寶遊戲服務已啟動後再試一次。</p>
      <button class="modal-button" type="button" data-modal-action="retry-login"><span>重新連線</span></button>`;
  }
}

function bindLoginForm(captcha) {
  const form = elements.modalContent.querySelector("#realLoginForm");
  form?.querySelector('[name="username"]')?.focus();
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    submit.disabled = true;
    submit.querySelector("span").textContent = "登入中…";
    try {
      const result = await rawRequest("/auth/login", {
        method: "POST",
        body: {
          username: String(data.get("username") || "").trim(),
          password: String(data.get("password") || ""),
          captchaCode: String(data.get("captchaCode") || "").trim(),
          captchaToken: captcha.captchaToken,
        },
      });
      persistSession({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken });
      playSound(elements.clickConfirm);
      closeModal();
      await enterLobby();
    } catch (error) {
      await showLoginForm(error.message);
    }
  });
  form?.querySelector('[data-login-action="captcha"]')?.addEventListener("click", () => void showLoginForm());
}

async function loadCatalog() {
  state.catalogError = "";
  state.accessDenied = !isTestPlayer();
  if (state.accessDenied) {
    state.games = [];
    renderProviders();
    renderHero();
    renderGames();
    return;
  }
  try {
    const result = await apiRequest("/games/catalog");
    state.games = Array.isArray(result.games) ? result.games : [];
  } catch (error) {
    state.games = [];
    state.catalogError = error.message;
  }
  renderProviders();
  renderHero();
  renderGames();
}

async function loadAnnouncements() {
  const requests = [
    rawRequest("/public/announcements?kind=marquee"),
    rawRequest("/public/announcements?kind=popup"),
  ];
  const [marqueeResult, popupResult] = await Promise.allSettled(requests);
  const marqueeItems = marqueeResult.status === "fulfilled" && Array.isArray(marqueeResult.value?.items) ? marqueeResult.value.items : [];
  const popupItems = popupResult.status === "fulfilled" && Array.isArray(popupResult.value?.items) ? popupResult.value.items : [];
  const allNotices = [...popupItems, ...marqueeItems].filter((item, index, items) => {
    const key = String(item.id || item.content || "");
    return items.findIndex((candidate) => String(candidate.id || candidate.content || "") === key) === index;
  });
  state.notices = allNotices.map((item) => ({
    title: String(item.content || "平台公告").split(/[\n。]/)[0].slice(0, 28) || "平台公告",
    content: String(item.content || ""),
    date: formatDate(item.createdAt),
    kind: "系統公告",
    icon: "a",
  }));
  const tickerMessages = marqueeItems.map((item) => String(item.content || "").trim()).filter(Boolean);
  elements.tickerTrack.textContent = tickerMessages.length ? tickerMessages.join("　｜　") : "目前沒有新公告";
}

async function refreshBalance(quiet = false) {
  if (!state.session) return;
  elements.balanceButton.classList.add("is-loading");
  try {
    const result = await apiRequest("/wallet/balance");
    persistSession({ ...state.session, user: { ...state.session.user, balance: result.balance } });
    updateAccount();
    if (!quiet) showToast("點數已更新");
  } catch (error) {
    if (!quiet) showToast(error.message);
  } finally {
    elements.balanceButton.classList.remove("is-loading");
  }
}

function finishInitialView() {
  document.body.classList.remove("is-booting");
}

function activateLobbyView() {
  state.isLobby = true;
  elements.loginView.classList.remove("is-active");
  elements.lobbyView.classList.add("is-active");
  elements.lobbyView.setAttribute("aria-hidden", "false");
  elements.loginView.setAttribute("aria-hidden", "true");
  updateAccount();
  syncMusic("lobby");
  finishInitialView();
}

async function enterLobby() {
  if (!state.session) return showLoginForm();
  activateLobbyView();
  await Promise.all([loadCatalog(), refreshBalance(true), loadAnnouncements()]);
  window.requestAnimationFrame(() => elements.providerStrip.querySelector(".is-active")?.scrollIntoView({ inline: "center", block: "nearest" }));
  window.clearInterval(state.balanceTimer);
  state.balanceTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void refreshBalance(true);
  }, 15_000);
  showToast(`歡迎回來，${state.session.user.displayName || state.session.user.username}`);
}

function showLoginView() {
  state.isLobby = false;
  state.games = [];
  window.clearInterval(state.balanceTimer);
  elements.lobbyView.classList.remove("is-active");
  elements.loginView.classList.add("is-active");
  elements.lobbyView.setAttribute("aria-hidden", "true");
  elements.loginView.setAttribute("aria-hidden", "false");
  syncMusic("login");
  finishInitialView();
}

async function signOut(callServer = true) {
  const refreshToken = state.session?.refreshToken;
  persistSession(null);
  closeModal();
  showLoginView();
  if (callServer && refreshToken) await rawRequest("/auth/logout", { method: "POST", body: { refreshToken } }).catch(() => {});
  showToast("已安全登出");
}

function gameMatches(game) {
  if (game.category !== state.category) return false;
  if (state.provider !== "全部" && game.provider !== state.provider) return false;
  if (!state.query) return true;
  return `${game.name} ${game.nameEn} ${game.provider} ${game.category}`.toLocaleLowerCase("zh-Hant").includes(state.query);
}

function renderProviders() {
  const categoryGames = state.games.filter((game) => game.category === state.category);
  const providers = ["全部", ...new Set(categoryGames.map((game) => String(game.provider || "").trim()).filter(Boolean))];
  if (!providers.includes(state.provider)) state.provider = "全部";
  elements.providerStrip.innerHTML = providers.map((provider) => `
    <button class="provider-button${provider === state.provider ? " is-active" : ""}" type="button" data-provider="${escapeHtml(provider)}">
      <span>${provider === "全部" ? "全部館別" : escapeHtml(provider)}</span>
    </button>`).join("");
  elements.providerStrip.hidden = providers.length <= 1;
}

function renderHero() {
  const priorities = ["storm-of-seth-2", "power-of-thor-2", "fruit-mary"];
  const games = [...state.games]
    .sort((a, b) => {
      const aPriority = priorities.indexOf(a.id);
      const bPriority = priorities.indexOf(b.id);
      if (aPriority >= 0 || bPriority >= 0) return (aPriority < 0 ? 99 : aPriority) - (bPriority < 0 ? 99 : bPriority);
      if (a.category === "捕魚" && b.category !== "捕魚") return -1;
      if (b.category === "捕魚" && a.category !== "捕魚") return 1;
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    })
    .filter((game, index, all) => index < 6 && all.findIndex((item) => item.id === game.id) === index);

  elements.heroTrack.innerHTML = games.map((game, index) => `
    <button class="hero-slide${index === 0 ? " is-active" : ""}" type="button" data-hero-game="${escapeHtml(game.id)}" aria-label="立即遊玩 ${escapeHtml(game.name)}">
      <img src="${escapeHtml(game.cover)}" alt="" loading="${index === 0 ? "eager" : "lazy"}">
      <span class="hero-slide-copy"><small>${escapeHtml(game.provider)} · ${escapeHtml(game.category)}</small><strong>${escapeHtml(game.name)}</strong><em>立即遊玩</em></span>
    </button>`).join("");
  elements.carouselDots.innerHTML = games.map((game, index) => `<button class="${index === 0 ? "is-active" : ""}" type="button" data-slide="${index}" aria-label="顯示 ${escapeHtml(game.name)}"></button>`).join("");
  elements.heroCarousel.hidden = games.length === 0;
  state.currentSlide = 0;
}

function renderGames() {
  const visibleGames = state.games.filter(gameMatches);
  const titles = { 熱門: "熱門遊戲", 拉霸: "拉霸遊戲", 捕魚: "捕魚遊戲", 棋牌: "棋牌遊戲" };
  elements.gamesTitle.textContent = titles[state.category] || state.category;
  elements.gamesCount.textContent = visibleGames.length ? `${visibleGames.length} 款` : "";
  elements.gameGrid.replaceChildren();
  for (const [index, game] of visibleGames.entries()) {
    const card = document.createElement("article");
    card.className = `game-card${index === 0 ? " is-featured" : ""}`;
    card.style.animationDelay = `${Math.min(index * 25, 220)}ms`;
    const launch = document.createElement("button");
    launch.className = "game-launch";
    launch.type = "button";
    launch.dataset.game = game.id;
    launch.setAttribute("aria-label", `開啟 ${game.name}`);
    launch.innerHTML = `
      <div class="game-card-image">${game.badge ? `<span class="game-badge">${escapeHtml(game.badge)}</span>` : ""}<img src="${escapeHtml(game.cover)}" alt="${escapeHtml(game.name)}" loading="lazy"></div>
      <div class="game-card-copy"><span class="game-card-title">${escapeHtml(game.name)}</span><span class="game-card-provider">${escapeHtml(game.provider)}</span></div>`;
    launch.querySelector("img")?.addEventListener("error", (event) => {
      event.currentTarget.hidden = true;
      event.currentTarget.parentElement?.classList.add("is-missing-cover");
    });
    card.append(launch);
    elements.gameGrid.append(card);
  }
  elements.emptyState.hidden = visibleGames.length > 0;
  elements.emptyState.textContent = state.accessDenied
    ? "此大廳遊戲目前只開放 testplayer、testplayer1～testplayer6 測試帳號"
    : state.catalogError
      ? `遊戲目錄載入失敗：${state.catalogError}`
      : state.games.length === 0
        ? "這個測試帳號目前沒有已開放的遊戲"
        : "這個分類目前沒有遊戲";
}

function selectCategory(category) {
  state.category = category;
  for (const tab of elements.categoryTabs.querySelectorAll(".category-tab")) tab.classList.toggle("is-active", tab.dataset.category === category);
  renderProviders();
  renderGames();
}

function selectProvider(provider) {
  state.provider = provider;
  for (const button of elements.providerStrip.querySelectorAll("[data-provider]")) button.classList.toggle("is-active", button.dataset.provider === provider);
  renderGames();
}

function showGame(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  state.activeGame = game;
  playSound(elements.clickGame);
  launchActiveGame();
}

function launchActiveGame() {
  const game = state.activeGame;
  if (!game || !state.session) return;
  if (!isTestPlayer()) return showToast("此遊戲只開放測試帳號");
  if (typeof game.route !== "string" || !game.route.startsWith("/games/")) return showToast("遊戲啟動路徑無效");
  closeModal();
  elements.loadingGameName.textContent = `正在啟動 ${game.name}`;
  elements.loadingImage.src = `${uiAsset("imgs_soc/media/loading.gif")}?run=${Date.now()}`;
  elements.loadingOverlay.hidden = false;
  const target = new URL(game.route, window.location.origin);
  target.searchParams.set("returnTo", RETURN_PATH);
  target.searchParams.set("returnLabel", "金寶寶遊戲大廳");
  window.setTimeout(() => window.location.assign(target), 320);
}

function showSettings(page = "root") {
  state.modalKind = "settings";
  if (page !== "root" && SETTINGS_COPY[page]) {
    const copy = SETTINGS_COPY[page];
    setModal(sourcePopup(`<span id="modalTitle">${escapeHtml(copy.title)}</span>`, `<div class="text-page"><button class="back-pill" type="button" data-modal-action="settings-back">‹ 返回設定</button><h3>${escapeHtml(copy.title)}</h3><p>${escapeHtml(copy.body)}</p></div>`), "source-popup");
    return;
  }
  const body = `
    <div class="settings-list">
      <div class="setting-row"><span>音效設定</span><div class="audio-controls"><button class="audio-toggle ${state.musicOn ? "is-on" : ""}" type="button" data-modal-action="toggle-music" aria-label="切換背景音樂"></button><button class="audio-toggle ${state.soundOn ? "is-on" : ""}" type="button" data-modal-action="toggle-sound" aria-label="切換遊戲音效"></button></div></div>
      <button class="setting-row setting-row--button" type="button" data-modal-action="game-history"><span>遊戲紀錄</span><strong>正式注單</strong></button>
      <button class="setting-row setting-row--button" type="button" data-modal-action="settings-page" data-value="terms"><span>服務條款</span></button>
      <button class="setting-row setting-row--button" type="button" data-modal-action="settings-page" data-value="privacy"><span>隱私條款</span></button>
      <button class="setting-row setting-row--button" type="button" data-modal-action="settings-page" data-value="rules"><span>遊戲規章</span></button>
    </div>
    <div class="settings-footer"><button class="logout-pill" type="button" data-modal-action="logout">登出</button></div>`;
  setModal(sourcePopup(`<span id="modalTitle">設定</span>`, body), "source-popup");
}

function noticeIcon(item) {
  return uiAsset(`imgs_soc/icon/notic/${item.icon || "all"}.webp`);
}

function showNotices(detailIndex = null) {
  state.modalKind = "notices";
  const ribbon = `<span id="modalTitle">系統公告</span>`;
  if (detailIndex !== null) {
    const notice = state.notices[detailIndex];
    if (!notice) return showNotices();
    const detail = `<div class="notice-detail"><button class="back-pill" type="button" data-modal-action="notice-back">‹ 返回公告</button><h3>${escapeHtml(notice.title)}</h3><time>${escapeHtml(notice.date)}</time><p>${escapeHtml(notice.content)}</p></div>`;
    setModal(sourcePopup(ribbon, detail), "source-popup");
    return;
  }
  const list = state.notices.map((item, index) => {
    return `<button class="notice-item" type="button" data-modal-action="notice-detail" data-value="${index}"><img src="${noticeIcon(item)}" alt=""><span class="notice-item-copy"><strong>${escapeHtml(item.title)}</strong><time>${escapeHtml(item.date)}</time></span><span class="notice-arrow">›</span></button>`;
  }).join("");
  const empty = `<div class="placeholder-panel"><div><img src="${uiAsset("imgs_soc/media/empty.webp")}" alt=""><p>目前沒有系統公告</p></div></div>`;
  setModal(sourcePopup(ribbon, `<div class="notice-list">${list || empty}</div>`), "source-popup");
}

const HISTORY_PERIODS = [
  ["today", "今日"],
  ["7d", "近 7 日"],
  ["30d", "近 30 日"],
  ["all", "全部"],
];

function gameDisplayName(gameId) {
  return state.games.find((game) => game.id === gameId)?.name || gameId || "遊戲注單";
}

function historyPeriodStart(period) {
  if (period === "all") return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (period === "7d") date.setDate(date.getDate() - 6);
  if (period === "30d") date.setDate(date.getDate() - 29);
  return date.toISOString();
}

function updateSourceModal(title, body) {
  const content = sourcePopup(`<span id="modalTitle">${escapeHtml(title)}</span>`, body);
  if (elements.modalBackdrop.hidden) setModal(content, "source-popup");
  else {
    elements.modalCard.className = "modal-card source-popup";
    elements.modalContent.innerHTML = content;
  }
}

function historyRowMarkup(item) {
  const profit = Number(item.profit || 0);
  const hasDetail = Boolean(item.betId);
  return `<button class="history-row" type="button" ${hasDetail ? `data-modal-action="history-detail" data-value="${escapeHtml(item.betId)}"` : "disabled"}>
    <span class="history-row-main"><strong>${escapeHtml(gameDisplayName(item.gameId))}</strong><time>${escapeHtml(new Date(item.createdAt).toLocaleString("zh-TW"))}</time><small>注單 ${escapeHtml(String(item.betId || item.id).slice(-10))}</small></span>
    <span class="history-row-money"><strong class="${profit >= 0 ? "is-positive" : "is-negative"}">${profit >= 0 ? "+" : ""}${formatAmount(profit)}</strong><small>下注 ${formatAmount(item.betAmount)} · 派彩 ${formatAmount(item.payout)}</small><em>餘額 ${formatAmount(item.balanceAfter)} ›</em></span>
  </button>`;
}

function renderGameHistory() {
  const history = state.history;
  const periodButtons = HISTORY_PERIODS.map(([value, label]) => `<button class="${history.period === value ? "is-active" : ""}" type="button" data-modal-action="history-period" data-value="${value}">${label}</button>`).join("");
  let list = history.items.map(historyRowMarkup).join("");
  if (history.loading && history.items.length === 0) list = `<div class="history-state"><img src="${uiAsset("imgs_soc/media/loading.gif")}" alt=""><p>正在讀取正式注單</p></div>`;
  else if (history.error && history.items.length === 0) list = `<div class="history-state"><p>${escapeHtml(history.error)}</p><button type="button" data-modal-action="history-refresh">重新載入</button></div>`;
  else if (!list) list = `<div class="history-state"><img src="${uiAsset("imgs_soc/media/empty.webp")}" alt=""><p>這個期間沒有遊戲注單</p></div>`;
  const summary = history.summary || {};
  const body = `
    <div class="history-periods" aria-label="紀錄期間">${periodButtons}</div>
    <div class="history-summary">
      <span>注單數<strong>${Number(summary.totalCount || 0).toLocaleString("zh-TW")}</strong></span>
      <span>有效下注<strong>${formatAmount(summary.validAmount || 0)}</strong></span>
      <span>總輸贏<strong class="${Number(summary.net || 0) >= 0 ? "is-positive" : "is-negative"}">${Number(summary.net || 0) >= 0 ? "+" : ""}${formatAmount(summary.net || 0)}</strong></span>
    </div>
    ${history.error && history.items.length ? `<p class="history-inline-error">${escapeHtml(history.error)}</p>` : ""}
    <div class="history-list">${list}</div>
    ${history.nextCursor ? `<button class="history-more" type="button" data-modal-action="history-more" ${history.loading ? "disabled" : ""}>${history.loading ? "載入中…" : "載入更多"}</button>` : ""}`;
  updateSourceModal("遊戲紀錄", body);
}

async function loadGameHistory(reset = true) {
  const history = state.history;
  const requestId = history.requestId + 1;
  history.requestId = requestId;
  history.loading = true;
  history.error = "";
  if (reset) {
    history.items = [];
    history.summary = null;
    history.nextCursor = null;
  }
  renderGameHistory();
  const params = new URLSearchParams({ limit: "20" });
  const from = historyPeriodStart(history.period);
  if (from) params.set("from", from);
  if (!reset && history.nextCursor) params.set("cursor", history.nextCursor);
  try {
    const result = await apiRequest(`/wallet/transactions?${params.toString()}`);
    if (history.requestId !== requestId) return;
    history.items = reset ? (result.items || []) : [...history.items, ...(result.items || [])];
    history.summary = result.summary || null;
    history.nextCursor = result.nextCursor || null;
  } catch (error) {
    if (history.requestId !== requestId) return;
    history.error = error.message;
  } finally {
    if (history.requestId === requestId) history.loading = false;
    if (state.modalKind === "game-history") renderGameHistory();
  }
}

function showGameHistory(period = state.history.period) {
  state.modalKind = "game-history";
  state.history.period = period;
  void loadGameHistory(true);
}

async function showBetDetail(betId) {
  state.modalKind = "bet-detail";
  updateSourceModal("注單明細", `<div class="history-state"><img src="${uiAsset("imgs_soc/media/loading.gif")}" alt=""><p>正在讀取單局明細</p></div>`);
  try {
    const detail = await apiRequest(`/wallet/bets/${encodeURIComponent(betId)}`);
    if (state.modalKind !== "bet-detail") return;
    const profit = Number(detail.profit || 0);
    const multiplier = Number(detail.multiplier || 0);
    const rows = [
      ["遊戲", gameDisplayName(detail.gameId)],
      ["下注時間", new Date(detail.createdAt).toLocaleString("zh-TW")],
      ["下注金額", formatAmount(detail.amount)],
      ["派彩金額", formatAmount(detail.payout)],
      ["輸贏", `${profit >= 0 ? "+" : ""}${formatAmount(profit)}`],
      ["派彩倍數", `${multiplier.toLocaleString("zh-TW", { maximumFractionDigits: 4 })}x`],
      ["狀態", detail.status === "SETTLED" ? "已結算" : String(detail.status || "--")],
      ["注單編號", detail.id],
    ];
    const body = `<div class="bet-detail"><button class="back-pill" type="button" data-modal-action="history-back">‹ 返回遊戲紀錄</button>${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
    updateSourceModal("注單明細", body);
  } catch (error) {
    if (state.modalKind !== "bet-detail") return;
    updateSourceModal("注單明細", `<div class="history-state"><p>${escapeHtml(error.message)}</p><button type="button" data-modal-action="history-back">返回遊戲紀錄</button></div>`);
  }
}

function setSlide(index) {
  const slides = [...elements.heroTrack.querySelectorAll(".hero-slide")];
  const dots = [...elements.carouselDots.querySelectorAll("button")];
  if (slides.length === 0) return;
  state.currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle("is-active", i === state.currentSlide));
  dots.forEach((dot, i) => dot.classList.toggle("is-active", i === state.currentSlide));
}

elements.modalClose.addEventListener("click", () => { playSound(elements.clickCancel); closeModal(); });
elements.modalBackdrop.addEventListener("click", (event) => { if (event.target === elements.modalBackdrop) closeModal(); });
elements.modalContent.addEventListener("click", (event) => {
  const control = event.target.closest("[data-modal-action]");
  if (!control) return;
  const action = control.dataset.modalAction;
  const value = control.dataset.value;
  if (action === "launch-game") launchActiveGame();
  else if (action === "retry-login") void showLoginForm();
  else if (action === "toggle-music") { state.musicOn = !state.musicOn; control.classList.toggle("is-on", state.musicOn); persistPreferences(); syncMusic(); }
  else if (action === "toggle-sound") { state.soundOn = !state.soundOn; control.classList.toggle("is-on", state.soundOn); persistPreferences(); playSound(elements.clickConfirm); }
  else if (action === "logout") void signOut();
  else if (action === "game-history") showGameHistory();
  else if (action === "settings-page") showSettings(value);
  else if (action === "settings-back") showSettings();
  else if (action === "notice-detail") showNotices(Number(value));
  else if (action === "notice-back") showNotices();
  else if (action === "history-period") showGameHistory(value);
  else if (action === "history-refresh") void loadGameHistory(true);
  else if (action === "history-more") void loadGameHistory(false);
  else if (action === "history-detail") void showBetDetail(value);
  else if (action === "history-back") { state.modalKind = "game-history"; renderGameHistory(); }
  else if (action === "close") closeModal();
});

elements.categoryTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-category]");
  if (tab) { playSound(elements.clickTab); selectCategory(tab.dataset.category); }
});

elements.providerStrip.addEventListener("click", (event) => {
  const provider = event.target.closest("[data-provider]");
  if (!provider) return;
  playSound(elements.clickTab);
  provider.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  selectProvider(provider.dataset.provider);
});

elements.gameSearch.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLocaleLowerCase("zh-Hant");
  renderGames();
});

elements.searchToggle.addEventListener("click", () => {
  elements.gameSearchWrap.hidden = false;
  elements.gameSearch.focus();
});

elements.searchClose.addEventListener("click", () => {
  state.query = "";
  elements.gameSearch.value = "";
  elements.gameSearchWrap.hidden = true;
  renderGames();
});

elements.gameGrid.addEventListener("click", (event) => {
  const launch = event.target.closest("[data-game]");
  if (launch) showGame(launch.dataset.game);
});

elements.carouselDots.addEventListener("click", (event) => {
  const dot = event.target.closest("[data-slide]");
  if (dot) setSlide(Number(dot.dataset.slide));
});
elements.heroTrack.addEventListener("click", (event) => {
  const slide = event.target.closest("[data-hero-game]");
  if (slide) showGame(slide.dataset.heroGame);
});

elements.lobbyView.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  playSound(elements.clickTab);
  const action = button.dataset.action;
  if (action === "settings") showSettings();
  else if (action === "notices") showNotices();
  else if (action === "refresh-balance") void refreshBalance();
  else if (action === "scroll-top") elements.lobbyScroll.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#webLogin").addEventListener("click", () => void showLoginForm());
document.addEventListener("pointerdown", () => syncMusic(state.isLobby ? "lobby" : "login"), { once: true, capture: true });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
window.addEventListener("pageshow", () => {
  const preferences = readPreferences();
  state.musicOn = preferences.musicOn;
  state.soundOn = preferences.soundOn;
  syncGameAudioPreferences();
  syncMusic(state.isLobby ? "lobby" : "login");
  elements.loadingOverlay.hidden = true;
  if (state.isLobby) void refreshBalance(true);
});
window.addEventListener("storage", (event) => {
  if (event.key !== AUTH_STORAGE_KEY) return;
  state.session = readStoredSession();
  if (!state.session) showLoginView();
  else if (state.isLobby) { updateAccount(); void refreshBalance(true); }
});

window.setInterval(() => { if (state.isLobby && elements.modalBackdrop.hidden && document.visibilityState === "visible") setSlide(state.currentSlide + 1); }, 4_800);

async function bootstrap() {
  syncGameAudioPreferences();
  if (!state.session) return showLoginView();
  // Restore the persisted member shell synchronously. Waiting for /auth/me
  // while the login view is active causes a visible login flash on every
  // return from a game, especially on mobile networks.
  activateLobbyView();
  try {
    const user = await apiRequest("/auth/me");
    persistSession({ ...state.session, user });
    await enterLobby();
  } catch (error) {
    persistSession(null);
    showLoginView();
    showToast(error.message);
  }
}

void bootstrap();
