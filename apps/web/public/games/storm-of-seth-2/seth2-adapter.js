(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || (window.location.origin + '/api')).replace(/\/$/, '');
  var protocolUrl = apiBase + '/games/seth2/protocol';
  var patched = false;
  var loginStarted = false;
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
      var persisted = raw ? JSON.parse(raw) : null;
      return persisted && persisted.state ? persisted.state : {};
    } catch (_error) {
      return {};
    }
  }

  function writeTokens(accessToken, refreshToken) {
    try {
      var storage = parentStorage();
      var raw = storage.getItem('bg-auth');
      var persisted = raw ? JSON.parse(raw) : { state: {}, version: 0 };
      persisted.state = persisted.state || {};
      persisted.state.accessToken = accessToken;
      persisted.state.refreshToken = refreshToken;
      storage.setItem('bg-auth', JSON.stringify(persisted));
    } catch (_error) {
      // The parent page also receives the refreshed tokens below.
    }
    notifyParent('seth2:tokens', { accessToken: accessToken, refreshToken: refreshToken });
  }

  function notifyParent(type, payload) {
    try {
      window.parent.postMessage(Object.assign({ type: type }, payload || {}), window.location.origin);
    } catch (error) {
      console.warn('[Seth2 Adapter] Parent notification failed', error);
    }
  }

  function refreshAccessToken() {
    if (refreshInFlight) return refreshInFlight;
    var auth = readAuth();
    if (!auth.refreshToken) return Promise.reject(new Error('登入已過期，請回到大廳重新登入'));
    refreshInFlight = fetch(apiBase + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok || !body.accessToken || !body.refreshToken) {
          throw new Error(body.message || '登入已過期，請回到大廳重新登入');
        }
        writeTokens(body.accessToken, body.refreshToken);
        return body.accessToken;
      });
    }).finally(function () {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  function authorizedFetch(url, body, retried) {
    var auth = readAuth();
    if (!auth.accessToken) return Promise.reject(new Error('找不到登入憑證，請回到大廳重新登入'));
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth.accessToken,
      },
      body: JSON.stringify(body || {}),
    }).then(function (response) {
      if (response.status === 401 && !retried) {
        return refreshAccessToken().then(function () {
          return authorizedFetch(url, body, true);
        });
      }
      return response.json().then(function (payload) {
        if (!response.ok) throw new Error(payload.message || payload.error || '遊戲伺服器拒絕請求');
        return payload;
      });
    });
  }

  function showFatal(message) {
    var overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999', 'display:flex',
      'align-items:center', 'justify-content:center', 'background:#10091d',
      'color:#fff', 'font-family:system-ui,sans-serif', 'text-align:center',
      'padding:24px',
    ].join(';');
    overlay.innerHTML = '<div><div style="font-size:20px;font-weight:700;margin-bottom:10px">遊戲連線失敗</div>'
      + '<div style="color:#c9bdd9">' + String(message).replace(/[<>&]/g, '') + '</div></div>';
    document.body.appendChild(overlay);
    notifyParent('seth2:error', { message: message });
  }

  function LocalGameSocket(url) {
    this.url = url;
    this.readyState = LocalGameSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this._queue = Promise.resolve();
    var socket = this;
    window.setTimeout(function () {
      if (socket.readyState !== LocalGameSocket.CONNECTING) return;
      socket.readyState = LocalGameSocket.OPEN;
      if (socket.onopen) socket.onopen({ type: 'open' });
    }, 0);
  }

  LocalGameSocket.CONNECTING = 0;
  LocalGameSocket.OPEN = 1;
  LocalGameSocket.CLOSING = 2;
  LocalGameSocket.CLOSED = 3;

  LocalGameSocket.prototype.send = function (raw) {
    var socket = this;
    if (socket.readyState !== LocalGameSocket.OPEN) throw new Error('Socket is not open');
    socket._queue = socket._queue.then(function () {
      var message = JSON.parse(raw);
      return authorizedFetch(protocolUrl, message, false).then(function (payload) {
        if (payload && payload.data && payload.data.balance !== undefined) {
          notifyParent('seth2:balance', { balance: Number(payload.data.balance) });
        }
        if (socket.readyState === LocalGameSocket.OPEN && socket.onmessage) {
          socket.onmessage({ data: JSON.stringify(payload) });
        }
      });
    }).catch(function (error) {
      var message = error && error.message ? error.message : '遊戲伺服器連線失敗';
      if (socket.readyState === LocalGameSocket.OPEN && socket.onmessage) {
        socket.onmessage({ data: JSON.stringify({ type: 'msg', data: { message: message } }) });
      }
      if (socket.onerror) socket.onerror(error);
    });
  };

  LocalGameSocket.prototype.close = function () {
    if (this.readyState === LocalGameSocket.CLOSED) return;
    this.readyState = LocalGameSocket.CLOSING;
    this.readyState = LocalGameSocket.CLOSED;
    if (this.onclose) this.onclose({ type: 'close', code: 1000, wasClean: true });
  };

  window.WebSocket = LocalGameSocket;

  function requestSession(callback) {
    authorizedFetch(apiBase + '/games/seth2/session', {}, false).then(function (body) {
      callback(true, body);
    }).catch(function (error) {
      callback(false, { code: 0, msg: error.message || '無法連線到遊戲伺服器' });
    });
  }

  function finishLogin(component, ok, response, modules) {
    if (!ok || !response || response.code !== 1 || !response.data || !response.data.userInfo) {
      showFatal((response && (response.msg || response.error)) || '建立遊戲工作階段失敗');
      return;
    }

    var userInfo = response.data.userInfo;
    var auth = readAuth();
    userInfo.token = auth.accessToken || '';
    userInfo.socketPort = '';
    modules.User.token = 'Bearer ' + (auth.accessToken || '');
    modules.User.update(userInfo);
    modules.UserDefault.setItem('user_token', auth.accessToken || '');
    modules.WebSocketUtil.WEBSOCKETURL = 'seth2-local://protocol/';
    modules.WebSocketUtil._webSocketUtil = null;
    if (component && component.node) component.node.active = false;
    modules.WebSocketUtil.sendMsg({ type: modules.GameEventName.WS_CONNECT_TO_HALL });
    notifyParent('seth2:ready', { balance: Number(userInfo.score || 0) });
  }

  function patchClient() {
    if (patched || typeof window.__require !== 'function') return;
    try {
      var netModule = window.__require('Net');
      var userModule = window.__require('User');
      var socketModule = window.__require('WebSocketUtil');
      var eventModule = window.__require('GameEvent');
      var LoginNode = window.__require('LoginNode').default;
      if (!netModule || !userModule || !socketModule || !eventModule || !LoginNode) return;

      var modules = {
        User: userModule.User,
        UserDefault: userModule.UserDefault,
        WebSocketUtil: socketModule.WebSocketUtil,
        GameEventName: eventModule.GameEventName,
      };

      var originalUpdate = modules.User.update.bind(modules.User);
      modules.User.update = function (data) {
        originalUpdate(data);
        if (data && data.score !== undefined) {
          notifyParent('seth2:balance', { balance: Number(data.score) });
        }
      };

      netModule.Net.host = apiBase + '/';
      netModule.Net.getMailCode = function (_payload, callback) {
        callback(false, { code: 0, msg: '此版本使用大廳帳號登入' });
      };
      netModule.Net.mailLogin = function (_payload, callback) {
        requestSession(callback);
      };

      var originalStart = LoginNode.prototype.start;
      LoginNode.prototype.start = function () {
        if (originalStart) originalStart.call(this);
        if (loginStarted) return;
        loginStarted = true;
        if (this.node) this.node.active = false;
        var component = this;
        requestSession(function (ok, response) {
          finishLogin(component, ok, response, modules);
        });
      };

      patched = true;
      console.info('[Seth2 Adapter] Yachiyo authenticated HTTP bridge enabled');
    } catch (_error) {
      // The Cocos bundle is loaded asynchronously; poll until all modules exist.
    }
  }

  var patchTimer = window.setInterval(function () {
    patchClient();
    if (patched) window.clearInterval(patchTimer);
  }, 10);
  patchClient();
}());
