const UI_ASSET_BASE = "/qmoney/assets/";
const CONFIGURED_API_ORIGIN = String(window.__QMONEY_CONFIG__?.apiOrigin || "").replace(/\/$/, "");
const API_BASE = `${CONFIGURED_API_ORIGIN}/api`;
const AUTH_STORAGE_KEY = "bg-auth";
const FAVORITES_STORAGE_KEY = "qmoney-new-casino-favorites";
const PREFERENCES_STORAGE_KEY = "qmoney-lobby-preferences-v1";
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
  vipLevel: document.querySelector("#vipLevel"),
  balanceButton: document.querySelector(".balance-row"),
  jackpotDigits: document.querySelector("#jackpotDigits"),
  tickerTrack: document.querySelector("#tickerTrack"),
  heroSlides: [...document.querySelectorAll(".hero-slide")],
  carouselDots: [...document.querySelectorAll("#carouselDots button")],
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingImage: document.querySelector("#loadingImage"),
  loadingGameName: document.querySelector("#loadingGameName"),
  loginMusic: document.querySelector("#loginMusic"),
  lobbyMusic: document.querySelector("#lobbyMusic"),
  storeMusic: document.querySelector("#storeMusic"),
  clickTab: document.querySelector("#clickTab"),
  clickGame: document.querySelector("#clickGame"),
  clickConfirm: document.querySelector("#clickConfirm"),
  clickCancel: document.querySelector("#clickCancel"),
  clickFooter: document.querySelector("#clickFooter"),
  addFavorite: document.querySelector("#addFavorite"),
  removeFavorite: document.querySelector("#removeFavorite"),
  getReward: document.querySelector("#getReward"),
};

const FALLBACK_NOTICES = [
  { title: "錢女友正式營運", content: "錢女友遊戲大廳正式營運，所有遊戲皆採用正式點數與後端結算。", date: "2026/01/10", kind: "網站公告", icon: "a" },
  { title: "新手指南", content: "登入測試會員後，從遊戲大廳選擇遊戲即可進入。遊戲點數與會員餘額共用。", date: "2026/01/11", kind: "全部通知", icon: "a" },
  { title: "儲值管道", content: "本測試站目前由獨立 API 與資料庫管理，請依管理端設定進行點數作業。", date: "2026/01/11", kind: "銀行公告", icon: "a" },
  { title: "多項活動大放送 🎁", content: "活動內容與開放期間以管理端最新公告為準。", date: "2026/01/11", kind: "福利通知", icon: "d" },
  { title: "完成任務送好禮", content: "投注任務將依會員的有效投注紀錄自動累計。", date: "2026/01/11", kind: "福利通知", icon: "d" },
  { title: "【嚴防詐騙／禁止代操／勿信謠言】", content: "請認明正式網站入口，請勿將帳號、密碼或驗證資訊交付他人。", date: "2026/01/11", kind: "網站公告", icon: "a" },
  { title: "VIP等級條件調整通知", content: "VIP 等級、任務與獎勵內容以平台最新公告為準。", date: "2026/03/02", kind: "網站公告", icon: "a" },
  { title: "【RSG 電子遊戲例行維護】", content: "館別維護期間遊戲入口將暫停開放，完成後自動恢復。", date: "2026/01/11", kind: "遊戲維護", icon: "b" },
];

const SETTINGS_COPY = {
  blocklist: { title: "封鎖名單", body: "目前沒有封鎖的會員。這個測試大廳不會公開其他會員的個人資料。" },
  terms: { title: "服務條款", body: "使用本服務前請確認您已符合所在地的法定年齡與相關規範。測試帳號、點數及遊戲結果僅限授權測試用途。" },
  privacy: { title: "隱私條款", body: "平台只會使用登入、會員、點數與遊戲紀錄資料來提供本服務及維護帳號安全；權杖儲存在目前裝置，不會顯示於畫面或記錄到前端日誌。" },
  rules: { title: "遊戲規章", body: "遊戲下注、派彩、免費遊戲及中斷續玩皆以伺服器正式結算結果為準。請勿重複送出下注或嘗試繞過帳號權限。" },
};

