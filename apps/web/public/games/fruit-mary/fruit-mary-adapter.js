(function () {
  'use strict';

  var NativeXHR = window.XMLHttpRequest;
  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || (window.location.origin + '/api')).replace(/\/$/, '');
  var gameApi = apiBase + '/games/fruit-mary';
  var requestTimeoutMs = 15000;
  var refreshInFlight = null;
  var settlementInFlight = false;
  var FRUIT_MARY_SPIN_PAUSE_MS = 650;
  var nextFruitMarySpinAt = 0;
  var fruitMaryCooldownTimer = 0;
  var animationGuardAttempts = 0;
  var animationCompletionTimeoutMs = 45000;
  // The archived type-9 (miss) presentation completes through an audio
  // callback. Some Android WebViews never deliver that callback after the
  // wheel has visibly stopped, leaving every control disabled. The wheel
  // itself completes in under five seconds, so this narrower watchdog can
  // safely release only that presentation without shortening large-prize
  // animations.
  var missAnimationCompletionTimeoutMs = 12000;
  var audioCompletionTimeoutMs = 7000;
  var allocationEditorId = 'fruit-mary-allocation-editor';
  var fruitMaryDenomination = 10;
  var fruitMaryMinimumBet = 10;
  var fruitMaryMaximumBet = 5000;
  var fruitMaryLastLimitNoticeAt = 0;
  var gameDisposing = false;
  var gameCanvasContextLost = false;
  var renderFailureReported = false;
  var sourceReadyAt = 0;

  function parentStorage() {
    try {
      return window.parent.localStorage;
    } catch (_error) {
      return window.localStorage;
    }
  }

  function readAuth() {
    try {
      var raw = parentStorage().getItem('bg-auth');
      var saved = raw ? JSON.parse(raw) : null;
      return saved && saved.state ? saved.state : {};
    } catch (_error) {
      return {};
    }
  }

  function notifyParent(type, payload) {
    try {
      window.parent.postMessage(Object.assign({ type: type }, payload || {}), window.location.origin);
    } catch (_error) {
      // The Cocos client can continue even if it is opened outside the platform shell.
    }
  }

  function publicRenderError(error) {
    var message = error && error.message ? error.message : String(error || '遊戲畫面中斷');
    if (/webgl|context|getParameter|getExtension/i.test(message)) {
      return '遊戲畫面無法建立，請關閉其他遊戲頁面後重新載入';
    }
    return message.length > 180 ? message.slice(0, 180) : message;
  }

  function reportFatalRenderFailure(stage, error) {
    if (gameDisposing || renderFailureReported) return false;
    renderFailureReported = true;
    notifyParent('fruit-mary:fatal', {
      stage: stage,
      message: publicRenderError(error),
    });
    return true;
  }

  function bindGameCanvasRecovery() {
    if (typeof document === 'undefined') return false;
    var canvas = document.getElementById('GameCanvas');
    if (!canvas || canvas.__yachiyoRecoveryBound) return false;
    canvas.__yachiyoRecoveryBound = true;
    canvas.addEventListener('webglcontextcreationerror', function (event) {
      gameCanvasContextLost = true;
      reportFatalRenderFailure(
        'webgl-context-creation',
        new Error((event && event.statusMessage) || '無法建立遊戲畫面'),
      );
    });
    canvas.addEventListener('webglcontextlost', function (event) {
      gameCanvasContextLost = true;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      reportFatalRenderFailure('webgl-context-lost', new Error('遊戲畫面已中斷'));
    });
    canvas.addEventListener('webglcontextrestored', function () {
      gameCanvasContextLost = false;
    });
    return true;
  }

  function disposeGameForRemount() {
    if (gameDisposing) return false;
    gameDisposing = true;
    settlementInFlight = false;
    if (fruitMaryCooldownTimer) {
      window.clearTimeout(fruitMaryCooldownTimer);
      fruitMaryCooldownTimer = 0;
    }
    try {
      if (window.cc && window.cc.find && window.cc.find('Canvas')) {
        var canvasNode = window.cc.find('Canvas');
        var menuLogic = canvasNode.getComponent && canvasNode.getComponent('MenuLogic');
        var playLogic = canvasNode.getComponent && canvasNode.getComponent('PlayLogic');
        if (menuLogic && typeof menuLogic.clickCancelAuto === 'function') {
          menuLogic.clickCancelAuto();
        }
        if (playLogic && playLogic.__yachiyoAnimationTimer) {
          window.clearTimeout(playLogic.__yachiyoAnimationTimer);
          playLogic.__yachiyoAnimationTimer = null;
        }
      }
      if (window.cc && window.cc.audioEngine && typeof window.cc.audioEngine.stopAll === 'function') {
        window.cc.audioEngine.stopAll();
      }
      if (window.cc && window.cc.game && typeof window.cc.game.pause === 'function') {
        window.cc.game.pause();
      }
      if (window.cc && window.cc.director && typeof window.cc.director.pause === 'function') {
        window.cc.director.pause();
      }
    } catch (_error) {}
    try {
      var canvas = typeof document !== 'undefined' && document.getElementById('GameCanvas');
      var context =
        canvas &&
        (canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl'));
      var loseContext = context && context.getExtension('WEBGL_lose_context');
      if (loseContext && typeof loseContext.loseContext === 'function') loseContext.loseContext();
    } catch (_error) {}
    window.setTimeout(function () {
      notifyParent('fruit-mary:disposed');
    }, 0);
    return true;
  }

  function addWindowListener(type, listener) {
    if (typeof window.addEventListener === 'function') window.addEventListener(type, listener);
  }

  function writeTokens(accessToken, refreshToken) {
    try {
      var storage = parentStorage();
      var raw = storage.getItem('bg-auth');
      var saved = raw ? JSON.parse(raw) : { state: {}, version: 0 };
      saved.state = saved.state || {};
      saved.state.accessToken = accessToken;
      saved.state.refreshToken = refreshToken;
      storage.setItem('bg-auth', JSON.stringify(saved));
    } catch (_error) {
      // Parent receives the same values through postMessage below.
    }
    notifyParent('fruit-mary:tokens', {
      accessToken: accessToken,
      refreshToken: refreshToken,
    });
  }

  function refreshAccessToken() {
    if (refreshInFlight) return refreshInFlight;
    var auth = readAuth();
    if (!auth.refreshToken) return Promise.reject(new Error('登入已過期，請回到大廳重新登入'));
    var attemptedRefreshToken = auth.refreshToken;
    refreshInFlight = fetch(apiBase + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: attemptedRefreshToken }),
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok || !body.accessToken || !body.refreshToken) {
            var latest = readAuth();
            if (
              latest.accessToken &&
              latest.refreshToken &&
              latest.refreshToken !== attemptedRefreshToken
            ) {
              return latest.accessToken;
            }
            throw new Error(body.message || '登入已過期，請回到大廳重新登入');
          }
          writeTokens(body.accessToken, body.refreshToken);
          return body.accessToken;
        });
      })
      .finally(function () {
        refreshInFlight = null;
      });
    return refreshInFlight;
  }

  function authorizedRequest(url, method, body, retried, keepalive) {
    var auth = readAuth();
    if (!auth.accessToken) {
      if (!retried && auth.refreshToken) {
        return refreshAccessToken().then(function () {
          return authorizedRequest(url, method, body, true, keepalive);
        });
      }
      return Promise.reject(new Error('找不到登入憑證，請回到大廳重新登入'));
    }
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = window.setTimeout(function () {
      if (controller) controller.abort();
    }, requestTimeoutMs);
    return fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + auth.accessToken,
      },
      body: method === 'GET' ? undefined : body || '{}',
      signal: controller ? controller.signal : undefined,
      keepalive: Boolean(keepalive),
    }).then(function (response) {
      if (response.status === 401 && !retried) {
        return refreshAccessToken().then(function () {
          return authorizedRequest(url, method, body, true, keepalive);
        });
      }
      return response.json().then(function (payload) {
        if (!response.ok) throw new Error(payload.message || payload.error || '遊戲伺服器拒絕請求');
        return payload;
      });
    }).catch(function (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('遊戲伺服器回應逾時，請稍後重試');
      }
      throw error;
    }).finally(function () {
      window.clearTimeout(timeout);
    });
  }

  function routeFor(rawUrl) {
    var parsed;
    try {
      parsed = new URL(rawUrl, window.location.href);
    } catch (_error) {
      return null;
    }
    var path = parsed.pathname;
    if (path.endsWith('/api/user/user/show')) return { method: 'GET', url: gameApi + '/session', kind: 'session' };
    if (path.endsWith('/api/game/room/show')) {
      return { method: 'GET', url: gameApi + '/room', kind: 'room' };
    }
    if (/\/api\/game\/play\/(start|stop|coin|inGold)$/.test(path)) {
      return { method: 'POST', url: gameApi + '/noop' };
    }
    if (path.endsWith('/index/login/auth_login')) {
      return { method: 'POST', url: gameApi + '/authorize' };
    }
    if (path.endsWith('/index/game/get_gift')) {
      return { method: 'POST', url: gameApi + '/spin', kind: 'settlement' };
    }
    if (path.endsWith('/index/game/size')) {
      return { method: 'POST', url: gameApi + '/gamble', kind: 'settlement' };
    }
    if (path.endsWith('/index/game/gamelog')) {
      return { method: 'POST', url: gameApi + '/history' };
    }
    if (
      /\/index\/(game\/(money|money_log|distribution)|kalman\/|login\/(register|modify|answer|user_pwd))/.test(
        path,
      )
    ) {
      return { method: 'POST', url: gameApi + '/disabled' };
    }
    return null;
  }

  function BridgeXHR() {
    this._native = null;
    this._route = null;
    this._listeners = {};
    this._headers = {};
    this._readyState = 0;
    this._status = 0;
    this._statusText = '';
    this._responseText = '';
    this._response = '';
    this._responseType = '';
    this._timeout = 0;
    this._withCredentials = false;
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.ontimeout = null;
    this.onabort = null;
    this.onloadstart = null;
    this.onloadend = null;
    this.onprogress = null;
    this.upload = {};
  }

  BridgeXHR.UNSENT = 0;
  BridgeXHR.OPENED = 1;
  BridgeXHR.HEADERS_RECEIVED = 2;
  BridgeXHR.LOADING = 3;
  BridgeXHR.DONE = 4;

  BridgeXHR.prototype.open = function (method, url, async, user, password) {
    this._route = routeFor(url);
    if (!this._route) {
      this._native = new NativeXHR();
      wireNative(this);
      this._native.open(method, url, async !== false, user, password);
      return;
    }
    this._readyState = BridgeXHR.OPENED;
    this._dispatch('readystatechange');
  };

  BridgeXHR.prototype.send = function (body) {
    if (this._native) {
      this._native.send(body);
      return;
    }
    var bridge = this;
    var route = this._route;
    this._dispatch('loadstart');
    if (route.kind === 'settlement' && settlementInFlight) {
      window.setTimeout(function () {
        bridge._complete({
          code: 0,
          msg: '本輪仍在結算，請稍候',
          message: '本輪仍在結算，請稍候',
        });
      }, 0);
      return;
    }
    var ownsSettlement = route.kind === 'settlement';
    if (ownsSettlement) {
      settlementInFlight = true;
      notifyParent('fruit-mary:busy', { busy: true });
    }
    authorizedRequest(route.url, route.method, body, false, ownsSettlement)
      .then(function (payload) {
        if (route.kind === 'room' && payload.data) {
          updateFruitMaryBetLimits(payload.data);
        }
        if (route.kind === 'session' && payload.data && payload.data.info) {
          renderFailureReported = false;
          sourceReadyAt = Date.now();
          notifyParent('fruit-mary:ready', { balance: Number(payload.data.info.gold || 0) });
        }
        if (route.kind === 'settlement' && payload.balance !== undefined) {
          nextFruitMarySpinAt = Date.now() + FRUIT_MARY_SPIN_PAUSE_MS;
          if (fruitMaryCooldownTimer) window.clearTimeout(fruitMaryCooldownTimer);
          fruitMaryCooldownTimer = window.setTimeout(function () {
            fruitMaryCooldownTimer = 0;
            applyFruitMaryRuntimeGuards();
          }, FRUIT_MARY_SPIN_PAUSE_MS);
          notifyParent('fruit-mary:balance', { balance: Number(payload.balance) });
        }
        bridge._complete(payload);
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '遊戲伺服器連線失敗';
        recoverFruitMaryRequestState();
        notifyParent('fruit-mary:error', { message: message });
        bridge._complete({ code: 0, msg: message, message: message });
      })
      .finally(function () {
        if (ownsSettlement) {
          settlementInFlight = false;
          notifyParent('fruit-mary:busy', { busy: false });
        }
      });
  };

  BridgeXHR.prototype._complete = function (payload) {
    this._status = 200;
    this._statusText = 'OK';
    this._responseText = JSON.stringify(payload);
    this._response = this._responseType === 'json' ? payload : this._responseText;
    this._readyState = BridgeXHR.DONE;
    this._dispatch('readystatechange');
    this._dispatch('load');
    this._dispatch('loadend');
  };

  BridgeXHR.prototype.abort = function () {
    if (this._native) this._native.abort();
    else {
      this._readyState = BridgeXHR.UNSENT;
      this._dispatch('abort');
      this._dispatch('loadend');
    }
  };

  BridgeXHR.prototype.setRequestHeader = function (name, value) {
    if (this._native) this._native.setRequestHeader(name, value);
    else this._headers[String(name).toLowerCase()] = String(value);
  };
  BridgeXHR.prototype.getResponseHeader = function (name) {
    return this._native ? this._native.getResponseHeader(name) : name.toLowerCase() === 'content-type' ? 'application/json' : null;
  };
  BridgeXHR.prototype.getAllResponseHeaders = function () {
    return this._native ? this._native.getAllResponseHeaders() : 'content-type: application/json\r\n';
  };
  BridgeXHR.prototype.overrideMimeType = function (mime) {
    if (this._native && this._native.overrideMimeType) this._native.overrideMimeType(mime);
  };
  BridgeXHR.prototype.addEventListener = function (type, listener) {
    (this._listeners[type] || (this._listeners[type] = [])).push(listener);
  };
  BridgeXHR.prototype.removeEventListener = function (type, listener) {
    var listeners = this._listeners[type] || [];
    this._listeners[type] = listeners.filter(function (candidate) { return candidate !== listener; });
  };
  BridgeXHR.prototype._dispatch = function (type, nativeEvent) {
    var event = nativeEvent || { type: type, target: this, currentTarget: this };
    var handler = this['on' + type];
    if (typeof handler === 'function') handler.call(this, event);
    (this._listeners[type] || []).slice().forEach(function (listener) {
      listener.call(this, event);
    }, this);
  };

  function wireNative(bridge) {
    [
      'readystatechange',
      'load',
      'error',
      'timeout',
      'abort',
      'loadstart',
      'loadend',
      'progress',
    ].forEach(function (type) {
      bridge._native.addEventListener(type, function (event) {
        bridge._dispatch(type, event);
      });
    });
    bridge._native.responseType = bridge._responseType;
    bridge._native.timeout = bridge._timeout;
    bridge._native.withCredentials = bridge._withCredentials;
  }

  function nativeOr(bridge, nativeKey, localKey) {
    return bridge._native ? bridge._native[nativeKey] : bridge[localKey];
  }

  Object.defineProperties(BridgeXHR.prototype, {
    readyState: { get: function () { return nativeOr(this, 'readyState', '_readyState'); } },
    status: { get: function () { return nativeOr(this, 'status', '_status'); } },
    statusText: { get: function () { return nativeOr(this, 'statusText', '_statusText'); } },
    responseText: { get: function () { return nativeOr(this, 'responseText', '_responseText'); } },
    response: { get: function () { return nativeOr(this, 'response', '_response'); } },
    responseURL: { get: function () { return this._native ? this._native.responseURL : (this._route ? this._route.url : ''); } },
    responseXML: { get: function () { return this._native ? this._native.responseXML : null; } },
    responseType: {
      get: function () { return this._native ? this._native.responseType : this._responseType; },
      set: function (value) { this._responseType = value; if (this._native) this._native.responseType = value; },
    },
    timeout: {
      get: function () { return this._native ? this._native.timeout : this._timeout; },
      set: function (value) { this._timeout = value; if (this._native) this._native.timeout = value; },
    },
    withCredentials: {
      get: function () { return this._native ? this._native.withCredentials : this._withCredentials; },
      set: function (value) { this._withCredentials = value; if (this._native) this._native.withCredentials = value; },
    },
  });

  function recoverFruitMaryRequestState() {
    try {
      if (window.cc && window.cc.vv && window.cc.vv.PrefabFactory._mask) {
        window.cc.vv.PrefabFactory._mask.active = false;
      }
      if (!window.cc || typeof window.cc.find !== 'function') return false;
      var canvas = window.cc.find('Canvas');
      var playLogic = canvas && canvas.getComponent && canvas.getComponent('PlayLogic');
      var menuLogic = canvas && canvas.getComponent && canvas.getComponent('MenuLogic');
      if (playLogic && playLogic._playing) return false;
      if (menuLogic && typeof menuLogic.initButton === 'function') menuLogic.initButton();
      return true;
    } catch (_error) {
      return false;
    }
  }

  function shortBonusCompletionIndex(positions) {
    return Math.max(0, (Array.isArray(positions) ? positions.length : 0) - 1);
  }

  function updateFruitMaryBetLimits(room) {
    var roomDenomination = Number(room && room.multiple);
    var roomMinimumBet = Number(room && room.minBet);
    var roomMaximumBet = Number(room && room.maxBet);
    if (Number.isFinite(roomDenomination) && roomDenomination > 0) {
      fruitMaryDenomination = roomDenomination;
    }
    if (Number.isFinite(roomMinimumBet) && roomMinimumBet > 0) {
      fruitMaryMinimumBet = roomMinimumBet;
    }
    if (Number.isFinite(roomMaximumBet) && roomMaximumBet > 0) {
      fruitMaryMaximumBet = Math.max(fruitMaryMinimumBet, roomMaximumBet);
    }
    return {
      denomination: fruitMaryDenomination,
      minBet: fruitMaryMinimumBet,
      maxBet: fruitMaryMaximumBet,
    };
  }

  function safeAllocationNumber(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  }

  function normalizeFruitMaryAllocation(currentRound, balance, requestedRound) {
    var current = safeAllocationNumber(currentRound);
    var availableBalance = safeAllocationNumber(balance);
    var total = current + availableBalance;
    var requested = Math.min(total, safeAllocationNumber(requestedRound));
    return {
      currentRound: requested,
      balance: total - requested,
      total: total,
    };
  }

  function adjustFruitMaryAllocation(currentRound, balance, direction, step) {
    var current = safeAllocationNumber(currentRound);
    var availableBalance = safeAllocationNumber(balance);
    var transfer = Math.max(1, safeAllocationNumber(step));
    var requested = direction === 'to-balance' ? current - transfer : current + transfer;
    return normalizeFruitMaryAllocation(current, availableBalance, requested);
  }

  function fruitMaryMaximumGambleAmount() {
    return Math.max(1, Math.floor(fruitMaryMaximumBet));
  }

  function normalizeFruitMaryGambleAllocation(currentRound, balance, requestedRound) {
    return normalizeFruitMaryAllocation(
      currentRound,
      balance,
      Math.min(safeAllocationNumber(requestedRound), fruitMaryMaximumGambleAmount()),
    );
  }

  function fruitMaryBetUnits(menuLogic, includeStoredBet) {
    var children = menuLogic && menuLogic.numNode && menuLogic.numNode.children;
    var total = 0;
    if (children && typeof children.length === 'number') {
      for (var index = 0; index < Math.min(8, children.length); index += 1) {
        var box = numberBox(children[index]);
        if (box) total += safeAllocationNumber(box.getNum());
      }
    }
    if (total > 0 || !includeStoredBet) return total;
    try {
      return safeAllocationNumber(window.cc && window.cc.sys.localStorage.getItem('money'));
    } catch (_error) {
      return 0;
    }
  }

  function fruitMaryBetSnapshot(menuLogic) {
    var children = menuLogic && menuLogic.numNode && menuLogic.numNode.children;
    if (!children || typeof children.length !== 'number') return [];
    var snapshot = [];
    for (var index = 0; index < Math.min(8, children.length); index += 1) {
      var box = numberBox(children[index]);
      snapshot.push(box ? safeAllocationNumber(box.getNum()) : 0);
    }
    return snapshot;
  }

  function restoreFruitMaryBetSnapshot(menuLogic, snapshot) {
    var children = menuLogic && menuLogic.numNode && menuLogic.numNode.children;
    if (!children || !Array.isArray(snapshot)) return false;
    for (var index = 0; index < Math.min(snapshot.length, children.length); index += 1) {
      var box = numberBox(children[index]);
      if (box) box.setNum(String(snapshot[index]));
    }
    if (typeof menuLogic.getAllPut === 'function') menuLogic.getAllPut();
    return true;
  }

  function fruitMaryLimitMessage() {
    return '本遊戲限紅為 '
      + fruitMaryMinimumBet.toLocaleString()
      + '-'
      + fruitMaryMaximumBet.toLocaleString();
  }

  function showFruitMaryLimitMessage() {
    var now = Date.now();
    if (now - fruitMaryLastLimitNoticeAt < 600) return;
    fruitMaryLastLimitNoticeAt = now;
    if (window.cc && window.cc.vv && window.cc.vv.Logic) {
      window.cc.vv.Logic.addPopBox(fruitMaryLimitMessage());
    }
  }

  function fruitMaryBetIsWithinLimit(menuLogic) {
    var units = fruitMaryBetUnits(menuLogic, true);
    if (units <= 0) return true;
    var amount = units * fruitMaryDenomination;
    return amount >= fruitMaryMinimumBet && amount <= fruitMaryMaximumBet;
  }

  function numberBox(node) {
    return node && typeof node.getComponent === 'function'
      ? node.getComponent('ShuziBoxLogic')
      : null;
  }

  function readAllocation(menuLogic) {
    var currentBox = numberBox(menuLogic && menuLogic.shuzibenlun);
    var balanceBox = numberBox(menuLogic && menuLogic.shuziyue);
    if (!currentBox || !balanceBox) return null;
    return normalizeFruitMaryAllocation(currentBox.getNum(), balanceBox.getNum(), currentBox.getNum());
  }

  function writeAllocation(menuLogic, requestedRound) {
    var allocation = readAllocation(menuLogic);
    if (!allocation) return null;
    var next = normalizeFruitMaryAllocation(
      allocation.currentRound,
      allocation.balance,
      requestedRound,
    );
    numberBox(menuLogic.shuzibenlun).setNum(String(next.currentRound));
    numberBox(menuLogic.shuziyue).setNum(String(next.balance));
    if (window.cc && window.cc.vv && window.cc.vv.UserInfo) {
      window.cc.vv.UserInfo.balance = next.balance;
    }
    return next;
  }

  function closeAllocationEditor() {
    var editor = document.getElementById(allocationEditorId);
    if (editor && editor.parentNode) editor.parentNode.removeChild(editor);
  }

  function openAllocationEditor(menuLogic) {
    if (!menuLogic || !menuLogic._kaishiBiDdaxiao_bool) return false;
    var playLogic = menuLogic.node && menuLogic.node.getComponent
      ? menuLogic.node.getComponent('PlayLogic')
      : null;
    if (playLogic && playLogic._playing) return false;
    var allocation = readAllocation(menuLogic);
    if (!allocation) return false;

    closeAllocationEditor();
    var overlay = document.createElement('div');
    overlay.id = allocationEditorId;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '調整本輪金額');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:100000', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:20px',
      'background:rgba(9,5,20,.76)', 'font-family:system-ui,-apple-system,sans-serif',
    ].join(';');

    var panel = document.createElement('div');
    panel.style.cssText = [
      'width:min(420px,100%)', 'border:2px solid #f4c85b', 'border-radius:18px',
      'background:linear-gradient(180deg,#2f164e,#160b29)', 'color:#fff',
      'padding:20px', 'box-shadow:0 20px 60px rgba(0,0,0,.5)',
    ].join(';');
    panel.innerHTML = ''
      + '<div style="font-size:20px;font-weight:800">調整本輪金額</div>'
      + '<div style="margin-top:6px;color:#d9cdea;font-size:13px">可用總額 '
      + allocation.total.toLocaleString() + '，猜大小單次上限 '
      + fruitMaryMaximumBet.toLocaleString() + '。</div>'
      + '<label style="display:block;margin-top:16px;font-size:13px;color:#f4c85b">本輪金額</label>'
      + '<input data-fruit-mary-allocation-input inputmode="numeric" autocomplete="off" '
      + 'style="box-sizing:border-box;width:100%;margin-top:7px;border:2px solid #8659b8;border-radius:12px;'
      + 'background:#0d0718;color:#fff;padding:13px 14px;font:700 22px ui-monospace,monospace;outline:none" />'
      + '<label style="display:block;margin-top:12px;font-size:13px;color:#f4c85b">保留餘額</label>'
      + '<input data-fruit-mary-balance-input inputmode="numeric" autocomplete="off" '
      + 'style="box-sizing:border-box;width:100%;margin-top:7px;border:2px solid #8659b8;border-radius:12px;'
      + 'background:#0d0718;color:#fff;padding:13px 14px;font:700 22px ui-monospace,monospace;outline:none" />'
      + '<div data-fruit-mary-allocation-preview style="margin-top:8px;color:#d9cdea;font-size:13px"></div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px">'
      + '<button type="button" data-allocation="0">全部領回</button>'
      + '<button type="button" data-allocation="half">投入一半</button>'
      + '<button type="button" data-allocation="all">全部投入</button>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">'
      + '<button type="button" data-action="cancel">取消</button>'
      + '<button type="button" data-action="apply">套用</button>'
      + '</div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var buttons = panel.querySelectorAll('button');
    for (var buttonIndex = 0; buttonIndex < buttons.length; buttonIndex += 1) {
      buttons[buttonIndex].style.cssText = [
        'border:1px solid #9d78c5', 'border-radius:10px', 'background:#3b205c',
        'color:#fff', 'padding:11px 8px', 'font-size:13px', 'font-weight:700',
      ].join(';');
    }
    var input = panel.querySelector('[data-fruit-mary-allocation-input]');
    var balanceInput = panel.querySelector('[data-fruit-mary-balance-input]');
    var preview = panel.querySelector('[data-fruit-mary-allocation-preview]');
    var applyButton = panel.querySelector('[data-action="apply"]');
    if (applyButton) applyButton.style.background = '#bd7b20';

    function renderAllocation(next) {
      input.value = String(next.currentRound);
      balanceInput.value = String(next.balance);
      preview.textContent = '本輪＋餘額固定為 ' + next.total.toLocaleString();
      return next;
    }

    function updatePreview(value) {
      var next = normalizeFruitMaryGambleAllocation(
        allocation.currentRound,
        allocation.balance,
        value,
      );
      return renderAllocation(next);
    }

    updatePreview(allocation.currentRound);
    input.addEventListener('input', function () {
      var digits = input.value.replace(/[^0-9]/g, '');
      updatePreview(digits === '' ? 0 : digits);
    });
    balanceInput.addEventListener('input', function () {
      var digits = balanceInput.value.replace(/[^0-9]/g, '');
      var requestedBalance = Math.min(
        allocation.total,
        safeAllocationNumber(digits === '' ? 0 : digits),
      );
      renderAllocation(
        normalizeFruitMaryGambleAllocation(
          allocation.currentRound,
          allocation.balance,
          allocation.total - requestedBalance,
        ),
      );
    });
    panel.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || target.tagName !== 'BUTTON') return;
      var allocationValue = target.getAttribute('data-allocation');
      if (allocationValue !== null) {
        updatePreview(
          allocationValue === 'half'
            ? Math.floor(allocation.total / 2)
            : allocationValue === 'all'
              ? Math.min(allocation.total, fruitMaryMaximumGambleAmount())
              : 0,
        );
        return;
      }
      var action = target.getAttribute('data-action');
      if (action === 'cancel') {
        closeAllocationEditor();
      } else if (action === 'apply') {
        var applied = writeAllocation(menuLogic, input.value);
        closeAllocationEditor();
        if (applied && applied.currentRound === 0 && typeof menuLogic.clickKaishi === 'function') {
          menuLogic.clickKaishi();
        }
      }
    });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeAllocationEditor();
    });
    window.setTimeout(function () {
      if (input && typeof input.focus === 'function') {
        input.focus();
        input.select();
      }
    }, 0);
    return true;
  }

  var fruitMaryPositionMultipliers = {
    1: 10, 2: 20, 3: 50, 4: 120, 5: 5, 6: 2,
    7: 15, 8: 20, 9: 2, 10: 0, 11: 5, 12: 2,
    13: 10, 14: 20, 15: 2, 16: 40, 17: 5, 18: 2,
    19: 15, 20: 30, 21: 2, 22: 0, 23: 5, 24: 2,
  };

  function fruitMaryPayoutMultiplier(position, fallback) {
    var multiplier = fruitMaryPositionMultipliers[Number(position)];
    return Number.isFinite(multiplier) ? multiplier : Number(fallback);
  }

  function patchFruitMaryMenuLogic(menuLogic) {
    if (!menuLogic || menuLogic.__yachiyoAllocationControls) return Boolean(menuLogic);
    if (!menuLogic.shuzibenlun || !menuLogic.shuziyue) return false;

    function playButtonSound() {
      if (window.cc && window.cc.vv && window.cc.vv.AudioMgr) {
        window.cc.vv.AudioMgr.playSFX('sounds/anniu/Y210', false, null, false);
      }
    }

    var originalClickKaishi = menuLogic.clickKaishi;
    if (typeof originalClickKaishi === 'function') {
      menuLogic.clickKaishi = function () {
        var collectingWin = Boolean(this._kaishiBiDdaxiao_bool);
        if (!collectingWin && (settlementInFlight || Date.now() < nextFruitMarySpinAt)) {
          return undefined;
        }
        if (!collectingWin && !fruitMaryBetIsWithinLimit(this)) {
          if (typeof this.clickCancelAuto === 'function') this.clickCancelAuto();
          if (typeof this.initButton === 'function') this.initButton();
          showFruitMaryLimitMessage();
          return undefined;
        }
        if (!collectingWin && this.startBt) this.startBt.interactable = false;
        return originalClickKaishi.apply(this, arguments);
      };
    }

    var originalClickCancelAuto = menuLogic.clickCancelAuto;
    if (typeof originalClickCancelAuto === 'function') {
      menuLogic.clickCancelAuto = function () {
        this.isAutoPut_bool = false;
        if (typeof this.unschedule === 'function') {
          this.unschedule(this.clickKaishi);
          if (typeof this.kaishi === 'function') this.unschedule(this.kaishi);
          if (typeof this.updateTime === 'function') this.unschedule(this.updateTime);
        }
        var result = originalClickCancelAuto.apply(this, arguments);
        restoreFruitMaryAutoButtonState(this);
        return result;
      };
    }

    var originalBetIncrement = menuLogic.kaishi;
    if (typeof originalBetIncrement === 'function') {
      menuLogic.kaishi = function () {
        var snapshot = fruitMaryBetSnapshot(this);
        var result = originalBetIncrement.apply(this, arguments);
        if (fruitMaryBetUnits(this, false) * fruitMaryDenomination > fruitMaryMaximumBet) {
          restoreFruitMaryBetSnapshot(this, snapshot);
          if (typeof this.unschedule === 'function') this.unschedule(this.kaishi);
          showFruitMaryLimitMessage();
        }
        return result;
      };
    }

    var originalClickDaOrXiao = menuLogic.clickDaOrXiao;
    if (typeof originalClickDaOrXiao === 'function') {
      menuLogic.clickDaOrXiao = function () {
        var allocation = readAllocation(this);
        if (!allocation || allocation.currentRound < fruitMaryMinimumBet) {
          showFruitMaryLimitMessage();
          return undefined;
        }
        if (allocation.currentRound > fruitMaryMaximumGambleAmount()) {
          writeAllocation(this, fruitMaryMaximumGambleAmount());
        }
        return originalClickDaOrXiao.apply(this, arguments);
      };
    }

    var originalAddWinNum = menuLogic.addWinNum;
    if (
      typeof originalAddWinNum === 'function' &&
      typeof menuLogic.getPosPutNum === 'function' &&
      typeof menuLogic.getPosBeishu === 'function' &&
      typeof menuLogic.yueAdd === 'function'
    ) {
      menuLogic.addWinNum = function (position) {
        var sourceMultiplier = Number(this.getPosBeishu(position));
        // The archived Cocos script contains an older multiplier table. Keep
        // the cabinet animation on the same authoritative table used by the
        // settlement service so the visible win and credited balance agree.
        var payoutMultiplier = fruitMaryPayoutMultiplier(position, sourceMultiplier);
        var payoutUnits = Number(this.getPosPutNum(position)) * payoutMultiplier;
        if (!Number.isFinite(payoutUnits)) return originalAddWinNum.call(this, position);
        this.yueAdd(payoutUnits * fruitMaryDenomination);
      };
    }

    menuLogic.clickZuo = function () {
      var allocation = readAllocation(this);
      if (!allocation) return;
      var next = adjustFruitMaryAllocation(
        allocation.currentRound,
        allocation.balance,
        'to-round',
        1,
      );
      if (next.currentRound > fruitMaryMaximumGambleAmount()) {
        next = normalizeFruitMaryGambleAllocation(
          allocation.currentRound,
          allocation.balance,
          fruitMaryMaximumGambleAmount(),
        );
      }
      if (next.currentRound === allocation.currentRound) {
        if (typeof this.unschedule === 'function') this.unschedule(this.clickZuo);
        if (allocation.currentRound >= fruitMaryMaximumGambleAmount()) {
          showFruitMaryLimitMessage();
        }
        return;
      }
      playButtonSound();
      writeAllocation(this, next.currentRound);
    };

    menuLogic.clickYou = function () {
      var allocation = readAllocation(this);
      if (!allocation) return;
      var next = adjustFruitMaryAllocation(
        allocation.currentRound,
        allocation.balance,
        'to-balance',
        1,
      );
      playButtonSound();
      writeAllocation(this, next.currentRound);
      if (next.currentRound === 0) {
        if (typeof this.unschedule === 'function') this.unschedule(this.clickYou);
        if (typeof this.clickKaishi === 'function') this.clickKaishi();
      }
    };

    function registerEditorTarget(node) {
      if (!node || typeof node.on !== 'function' || !window.cc || !window.cc.Node) return;
      node.on(window.cc.Node.EventType.TOUCH_END, function () {
        openAllocationEditor(menuLogic);
      });
    }
    registerEditorTarget(menuLogic.shuzibenlun);
    registerEditorTarget(menuLogic.shuziyue);
    menuLogic.__yachiyoAllocationControls = true;
    return true;
  }

  function patchFruitMaryPlayLogic(playLogic) {
    if (!playLogic || playLogic.__yachiyoCompletionGuard) return Boolean(playLogic);
    var originalShowSixiShan = playLogic.showSixiShan;
    if (typeof originalShowSixiShan === 'function') {
      playLogic.showSixiShan = function (resultPositions, cycleState, done) {
        var positions = resultPositions || this._result_pos_arr || [];
        if (positions.length >= 4) {
          return originalShowSixiShan.call(this, resultPositions, cycleState, done);
        }
        var state = cycleState || { index_int: 0 };
        if (state.index_int >= 3) {
          if (typeof done === 'function') done();
          return;
        }
        state.index_int += 1;
        var completionIndex = shortBonusCompletionIndex(positions);
        if (completionIndex < 1) {
          if (typeof done === 'function') done();
          return;
        }
        if (window.cc && window.cc.vv && window.cc.vv.AudioMgr) {
          window.cc.vv.AudioMgr.playSFX('sounds/lukeyShan/Y009', false, function () {}, true);
        }
        for (var index = 1; index < positions.length; index += 1) {
          (function (component, positionIndex) {
            var position = positions[positionIndex];
            component.setPosShan(position, 0.1, 3, function (blinkIndex) {
              if (blinkIndex !== 3) return;
              component.setPosShan(component.changeNumTo24(position + 1), 0.1, 3, function () {});
              component.setPosShan(component.changeNumTo24(position - 1), 0.1, 3, function () {});
              if (positionIndex === completionIndex) {
                component.showSixiShan(resultPositions, state, done);
              }
            });
          })(this, index);
        }
      };
    }

    var originalPlay = playLogic.play;
    if (typeof originalPlay === 'function') {
      playLogic.play = function (type, positions, isWin, done) {
        if (this._playing) return originalPlay.call(this, type, positions, isWin, done);
        var component = this;
        var completed = false;
        if (component.__yachiyoAnimationTimer) {
          window.clearTimeout(component.__yachiyoAnimationTimer);
        }
        function finish() {
          if (completed) return;
          completed = true;
          if (component.__yachiyoAnimationTimer) {
            window.clearTimeout(component.__yachiyoAnimationTimer);
            component.__yachiyoAnimationTimer = null;
          }
          if (typeof done === 'function') return done.apply(component, arguments);
        }
        var isMissPresentation = Number(type) === -1;
        component.__yachiyoAnimationTimer = window.setTimeout(function () {
          try {
            if (typeof component.stopAllAni === 'function') component.stopAllAni();
            if (component.mask) component.mask.active = false;
          } catch (_error) {
            // The authoritative settlement still completes even if source cleanup fails.
          }
          // A missing type-9 audio completion is a known source-client issue,
          // not a failed settlement. Recover it silently so a normal miss does
          // not show an alarming error after the authoritative result settled.
          if (!isMissPresentation) {
            notifyParent('fruit-mary:error', {
              message: '遊戲動畫逾時，已自動恢復本輪結算',
            });
          }
          finish();
        }, isMissPresentation ? missAnimationCompletionTimeoutMs : animationCompletionTimeoutMs);
        try {
          return originalPlay.call(component, type, positions, isWin, finish);
        } catch (error) {
          notifyParent('fruit-mary:error', {
            message: '遊戲動畫發生錯誤，已自動恢復本輪結算',
          });
          finish();
          return undefined;
        }
      };
    }

    function exitToLobby() {
      var menuLogic =
        this.node && this.node.getComponent && this.node.getComponent('MenuLogic');
      if (menuLogic && typeof menuLogic.clickCancelAuto === 'function') {
        menuLogic.clickCancelAuto();
      }
      if (settlementInFlight) {
        notifyParent('fruit-mary:error', { message: '本輪正在結算，完成後即可返回大廳' });
        return;
      }
      notifyParent('fruit-mary:exit');
    }
    if (typeof playLogic.clickExit === 'function') playLogic.clickExit = exitToLobby;
    if (typeof playLogic.reportGameEnd === 'function') playLogic.reportGameEnd = exitToLobby;
    playLogic.__yachiyoCompletionGuard = true;
    return true;
  }

  function patchFruitMaryAudioManager(audioManager) {
    if (!audioManager || audioManager.__yachiyoCompletionGuard) return Boolean(audioManager);
    var originalPlaySFX = audioManager.playSFX;
    if (typeof originalPlaySFX !== 'function') return false;
    audioManager.playSFX = function (path, loop, callback) {
      if (typeof callback !== 'function') return originalPlaySFX.apply(this, arguments);
      var args = Array.prototype.slice.call(arguments);
      var manager = this;
      var completed = false;
      var timer = window.setTimeout(function () {
        if (completed || gameDisposing) return;
        completed = true;
        callback.call(manager, -1);
      }, audioCompletionTimeoutMs);
      args[2] = function () {
        if (completed || gameDisposing) return;
        completed = true;
        window.clearTimeout(timer);
        return callback.apply(this, arguments);
      };
      try {
        return originalPlaySFX.apply(manager, args);
      } catch (_error) {
        if (!completed && !gameDisposing) {
          completed = true;
          window.clearTimeout(timer);
          callback.call(manager, -1);
        }
        return undefined;
      }
    };
    audioManager.__yachiyoCompletionGuard = true;
    return true;
  }

  function applyFruitMaryRuntimeGuards() {
    try {
      if (!window.cc || typeof window.cc.find !== 'function') return false;
      var canvas = window.cc.find('Canvas');
      var playLogic = canvas && canvas.getComponent && canvas.getComponent('PlayLogic');
      var menuLogic = canvas && canvas.getComponent && canvas.getComponent('MenuLogic');
      var audioManager = window.cc.vv && window.cc.vv.AudioMgr;
      var patched =
        patchFruitMaryAudioManager(audioManager) &&
        patchFruitMaryPlayLogic(playLogic) &&
        patchFruitMaryMenuLogic(menuLogic);
      restoreFruitMaryVisualTree(playLogic, menuLogic);
      return patched;
    } catch (_error) {
      return false;
    }
  }

  function restoreFruitMaryAutoButtonState(menuLogic) {
    if (!menuLogic) return false;
    var autoplay = Boolean(menuLogic.isAutoPut_bool);
    var startNode = menuLogic.startBt && menuLogic.startBt.node;
    var stopNode = menuLogic.unStartBt && menuLogic.unStartBt.node;
    var changed = false;
    if (startNode) {
      if (startNode.active === autoplay) changed = true;
      startNode.active = !autoplay;
      startNode.opacity = 255;
      menuLogic.startBt.interactable = !settlementInFlight && !autoplay;
    }
    if (stopNode) {
      if (stopNode.active !== autoplay) changed = true;
      stopNode.active = autoplay;
      stopNode.opacity = 255;
      menuLogic.unStartBt.interactable = autoplay;
    }
    return changed;
  }

  function restoreFruitMaryVisualTree(playLogic, menuLogic) {
    if (!playLogic || !menuLogic) return false;
    var changed = false;
    var centre = playLogic.centerNode;
    if (centre) {
      if (centre.active === false || centre.opacity === 0) changed = true;
      centre.active = true;
      centre.opacity = 255;
      var fruitRing = centre.getChildByName && centre.getChildByName('shuiguoNode');
      if (fruitRing) {
        if (fruitRing.active === false || fruitRing.opacity === 0) changed = true;
        fruitRing.active = true;
        fruitRing.opacity = 255;
      }
    }
    if (
      sourceReadyAt > 0 &&
      !playLogic._playing &&
      !settlementInFlight &&
      Date.now() >= nextFruitMarySpinAt
    ) {
      if (playLogic.mask) playLogic.mask.active = false;
      if (window.cc && window.cc.vv && window.cc.vv.PrefabFactory._mask) {
        window.cc.vv.PrefabFactory._mask.active = false;
      }
      if (restoreFruitMaryAutoButtonState(menuLogic)) changed = true;
    }
    return changed;
  }

  function fruitMaryVisualHealthy() {
    // Source scene nodes are intentionally hidden and rebuilt during wheel and
    // gamble animations. Treating those transient states as renderer failure
    // destroyed the iframe after two healthy spins. Only browser-reported
    // WebGL loss is authoritative enough to rebuild the whole game.
    return !gameCanvasContextLost && !renderFailureReported;
  }

  function installFruitMaryRuntimeGuards() {
    function install() {
      if (gameDisposing) return;
      if (applyFruitMaryRuntimeGuards()) return;
      animationGuardAttempts += 1;
      if (animationGuardAttempts < 600) window.setTimeout(install, 100);
    }
    install();
  }

  bindGameCanvasRecovery();
  addWindowListener('error', function (event) {
    var error = event && (event.error || event.message);
    var stack = error && error.stack ? String(error.stack) : '';
    var message = publicRenderError(error);
    if (/fruit-mary|cocos2d-js/i.test(stack) && /webgl|context|getParameter|getExtension/i.test(message)) {
      reportFatalRenderFailure('source-runtime-error', error);
    }
  });
  addWindowListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var stack = reason && reason.stack ? String(reason.stack) : '';
    if (
      /fruit-mary|cocos2d-js/i.test(stack) &&
      /webgl|context|getParameter|getExtension/i.test(publicRenderError(reason))
    ) {
      reportFatalRenderFailure('source-runtime-rejection', reason);
    }
  });
  addWindowListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== window.parent || !event.data) {
      return;
    }
    if (event.data.type === 'fruit-mary:dispose') disposeGameForRemount();
  });
  addWindowListener('pagehide', disposeGameForRemount);

  window.XMLHttpRequest = BridgeXHR;
  window.__YachiyoFruitMaryAdapterTest = {
    adjustFruitMaryAllocation: adjustFruitMaryAllocation,
    normalizeFruitMaryAllocation: normalizeFruitMaryAllocation,
    normalizeFruitMaryGambleAllocation: normalizeFruitMaryGambleAllocation,
    updateFruitMaryBetLimits: updateFruitMaryBetLimits,
    fruitMaryBetIsWithinLimit: fruitMaryBetIsWithinLimit,
    fruitMaryPayoutMultiplier: fruitMaryPayoutMultiplier,
    patchFruitMaryMenuLogic: patchFruitMaryMenuLogic,
    patchFruitMaryAudioManager: patchFruitMaryAudioManager,
    shortBonusCompletionIndex: shortBonusCompletionIndex,
    patchFruitMaryPlayLogic: patchFruitMaryPlayLogic,
    missAnimationCompletionTimeoutMs: missAnimationCompletionTimeoutMs,
    restoreFruitMaryAutoButtonState: restoreFruitMaryAutoButtonState,
    restoreFruitMaryVisualTree: restoreFruitMaryVisualTree,
    fruitMaryVisualHealthy: fruitMaryVisualHealthy,
    recoverFruitMaryRequestState: recoverFruitMaryRequestState,
    bindGameCanvasRecovery: bindGameCanvasRecovery,
    disposeGameForRemount: disposeGameForRemount,
    createBridgeXHR: function () { return new BridgeXHR(); },
  };
  window.__YachiyoDisposeFruitMaryGame = disposeGameForRemount;
  installFruitMaryRuntimeGuards();
  console.info('[Fruit Mary Adapter] Yachiyo authenticated HTTP bridge enabled');
}());
