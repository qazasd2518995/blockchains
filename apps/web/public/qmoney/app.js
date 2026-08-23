const UI_ASSET_BASE = "/qmoney/assets/";
const CONFIGURED_API_ORIGIN = String(window.__QMONEY_CONFIG__?.apiOrigin || "").replace(/\/$/, "");
const API_BASE = `${CONFIGURED_API_ORIGIN}/api`;
const AUTH_STORAGE_KEY = "bg-auth";
const FAVORITES_STORAGE_KEY = "qmoney-new-casino-favorites";
const RETURN_PATH = "/qmoney/";

const elements = {
  loginView: document.querySelector("#loginView"),
  lobbyView: document.querySelector("#lobbyView"),
  lobbyScroll: document.querySelector("#lobbyScroll"),
  categoryTabs: document.querySelector("#categoryTabs"),
  gameGrid: document.querySelector("#gameGrid"),
  gameSearch: document.querySelector("#gameSearch"),
  gamesTitle: document.querySelector("#gamesTitle"),
  emptyState: document.querySelector("#emptyState"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  modalCard: document.querySelector("#modalCard"),
  modalContent: document.querySelector("#modalContent"),
  modalClose: document.querySelector("#modalClose"),
  toast: document.querySelector("#toast"),
  accountName: document.querySelector("#accountName"),
  balanceValue: document.querySelector("#balanceValue"),
  jackpotValue: document.querySelector("#jackpotValue"),
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
};

const state = {
  session: readStoredSession(),
  games: [],
  category: "首頁",
  query: "",
  favorites: readFavorites(),
  currentSlide: 0,
  musicOn: true,
  soundOn: true,
  isLobby: false,
  musicScene: "login",
  activeGame: null,
  catalogError: "",
  toastTimer: null,
  balanceTimer: null,
  lastFocus: null,
};

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
  return amount.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function readStoredSession() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    const session = stored?.state;
    if (!session?.user || !session?.accessToken || !session?.refreshToken) return null;
    return {
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
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

async function refreshTokens() {
  if (!state.session?.refreshToken) throw new Error("登入已過期");
  const tokens = await rawRequest("/auth/refresh", {
    method: "POST",
    body: { refreshToken: state.session.refreshToken },
  });
  persistSession({ ...state.session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
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
      try {
        await refreshTokens();
        return await apiRequest(path, options, true);
      } catch {
        signOut(false);
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
    // Browsers may block decorative audio before the first interaction.
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
  window.requestAnimationFrame(() => elements.modalClose.focus());
}

function closeModal() {
  if (elements.modalBackdrop.hidden) return;
  elements.modalBackdrop.hidden = true;
  elements.modalContent.replaceChildren();
  elements.modalCard.className = "modal-card";
  if (state.lastFocus instanceof HTMLElement) state.lastFocus.focus();
}

function updateAccount() {
  const user = state.session?.user;
  elements.accountName.textContent = user?.displayName || user?.username || "會員";
  elements.balanceValue.textContent = formatAmount(user?.balance);
}

function loginFormMarkup(captcha, message = "") {
  return `
    <img class="modal-icon" src="${uiAsset("imgs_soc/media/user_default.webp")}" alt="">
    <h1 class="modal-title" id="modalTitle">會員登入</h1>
    <p class="modal-subtitle">登入後會直接使用平台的真實點數、測試帳號權限與遊戲結算。</p>
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
      <p class="modal-subtitle">${escapeHtml(error.message)}。請確認平台 API 已啟動後再試一次。</p>
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
  try {
    const result = await apiRequest("/games/catalog");
    state.games = Array.isArray(result.games) ? result.games : [];
  } catch (error) {
    state.games = [];
    state.catalogError = error.message;
  }
  updateCategoryAvailability();
  renderGames();
}

async function refreshBalance(quiet = false) {
  if (!state.session) return;
  try {
    const result = await apiRequest("/wallet/balance");
    persistSession({ ...state.session, user: { ...state.session.user, balance: result.balance } });
    updateAccount();
    elements.jackpotValue.textContent = "系統正常";
    if (!quiet) showToast("點數已更新");
  } catch (error) {
    elements.jackpotValue.textContent = "連線異常";
    if (!quiet) showToast(error.message);
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
  syncMusic("lobby");
  await Promise.all([loadCatalog(), refreshBalance(true)]);
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
  const inCategory = state.category === "首頁" ? game.featured : game.category === state.category;
  if (!inCategory) return false;
  if (!state.query) return true;
  return `${game.name} ${game.nameEn} ${game.provider} ${game.category}`.toLocaleLowerCase("zh-Hant").includes(state.query);
}

function updateCategoryAvailability() {
  for (const tab of elements.categoryTabs.querySelectorAll("[data-category]")) {
    const category = tab.dataset.category;
    tab.hidden = category !== "首頁" && !state.games.some((game) => game.category === category);
  }
  const currentTab = elements.categoryTabs.querySelector(`[data-category="${CSS.escape(state.category)}"]`);
  if (!currentTab || currentTab.hidden) state.category = "首頁";
}

function renderGames() {
  const visibleGames = state.games.filter(gameMatches);
  elements.gamesTitle.textContent = state.category === "首頁" ? "熱門推薦" : state.category;
  elements.gameGrid.replaceChildren();
  for (const [index, game] of visibleGames.entries()) {
    const card = document.createElement("article");
    card.className = "game-card";
    card.style.animationDelay = `${Math.min(index * 28, 240)}ms`;
    const launch = document.createElement("button");
    launch.className = "game-launch";
    launch.type = "button";
    launch.dataset.game = game.id;
    launch.setAttribute("aria-label", `開啟 ${game.name}`);
    launch.innerHTML = `
      <div class="game-card-image">${game.badge ? `<span class="game-badge">${escapeHtml(game.badge)}</span>` : ""}<img src="${escapeHtml(game.cover)}" alt="${escapeHtml(game.name)}" loading="lazy"></div>
      <div class="game-card-copy"><div class="game-card-text"><span class="game-card-title">${escapeHtml(game.name)}</span><span class="game-card-provider">${escapeHtml(game.provider)}</span></div></div>`;
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
  elements.emptyState.textContent = state.catalogError
    ? `遊戲目錄載入失敗：${state.catalogError}`
    : state.games.length === 0
      ? "這個帳號目前沒有已開放的新遊戲"
      : "找不到符合條件的遊戲";
}

function selectCategory(category) {
  state.category = category;
  for (const tab of elements.categoryTabs.querySelectorAll(".category-tab")) tab.classList.toggle("is-active", tab.dataset.category === category);
  elements.lobbyScroll.scrollTo({ top: 0, behavior: "smooth" });
  renderGames();
}

function showGame(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  state.activeGame = game;
  playSound(elements.clickGame);
  setModal(`
    <div class="game-modal-cover"><img src="${escapeHtml(game.cover)}" alt="${escapeHtml(game.name)}"><div class="game-modal-cover-copy"><span>${escapeHtml(game.provider)}</span><h2 id="modalTitle">${escapeHtml(game.name)}</h2></div></div>
    <div class="game-modal-body"><p>遊戲會使用目前會員的真實點數與同一套後端控制、結算及斷線續玩機制。</p><button class="modal-button modal-button--pink" type="button" data-modal-action="launch-game"><span>開始遊戲</span></button></div>`,
    "modal-card--game",
  );
}

function launchActiveGame() {
  const game = state.activeGame;
  if (!game || !state.session) return;
  if (typeof game.route !== "string" || !game.route.startsWith("/games/")) return showToast("遊戲啟動路徑無效");
  closeModal();
  elements.loadingGameName.textContent = `正在啟動 ${game.name}`;
  elements.loadingImage.src = `${uiAsset("imgs_soc/media/loading.gif")}?run=${Date.now()}`;
  elements.loadingOverlay.hidden = false;
  const target = new URL(game.route, window.location.origin);
  target.searchParams.set("returnTo", RETURN_PATH);
  target.searchParams.set("returnLabel", "Qmoney 遊戲大廳");
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

function showSettings() {
  const user = state.session?.user;
  setModal(`
    <img class="modal-icon" src="${uiAsset("imgs_soc/media/setting.svg")}" alt=""><h2 class="modal-title" id="modalTitle">大廳設定</h2>
    <div class="settings-list"><div class="setting-row"><span>會員</span><strong>${escapeHtml(user?.username || "--")}</strong></div><div class="setting-row"><span>後端狀態</span><strong class="connection-ok">已連線</strong></div><div class="setting-row"><span>背景音樂</span><button class="toggle${state.musicOn ? " is-on" : ""}" type="button" data-modal-action="toggle-music" aria-label="切換背景音樂"></button></div><div class="setting-row"><span>遊戲音效</span><button class="toggle${state.soundOn ? " is-on" : ""}" type="button" data-modal-action="toggle-sound" aria-label="切換遊戲音效"></button></div></div>
    <button class="modal-button" type="button" data-modal-action="logout"><span>登出會員</span></button>`);
}

async function showHistory() {
  setModal(`<img class="modal-icon" src="${uiAsset("imgs_soc/media/loading.gif")}" alt=""><h2 class="modal-title" id="modalTitle">正在載入投注紀錄</h2>`);
  try {
    const result = await apiRequest("/wallet/transactions?limit=20");
    const rows = result.items.length
      ? result.items.map((item) => `<div class="history-row"><div><strong>${escapeHtml(item.gameId || item.type)}</strong><span>${escapeHtml(new Date(item.createdAt).toLocaleString("zh-TW"))}</span></div><div><strong class="${Number(item.profit) >= 0 ? "is-positive" : "is-negative"}">${Number(item.profit) >= 0 ? "+" : ""}${formatAmount(item.profit)}</strong><span>下注 ${formatAmount(item.betAmount)}</span></div></div>`).join("")
      : '<p class="modal-subtitle">目前還沒有投注紀錄。</p>';
    elements.modalContent.innerHTML = `<h2 class="modal-title" id="modalTitle">投注紀錄</h2><div class="history-summary"><span>總有效下注 <strong>${formatAmount(result.summary.validAmount)}</strong></span><span>總輸贏 <strong>${formatAmount(result.summary.net)}</strong></span></div><div class="history-list">${rows}</div>`;
  } catch (error) {
    elements.modalContent.innerHTML = `<h2 class="modal-title" id="modalTitle">紀錄載入失敗</h2><p class="modal-subtitle">${escapeHtml(error.message)}</p>`;
  }
}

function showPlatformStatus() {
  setModal(`<h2 class="modal-title" id="modalTitle">平台已連線</h2><p class="modal-subtitle">新大廳、會員點數、控制系統與所有新遊戲共用同一套後端。遊戲權限會依目前會員帳號即時過濾。</p><button class="modal-button" type="button" data-modal-action="close"><span>我知道了</span></button>`);
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
  if (action === "launch-game") launchActiveGame();
  else if (action === "retry-login") void showLoginForm();
  else if (action === "toggle-music") { state.musicOn = !state.musicOn; control.classList.toggle("is-on", state.musicOn); syncMusic(); }
  else if (action === "toggle-sound") { state.soundOn = !state.soundOn; control.classList.toggle("is-on", state.soundOn); }
  else if (action === "logout") void signOut();
  else if (action === "close") closeModal();
});
elements.categoryTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-category]");
  if (tab) { playSound(elements.clickTab); selectCategory(tab.dataset.category); }
});
elements.gameSearch.addEventListener("input", (event) => { state.query = event.target.value.trim().toLocaleLowerCase("zh-Hant"); renderGames(); });
elements.gameGrid.addEventListener("click", (event) => {
  const favorite = event.target.closest("[data-favorite]");
  if (favorite) return toggleFavorite(favorite.dataset.favorite);
  const launch = event.target.closest("[data-game]");
  if (launch) showGame(launch.dataset.game);
});
elements.carouselDots.forEach((dot) => dot.addEventListener("click", () => setSlide(Number(dot.dataset.slide))));
elements.heroSlides.forEach((slide) => slide.addEventListener("click", showPlatformStatus));
elements.lobbyView.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  playSound(elements.clickTab);
  const action = button.dataset.action;
  if (action === "settings" || action === "profile") showSettings();
  else if (action === "history") void showHistory();
  else if (action === "all-games") selectCategory("H5拉霸");
  else if (action === "jackpot") showPlatformStatus();
  else if (action === "refresh-balance") void refreshBalance();
});
document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-footer]");
  if (!button) return;
  playSound(elements.clickFooter);
  const action = button.dataset.footer;
  if (action === "遊戲") selectCategory("首頁");
  else if (action === "紀錄") void showHistory();
  else if (action === "點數") void refreshBalance();
  else if (action === "設定") showSettings();
  else if (action === "登出") void signOut();
});
document.querySelector("#lineLogin").addEventListener("click", () => void showLoginForm());
document.querySelector("#webLogin").addEventListener("click", () => void showLoginForm());
document.addEventListener("pointerdown", () => syncMusic(state.isLobby ? "lobby" : "login"), { once: true, capture: true });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
window.addEventListener("pageshow", () => { if (state.isLobby) void refreshBalance(true); });
window.addEventListener("storage", (event) => {
  if (event.key !== AUTH_STORAGE_KEY) return;
  state.session = readStoredSession();
  if (!state.session) showLoginView();
  else if (state.isLobby) { updateAccount(); void refreshBalance(true); }
});
window.setInterval(() => { if (state.isLobby && elements.modalBackdrop.hidden) setSlide(state.currentSlide + 1); }, 4_800);

async function bootstrap() {
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