const state = {
  session: readStoredSession(),
  games: [],
  category: "全部",
  query: "",
  favorites: readFavorites(),
  currentSlide: 0,
  ...readPreferences(),
  isLobby: false,
  musicScene: "login",
  activeGame: null,
  catalogError: "",
  accessDenied: false,
  notices: [...FALLBACK_NOTICES],
  noticeMode: "公告",
  noticeKind: "全部通知",
  personalTab: "我的",
  modalKind: "",
  toastTimer: null,
  balanceTimer: null,
  lastFocus: null,
  jackpotValue: 335141310,
  personalSummary: null,
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
  if (Number.isNaN(date.getTime())) return "2026/01/11";
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

function readFavorites() {
  try {
    const values = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function persistFavorites() {
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favorites]));
}

function readPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) || "null");
    return { musicOn: stored?.musicOn !== false, soundOn: stored?.soundOn !== false };
  } catch {
    return { musicOn: true, soundOn: true };
  }
}

function persistPreferences() {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ musicOn: state.musicOn, soundOn: state.soundOn }));
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
  const tracks = { login: elements.loginMusic, lobby: elements.lobbyMusic, shop: elements.storeMusic };
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

function ribbonTabs(tabs, active, action) {
  return `<div class="ribbon-tabs">${tabs.map((tab) => `<button class="${tab === active ? "is-active" : ""}" type="button" data-modal-action="${action}" data-value="${escapeHtml(tab)}">${escapeHtml(tab)}</button>`).join("")}</div>`;
}

function updateAccount() {
  const user = state.session?.user;
  const username = user?.username || "--";
  elements.accountName.textContent = user?.displayName || username || "會員";
  elements.accountId.textContent = username;
  elements.balanceValue.textContent = formatAmount(user?.balance);
  elements.vipLevel.textContent = String(user?.vipLevel ?? 0);
}

