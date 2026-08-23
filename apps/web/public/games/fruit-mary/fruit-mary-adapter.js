(function () {
  'use strict';

  var NativeXHR = window.XMLHttpRequest;
  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || (window.location.origin + '/api')).replace(/\/$/, '');
  var gameApi = apiBase + '/games/fruit-mary';
  var requestTimeoutMs = 15000;
  var refreshInFlight = null;
  var settlementInFlight = false;
  var animationGuardAttempts = 0;
  var animationCompletionTimeoutMs = 45000;
  var allocationEditorId = 'fruit-mary-allocation-editor';
  var fruitMaryDenomination = 10;
  var gameDisposing = false;
  var gameCanvasContextLost = false;
  var renderFailureReported = false;
  var sourceReadyAt = 0;
  var visualFailureSamples = 0;

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
    try {
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
    refreshInFlight = fetch(apiBase + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok || !body.accessToken || !body.refreshToken) {
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

  function authorizedRequest(url, method, body, retried) {
    var auth = readAuth();
    if (!auth.accessToken) return Promise.reject(new Error('找不到登入憑證，請回到大廳重新登入'));
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
    }).then(function (response) {
      if (response.status === 401 && !retried) {
        return refreshAccessToken().then(function () {
          return authorizedRequest(url, method, body, true);
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
    if (ownsSettlement) settlementInFlight = true;
    authorizedRequest(route.url, route.method, body, false)
      .then(function (payload) {
        if (route.kind === 'room' && payload.data) {
          var roomDenomination = Number(payload.data.multiple);
          if (Number.isFinite(roomDenomination) && roomDenomination > 0) {
            fruitMaryDenomination = roomDenomination;
          }
        }
        if (route.kind === 'session' && payload.data && payload.data.info) {
          renderFailureReported = false;
          sourceReadyAt = Date.now();
          visualFailureSamples = 0;
          notifyParent('fruit-mary:ready', { balance: Number(payload.data.info.gold || 0) });
        }
        if (route.kind === 'settlement' && payload.balance !== undefined) {
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
        if (ownsSettlement) settlementInFlight = false;
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
      + allocation.total.toLocaleString() + '，輸入要拿去猜大小的金額。</div>'
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
      var next = normalizeFruitMaryAllocation(
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
        normalizeFruitMaryAllocation(
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
              ? allocation.total
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

  function patchFruitMaryMenuLogic(menuLogic) {
    if (!menuLogic || menuLogic.__yachiyoAllocationControls) return Boolean(menuLogic);
    if (!menuLogic.shuzibenlun || !menuLogic.shuziyue) return false;

    function playButtonSound() {
      if (window.cc && window.cc.vv && window.cc.vv.AudioMgr) {
        window.cc.vv.AudioMgr.playSFX('sounds/anniu/Y210', false, null, false);
      }
    }

    var originalAddWinNum = menuLogic.addWinNum;
    if (
      typeof originalAddWinNum === 'function' &&
      typeof menuLogic.getPosPutNum === 'function' &&
      typeof menuLogic.getPosBeishu === 'function' &&
      typeof menuLogic.yueAdd === 'function'
    ) {
      menuLogic.addWinNum = function (position) {
        var payoutUnits = Number(this.getPosPutNum(position)) * Number(this.getPosBeishu(position));
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
      if (next.currentRound === allocation.currentRound) {
        if (typeof this.unschedule === 'function') this.unschedule(this.clickZuo);
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
        component.__yachiyoAnimationTimer = window.setTimeout(function () {
          try {
            if (typeof component.stopAllAni === 'function') component.stopAllAni();
            if (component.mask) component.mask.active = false;
          } catch (_error) {
            // The authoritative settlement still completes even if source cleanup fails.
          }
          notifyParent('fruit-mary:error', {
            message: '遊戲動畫逾時，已自動恢復本輪結算',
          });
          finish();
        }, animationCompletionTimeoutMs);
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
    playLogic.__yachiyoCompletionGuard = true;
    return true;
  }

  function applyFruitMaryRuntimeGuards() {
    try {
      if (!window.cc || typeof window.cc.find !== 'function') return false;
      var canvas = window.cc.find('Canvas');
      var playLogic = canvas && canvas.getComponent && canvas.getComponent('PlayLogic');
      var menuLogic = canvas && canvas.getComponent && canvas.getComponent('MenuLogic');
      var patched = patchFruitMaryPlayLogic(playLogic) && patchFruitMaryMenuLogic(menuLogic);
      restoreFruitMaryVisualTree(playLogic, menuLogic);
      return patched;
    } catch (_error) {
      return false;
    }
  }

  function sourceNodeVisible(node) {
    return Boolean(
      node && node.active !== false && node.activeInHierarchy !== false && node.opacity !== 0,
    );
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
    if (sourceReadyAt > 0 && !playLogic._playing && !settlementInFlight) {
      if (playLogic.mask) playLogic.mask.active = false;
      if (window.cc && window.cc.vv && window.cc.vv.PrefabFactory._mask) {
        window.cc.vv.PrefabFactory._mask.active = false;
      }
      var startNode = menuLogic.startBt && menuLogic.startBt.node;
      if (startNode) {
        if (!sourceNodeVisible(startNode)) changed = true;
        startNode.active = true;
        startNode.opacity = 255;
        menuLogic.startBt.interactable = true;
      }
      var unavailableNode = menuLogic.unStartBt && menuLogic.unStartBt.node;
      if (unavailableNode) unavailableNode.active = false;
    }
    return changed;
  }

  function fruitMaryVisualHealthy() {
    if (gameCanvasContextLost) return false;
    if (!sourceReadyAt || Date.now() - sourceReadyAt < 10000) return true;
    try {
      if (!window.cc || typeof window.cc.find !== 'function') return false;
      var canvas = window.cc.find('Canvas');
      var playLogic = canvas && canvas.getComponent && canvas.getComponent('PlayLogic');
      var menuLogic = canvas && canvas.getComponent && canvas.getComponent('MenuLogic');
      if (!playLogic || !menuLogic) return false;
      restoreFruitMaryVisualTree(playLogic, menuLogic);
      var centre = playLogic.centerNode;
      var fruitRing = centre && centre.getChildByName && centre.getChildByName('shuiguoNode');
      var structureHealthy =
        sourceNodeVisible(centre) &&
        sourceNodeVisible(fruitRing) &&
        Array.isArray(fruitRing.children) &&
        fruitRing.children.length >= 24;
      if (!structureHealthy) return false;
      // Never read pixels back from the WebGL canvas here. Mobile Safari may
      // expose an empty drawing buffer even while Cocos is rendering normally,
      // which used to turn this health check into a permanent iframe reload
      // loop. Explicit context-loss/runtime events remain authoritative, while
      // this periodic check only verifies the stable source-scene structure.
      return true;
    } catch (_error) {
      return false;
    }
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
    if (
      /fruit-mary|cocos2d-js/i.test(stack) &&
      /webgl|context|getParameter|getExtension|Cannot read|undefined is not an object/i.test(message)
    ) {
      reportFatalRenderFailure('source-runtime-error', error);
    }
  });
  addWindowListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var stack = reason && reason.stack ? String(reason.stack) : '';
    if (/fruit-mary|cocos2d-js/i.test(stack)) {
      reportFatalRenderFailure('source-runtime-rejection', reason);
    }
  });
  addWindowListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== window.parent || !event.data) {
      return;
    }
    if (event.data.type === 'fruit-mary:dispose') disposeGameForRemount();
    if (event.data.type === 'fruit-mary:health-check' && !gameDisposing) {
      var healthy = fruitMaryVisualHealthy();
      visualFailureSamples = healthy ? 0 : visualFailureSamples + 1;
      // Require two consecutive samples so a single in-flight animation frame
      // cannot tear down an otherwise healthy game.
      notifyParent('fruit-mary:health', { healthy: healthy || visualFailureSamples < 2 });
    }
  });
  addWindowListener('pagehide', disposeGameForRemount);

  window.XMLHttpRequest = BridgeXHR;
  window.__YachiyoFruitMaryAdapterTest = {
    adjustFruitMaryAllocation: adjustFruitMaryAllocation,
    normalizeFruitMaryAllocation: normalizeFruitMaryAllocation,
    patchFruitMaryMenuLogic: patchFruitMaryMenuLogic,
    shortBonusCompletionIndex: shortBonusCompletionIndex,
    patchFruitMaryPlayLogic: patchFruitMaryPlayLogic,
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
