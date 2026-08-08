(function () {
  'use strict';

  var NativeXHR = window.XMLHttpRequest;
  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || (window.location.origin + '/api')).replace(/\/$/, '');
  var gameApi = apiBase + '/games/fruit-mary';
  var refreshInFlight = null;

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
    return fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + auth.accessToken,
      },
      body: method === 'GET' ? undefined : body || '{}',
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
    if (path.endsWith('/api/game/room/show')) return { method: 'GET', url: gameApi + '/room' };
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
    authorizedRequest(route.url, route.method, body, false)
      .then(function (payload) {
        if (route.kind === 'session' && payload.data && payload.data.info) {
          notifyParent('fruit-mary:ready', { balance: Number(payload.data.info.gold || 0) });
        }
        if (route.kind === 'settlement' && payload.balance !== undefined) {
          notifyParent('fruit-mary:balance', { balance: Number(payload.balance) });
        }
        bridge._complete(payload);
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '遊戲伺服器連線失敗';
        notifyParent('fruit-mary:error', { message: message });
        bridge._complete({ code: 0, msg: message, message: message });
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

  window.XMLHttpRequest = BridgeXHR;
  console.info('[Fruit Mary Adapter] Yachiyo authenticated HTTP bridge enabled');
}());