function loginFormMarkup(captcha, message = "") {
  return `
    <img class="modal-icon" src="${uiAsset("imgs_soc/media/user_default.webp")}" alt="">
    <h1 class="modal-title" id="modalTitle">會員登入</h1>
    <p class="modal-subtitle">登入後使用獨立 Qmoney 會員點數、測試帳號權限與正式遊戲結算。</p>
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
      <p class="modal-subtitle">${escapeHtml(error.message)}。請確認 Qmoney API 已啟動後再試一次。</p>
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
  if (popupItems.length) {
    state.notices = popupItems.map((item, index) => ({
      title: String(item.content || "平台公告").split(/[\n。]/)[0].slice(0, 28) || "平台公告",
      content: String(item.content || ""),
      date: formatDate(item.createdAt),
      kind: index % 3 === 0 ? "福利通知" : "網站公告",
      icon: index % 3 === 0 ? "d" : "a",
    }));
  }
  const tickerMessages = marqueeItems.map((item) => String(item.content || "").trim()).filter(Boolean);
  elements.tickerTrack.textContent = tickerMessages.length ? tickerMessages.join("　｜　") : FALLBACK_NOTICES.slice(0, 5).map((item) => item.title).join("　｜　");
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

async function enterLobby() {
  if (!state.session) return showLoginForm();
  state.isLobby = true;
  elements.loginView.classList.remove("is-active");
  elements.lobbyView.classList.add("is-active");
  elements.lobbyView.setAttribute("aria-hidden", "false");
  elements.loginView.setAttribute("aria-hidden", "true");
  updateAccount();
  renderJackpot();
  syncMusic("lobby");
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
  let inCategory = false;
  if (state.category === "全部") inCategory = true;
  else if (state.category === "最愛") inCategory = state.favorites.has(game.id);
  else if (state.category === "電子") inCategory = game.category === "賽特" || game.category === "H5拉霸" || game.category === "MegaSlot";
  else if (state.category === "捕魚") inCategory = game.category === "捕魚";
  else if (state.category === "加密遊戲") inCategory = game.category === "MegaSlot";
  else if (state.category === "棋牌") inCategory = game.category === "棋牌";
  if (!inCategory) return false;
  if (!state.query) return true;
  return `${game.name} ${game.nameEn} ${game.provider} ${game.category}`.toLocaleLowerCase("zh-Hant").includes(state.query);
}

function renderGames() {
  const visibleGames = state.games.filter(gameMatches);
  const titles = { 全部: "熱門遊戲", 最愛: "我的最愛", 電子: "電子遊戲", 捕魚: "捕魚遊戲", 棋牌: "棋牌遊戲", 加密遊戲: "加密遊戲" };
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
    const favorite = document.createElement("button");
    favorite.className = `favorite-button${state.favorites.has(game.id) ? " is-favorite" : ""}`;
    favorite.type = "button";
    favorite.dataset.favorite = game.id;
    favorite.setAttribute("aria-label", `${state.favorites.has(game.id) ? "移除" : "加入"}${game.name}最愛`);
    favorite.textContent = state.favorites.has(game.id) ? "♥" : "♡";
    card.append(launch, favorite);
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
  target.searchParams.set("returnLabel", "錢女友遊戲大廳");
  window.setTimeout(() => window.location.assign(target), 320);
}

function toggleFavorite(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  if (state.favorites.has(gameId)) {
    state.favorites.delete(gameId);
    playSound(elements.removeFavorite);
    showToast(`已將「${game.name}」移出最愛`);
  } else {
    state.favorites.add(gameId);
    playSound(elements.addFavorite);
    showToast(`已將「${game.name}」加入最愛`);
  }
  persistFavorites();
  renderGames();
}

function renderJackpot() {
  const formatted = String(Math.max(0, Math.floor(state.jackpotValue))).padStart(9, "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  elements.jackpotDigits.replaceChildren();
  for (const [index, character] of [...formatted].entries()) {
    const image = document.createElement("img");
    image.alt = character;
    image.style.animationDelay = `${index * 22}ms`;
    if (character === ",") {
      image.src = uiAsset("imgs_soc/jackpot/jp_comma.webp");
      image.className = "is-comma";
    } else {
      image.src = uiAsset(`imgs_soc/jackpot/jp_${character}.webp`);
    }
    elements.jackpotDigits.append(image);
  }
  elements.jackpotDigits.setAttribute("aria-label", `Jackpot ${formatted}`);
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
      <button class="setting-row setting-row--button" type="button" data-modal-action="settings-page" data-value="blocklist"><span>封鎖名單</span></button>
      <button class="setting-row setting-row--button" type="button" data-modal-action="settings-page" data-value="terms"><span>服務條款</span></button>
      <button class="setting-row setting-row--button" type="button" data-modal-action="settings-page" data-value="privacy"><span>隱私條款</span></button>
      <button class="setting-row setting-row--button" type="button" data-modal-action="settings-page" data-value="rules"><span>遊戲規章</span></button>
    </div>
    <div class="settings-footer"><button class="logout-pill" type="button" data-modal-action="logout">登出</button><span class="version-copy">版本號: v1.00</span></div>`;
  setModal(sourcePopup(`<span id="modalTitle">設定</span>`, body), "source-popup");
}

function noticeIcon(item) {
  return uiAsset(`imgs_soc/icon/notic/${item.icon || "all"}.webp`);
}

function filteredNotices() {
  if (state.noticeKind === "全部通知") return state.notices;
  return state.notices.filter((item) => item.kind === state.noticeKind);
}

function showNotices(detailIndex = null) {
  state.modalKind = "notices";
  const tabs = ribbonTabs(["活動", "公告"], state.noticeMode, "notice-mode");
  if (detailIndex !== null) {
    const notice = state.notices[detailIndex];
    if (!notice) return showNotices();
    const detail = `<div class="notice-detail"><button class="back-pill" type="button" data-modal-action="notice-back">‹ 返回公告</button><h3>${escapeHtml(notice.title)}</h3><time>${escapeHtml(notice.date)}</time><p>${escapeHtml(notice.content)}</p></div>`;
    setModal(sourcePopup(tabs, detail), "source-popup");
    return;
  }
  const kinds = [
    ["全部通知", "all"],
    ["福利通知", "d"],
    ["網站公告", "a"],
    ["遊戲維護", "b"],
    ["銀行公告", "c"],
  ];
  const kindMarkup = `<div class="notice-kinds">${kinds.map(([label, icon]) => `<button class="${state.noticeKind === label ? "is-active" : ""}" type="button" data-modal-action="notice-kind" data-value="${label}"><img src="${uiAsset(`imgs_soc/icon/notic/${icon}.webp`)}" alt=""><span>${label}</span></button>`).join("")}</div>`;
  const list = filteredNotices().map((item) => {
    const index = state.notices.indexOf(item);
    return `<button class="notice-item" type="button" data-modal-action="notice-detail" data-value="${index}"><img src="${noticeIcon(item)}" alt=""><span class="notice-item-copy"><strong>${escapeHtml(item.title)}</strong><time>${escapeHtml(item.date)}</time></span><span class="notice-arrow">›</span></button>`;
  }).join("");
  const empty = `<div class="placeholder-panel"><div><img src="${uiAsset("imgs_soc/media/empty.webp")}" alt=""><p>目前沒有這個分類的公告</p></div></div>`;
  setModal(sourcePopup(tabs, `${kindMarkup}<div class="notice-list">${list || empty}</div>`), "source-popup");
}

function historyMarkup(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const rows = items.length
    ? items.map((item) => `<div class="history-row"><div><strong>${escapeHtml(item.gameId || item.type)}</strong><span>${escapeHtml(new Date(item.createdAt).toLocaleString("zh-TW"))}</span></div><div><strong class="${Number(item.profit) >= 0 ? "is-positive" : "is-negative"}">${Number(item.profit) >= 0 ? "+" : ""}${formatAmount(item.profit)}</strong><span>下注 ${formatAmount(item.betAmount)}</span></div></div>`).join("")
    : '<div class="placeholder-panel"><div><img src="/qmoney/assets/imgs_soc/media/empty.webp" alt=""><p>目前還沒有投注紀錄</p></div></div>';
  return `<div class="history-summary"><span>總有效下注<strong>${formatAmount(result?.summary?.validAmount ?? 0)}</strong></span><span>總輸贏<strong>${formatAmount(result?.summary?.net ?? 0)}</strong></span></div><div class="history-list">${rows}</div>`;
}

function personalHomeMarkup() {
  const user = state.session?.user || {};
  const username = user.username || "--";
  const nickname = user.displayName || username;
  const summary = state.personalSummary?.summary || {};
  const validAmount = Math.max(0, Number(summary.validAmount || 0));
  const target = 3000;
  const progress = Math.min(100, (validAmount / target) * 100);
  return `
    <div class="personal-profile">
      <div class="personal-avatar"><img src="${uiAsset("imgs_soc/media/user_default.webp")}" alt="會員頭像"></div>
      <div class="personal-name"><small>暱稱</small><strong>${escapeHtml(nickname)}</strong><span>${escapeHtml(username)}</span><div class="personal-mini-actions"><button type="button" data-modal-action="profile-hint">♻ 改暱稱</button><button type="button" data-modal-action="notices">📣 大聲公</button></div></div>
    </div>
    <div class="personal-actions"><button type="button" data-modal-action="share">⌯ 分享連結</button><button type="button" data-modal-action="personal-history">▣ 遊戲紀錄</button></div>
    <div class="personal-signature">歡迎來到錢女友遊戲大廳</div>
    <div class="vip-card">
      <div class="vip-medal"><img src="${uiAsset("imgs_soc/vip/lv0.webp")}" alt="VIP 0"><strong>VIP Level 0</strong></div>
      <div class="vip-info"><div class="vip-info-row"><span>會員帳號</span><strong>${escapeHtml(username)}</strong></div><div class="vip-info-row"><span>會員餘額</span><strong>${formatAmount(user.balance)}</strong></div><div class="vip-info-row"><span>手機認證</span><strong>測試帳號</strong></div><div class="vip-info-row"><span>介紹人</span><strong>錢女友SEO</strong></div></div>
    </div>
    <div class="task-card"><div class="task-title"><span><img src="${uiAsset("imgs_soc/personal/9584568 1.png")}" alt="">投注任務</span><b class="task-state">${progress >= 100 ? "已達標" : "未達標"}</b></div><div class="task-line"><span>本週已投注</span><strong>${formatAmount(validAmount)} / ${target.toLocaleString("zh-TW")}</strong></div><div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div><div class="task-line"><span>達標獎勵</span><strong>🪙 8</strong></div></div>`;
}

function personalPlaceholder(tab) {
  const copy = tab === "信箱" ? ["icon/message.webp", "目前沒有新訊息"] : ["icon/user-lock.webp", "好友功能目前僅供測試帳號使用"];
  return `<div class="placeholder-panel"><div><img src="${uiAsset(`imgs_soc/${copy[0]}`)}" alt=""><p>${copy[1]}</p></div></div>`;
}

function renderPersonal() {
  const tabs = ribbonTabs(["我的", "存摺", "信箱", "好友"], state.personalTab, "personal-tab");
  let body = personalHomeMarkup();
  if (state.personalTab === "存摺") body = state.personalSummary ? historyMarkup(state.personalSummary) : '<div class="placeholder-panel"><div><img src="/qmoney/assets/imgs_soc/media/loading.gif" alt=""><p>正在載入投注紀錄</p></div></div>';
  else if (state.personalTab === "信箱" || state.personalTab === "好友") body = personalPlaceholder(state.personalTab);
  setModal(sourcePopup(tabs, body), "source-popup");
}

async function showPersonal(tab = "我的") {
  state.modalKind = "personal";
  state.personalTab = tab;
  renderPersonal();
  if (!state.personalSummary) {
    try {
      state.personalSummary = await apiRequest("/wallet/transactions?limit=20");
      if (state.modalKind === "personal") renderPersonal();
    } catch {
      state.personalSummary = { items: [], summary: { validAmount: 0, net: 0 } };
      if (state.modalKind === "personal") renderPersonal();
    }
  }
}

function showSimplePopup(title, icon, message, musicScene = "lobby") {
  state.modalKind = "simple";
  syncMusic(musicScene);
  const body = `<div class="placeholder-panel"><div><img src="${uiAsset(icon)}" alt=""><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div></div>`;
  setModal(sourcePopup(`<span id="modalTitle">${escapeHtml(title)}</span>`, body), "source-popup");
}

async function shareLobby() {
  const shareData = { title: "錢女友遊戲大廳", text: "錢女友遊戲大廳", url: window.location.href };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(window.location.href);
      showToast("分享連結已複製");
    }
  } catch {
    // User cancellation is not an error that needs UI.
  }
}

function setSlide(index) {
  state.currentSlide = (index + elements.heroSlides.length) % elements.heroSlides.length;
  elements.heroSlides.forEach((slide, i) => slide.classList.toggle("is-active", i === state.currentSlide));
  elements.carouselDots.forEach((dot, i) => dot.classList.toggle("is-active", i === state.currentSlide));
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
  else if (action === "settings-page") showSettings(value);
  else if (action === "settings-back") showSettings();
  else if (action === "notice-mode") { state.noticeMode = value; showNotices(); }
  else if (action === "notice-kind") { state.noticeKind = value; showNotices(); }
  else if (action === "notice-detail") showNotices(Number(value));
  else if (action === "notice-back" || action === "notices") showNotices();
  else if (action === "personal-tab") void showPersonal(value);
  else if (action === "personal-history") void showPersonal("存摺");
  else if (action === "share") void shareLobby();
  else if (action === "profile-hint") showToast("暱稱修改由代理後台管理");
  else if (action === "close") closeModal();
});

elements.categoryTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-category]");
  if (tab) { playSound(elements.clickTab); selectCategory(tab.dataset.category); }
});

elements.providerStrip.addEventListener("click", (event) => {
  const provider = event.target.closest("[data-provider-category]");
  if (!provider) return;
  playSound(elements.clickTab);
  for (const button of elements.providerStrip.querySelectorAll("button")) button.classList.toggle("is-active", button === provider);
  provider.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  selectCategory(provider.dataset.providerCategory);
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
  const favorite = event.target.closest("[data-favorite]");
  if (favorite) return toggleFavorite(favorite.dataset.favorite);
  const launch = event.target.closest("[data-game]");
  if (launch) showGame(launch.dataset.game);
});

elements.carouselDots.forEach((dot) => dot.addEventListener("click", () => setSlide(Number(dot.dataset.slide))));
elements.heroSlides.forEach((slide) => slide.addEventListener("click", showNotices));

elements.lobbyView.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  playSound(elements.clickTab);
  const action = button.dataset.action;
  if (action === "settings") showSettings();
  else if (action === "profile") void showPersonal();
  else if (action === "notices") showNotices();
  else if (action === "jackpot") showSimplePopup("幸運彩池", "imgs_soc/jackpot/character.png", "Jackpot 數字會持續更新；遊戲派彩仍以各遊戲伺服器結算為準。", "lobby");
  else if (action === "check-in") { playSound(elements.getReward); showSimplePopup("每日簽到", "imgs_soc/media/CheckIn.webp", "簽到與任務獎勵將依管理端活動設定開放。", "lobby"); }
  else if (action === "refresh-balance") void refreshBalance();
  else if (action === "scroll-top") elements.lobbyScroll.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-footer]");
  if (!button) return;
  playSound(elements.clickFooter);
  for (const item of document.querySelectorAll(".bottom-nav button")) item.classList.toggle("is-active", item === button);
  const action = button.dataset.footer;
  if (action === "其他") { syncMusic("lobby"); selectCategory("全部"); elements.lobbyScroll.scrollTo({ top: 0, behavior: "smooth" }); }
  else if (action === "排行榜") showSimplePopup("排行榜", "imgs_soc/ranking/1.webp", "排行榜將依有效投注與活動期間結果顯示。", "lobby");
  else if (action === "商城") showSimplePopup("商城", "imgs_soc/footer/store.webp", "會員商城與兌換內容由獨立 Qmoney 後台管理。", "shop");
  else if (action === "贈禮") showSimplePopup("贈禮", "imgs_soc/gift.webp", "贈禮功能將依測試活動設定開放。", "lobby");
  else if (action === "公會") showSimplePopup("公會", "imgs_soc/footer/guild.webp", "公會功能目前尚未建立會員資料。", "lobby");
});

document.querySelector("#lineLogin").addEventListener("click", () => void showLoginForm());
document.querySelector("#webLogin").addEventListener("click", () => void showLoginForm());
document.addEventListener("pointerdown", () => syncMusic(state.isLobby ? "lobby" : "login"), { once: true, capture: true });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
window.addEventListener("pageshow", () => {
  elements.loadingOverlay.hidden = true;
  if (state.isLobby) void refreshBalance(true);
});
window.addEventListener("storage", (event) => {
  if (event.key !== AUTH_STORAGE_KEY) return;
  state.session = readStoredSession();
  if (!state.session) showLoginView();
  else if (state.isLobby) { updateAccount(); void refreshBalance(true); }
});

window.setInterval(() => { if (state.isLobby && elements.modalBackdrop.hidden) setSlide(state.currentSlide + 1); }, 4_800);
window.setInterval(() => {
  if (!state.isLobby || document.visibilityState !== "visible") return;
  state.jackpotValue += Math.floor(Math.random() * 700) + 12;
  renderJackpot();
}, 4_200);

async function bootstrap() {
  renderJackpot();
  if (!state.session) return showLoginView();
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
