(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || (window.location.origin + '/api')).replace(/\/$/, '');
  var protocolUrl = apiBase + '/games/seth2/protocol';
  var requestTimeoutMs = 15000;
  var patched = false;
  var gameModulesPatched = false;
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

  function publicGameError(payload, fallback) {
    var message = payload && (payload.message || payload.error);
    var internal = payload && payload.code === 'INTERNAL';
    if (
      internal ||
      /prisma\.|query execution|prismaclient|postgres(?:ql)?|connectorerror/i.test(String(message || ''))
    ) {
      return '遊戲結算暫時失敗，請稍後再試';
    }
    return message || fallback;
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
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = window.setTimeout(function () {
      if (controller) controller.abort();
    }, requestTimeoutMs);
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth.accessToken,
      },
      body: JSON.stringify(body || {}),
      signal: controller ? controller.signal : undefined,
    }).then(function (response) {
      if (response.status === 401 && !retried) {
        return refreshAccessToken().then(function () {
          return authorizedFetch(url, body, true);
        });
      }
      return response.json().then(function (payload) {
        if (!response.ok) throw new Error(publicGameError(payload, '遊戲伺服器拒絕請求'));
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

  function recoverGameInteraction(request) {
    if (!request || (request.type !== 'gameToolsList' && request.type !== 'buyFreeGame')) return;
    window.setTimeout(function () {
      try {
        var Game = window.__require && window.__require('Game').default;
        var game = Game && Game.instance;
        if (!game) return;
        if (typeof game.getIsAuto === 'function' && game.getIsAuto() && typeof game.endAuto === 'function') {
          game.endAuto();
        }
        game.isCanClick = true;
        if (!game.isBuyGame && !game.isFreeGame && typeof game.setBtnState === 'function') {
          game.setBtnState(true);
        }
        if (typeof game.getUserInfo === 'function') game.getUserInfo();
      } catch (error) {
        console.warn('[Seth2 Adapter] Failed to recover game controls', error);
      }
    }, 0);
  }

  function recoverAnimationFailure(error, returnData) {
    console.error('[Seth2 Adapter] Spin animation failed; recovering game flow', error);
    notifyParent('seth2:animation-error', {
      message: error && error.message ? error.message : 'Spin animation failed',
    });
    window.setTimeout(function () {
      try {
        var Game = window.__require && window.__require('Game').default;
        var eventModule = window.__require && window.__require('GameEvent');
        var game = Game && Game.instance;
        if (!game) return;
        if (game.colMain) game.colMain.isRoll = false;
        if (typeof game.getIsAuto === 'function' && game.getIsAuto() && typeof game.endAuto === 'function') {
          game.endAuto();
        }
        game.isCanClick = true;

        var eventBus = eventModule && eventModule.default && eventModule.default.getInstance();
        var eventNames = eventModule && eventModule.GameEventName;
        if (eventBus && eventNames) {
          eventBus.emit(eventNames.GAME_END_REFRESH_MY_SCORE);
          if (game.isBuyGame) {
            eventBus.emit(eventNames.BUY_GAME_NEXT_STEP);
            return;
          }
          if (game.isFreeGame) {
            eventBus.emit(eventNames.FREE_GAME_NEXT_STEP);
            return;
          }
          if (returnData && returnData.is_sjc === 1) {
            game.isFreeGame = true;
            game.freeGameTime = returnData.freeGameCount || 0;
            game.freeGameState = 0;
            eventBus.emit(eventNames.FREE_GAME_NEXT_STEP);
            return;
          }
        } else if (typeof game.getUserInfo === 'function') {
          game.getUserInfo();
        }

        if (typeof game.setBtnState === 'function') game.setBtnState(true);
      } catch (recoveryError) {
        console.warn('[Seth2 Adapter] Failed to recover a rejected spin animation', recoveryError);
      }
    }, 0);
  }

  function syncAuthoritativeResultMultiplier(game) {
    var returnData = game && game.colMain && game.colMain.returnData;
    var baseScore = Number(game && game.cur_top_ying_fen);
    var totalGold = Number(returnData && returnData.total_gold);
    if (!Number.isFinite(baseScore) || baseScore <= 0 || !Number.isFinite(totalGold)) return;
    var multiplier = totalGold / baseScore;
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    game.cur_top_mul = multiplier;
    if (game.ttf_top_mul) game.ttf_top_mul.string = String(multiplier);
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
    var request = null;
    if (socket.readyState !== LocalGameSocket.OPEN) throw new Error('Socket is not open');
    socket._queue = socket._queue.then(function () {
      request = JSON.parse(raw);
      if (
        request.type === 'useMachine' ||
        request.type === 'gameToolsList' ||
        request.type === 'buyFreeGame'
      ) {
        request.isFreeModel = 0;
      }
      return authorizedFetch(protocolUrl, request, false).then(function (payload) {
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
      recoverGameInteraction(request);
    });
  };

  LocalGameSocket.prototype.close = function () {
    if (this.readyState === LocalGameSocket.CLOSED) return;
    this.readyState = LocalGameSocket.CLOSING;
    this.readyState = LocalGameSocket.CLOSED;
    if (this.onclose) this.onclose({ type: 'close', code: 1000, wasClean: true });
  };

  window.WebSocket = LocalGameSocket;
  window.__YachiyoSeth2AdapterTest = {
    publicGameError: publicGameError,
    recoverAnimationFailure: recoverAnimationFailure,
    syncAuthoritativeResultMultiplier: syncAuthoritativeResultMultiplier,
  };

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
        if (originalStart) {
          try {
            originalStart.call(this);
          } catch (error) {
            console.warn('[Seth2 Adapter] Original login startup failed; continuing with Yachiyo login', error);
          }
        }
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

  function patchGameModules() {
    if (gameModulesPatched || typeof window.__require !== 'function') return;
    try {
      var Game = window.__require('Game').default;
      var ColMain = window.__require('ColMain').default;
      var RoomListView = window.__require('RoomListView').default;
      if (!Game || !ColMain || !RoomListView) return;

      var originalGameOnLoad = Game.prototype.onLoad;
      Game.prototype.onLoad = function () {
        if (originalGameOnLoad) originalGameOnLoad.call(this);
        this.cur_game_model = 1;
      };

      var originalShowResultScore = Game.prototype.showResultScore;
      Game.prototype.showResultScore = function () {
        syncAuthoritativeResultMultiplier(this);
        return originalShowResultScore.call(this);
      };

      var originalColMainStartRoll = ColMain.prototype.startRoll;
      ColMain.prototype.startRoll = function (returnData) {
        try {
          var pending = originalColMainStartRoll.call(this, returnData);
          if (!pending || typeof pending.catch !== 'function') return pending;
          return pending.catch(function (error) {
            recoverAnimationFailure(error, returnData);
          });
        } catch (error) {
          recoverAnimationFailure(error, returnData);
          return Promise.resolve();
        }
      };

      var findNodeByName = function (node, name) {
        if (!node) return null;
        if (node.name === name) return node;
        var children = node.children || [];
        for (var index = 0; index < children.length; index += 1) {
          var match = findNodeByName(children[index], name);
          if (match) return match;
        }
        return null;
      };

      var enforceFormalRoom = function (room) {
        var roomRoot = room && room.node;
        if (!roomRoot) return;
        var trialButton = findNodeByName(roomRoot, 'BtnFree');
        var enterButton = findNodeByName(roomRoot, 'BtnEnter');
        if (trialButton && enterButton && trialButton.parent === enterButton.parent) {
          enterButton.x = (trialButton.x + enterButton.x) / 2;
        }
        if (trialButton) trialButton.active = false;
        if (room.ttf_game_coin && room.ttf_game_coin.node) room.ttf_game_coin.node.active = false;
        var hideTrialLabel = function (node) {
          if (!node) return;
          var label = node.getComponent && node.getComponent(cc.Label);
          if (label && (label.string === '免費體驗' || label.string === '遊戲幣餘額')) {
            node.active = false;
          }
          (node.children || []).forEach(hideTrialLabel);
        };
        hideTrialLabel(roomRoot);
      };

      var originalRoomOnLoad = RoomListView.prototype.onLoad;
      RoomListView.prototype.onLoad = function () {
        if (originalRoomOnLoad) originalRoomOnLoad.call(this);
        enforceFormalRoom(this);
      };
      RoomListView.prototype.clickFree = function () {
        return this.clickEnterGame();
      };
      gameModulesPatched = true;
      console.info('[Seth2 Adapter] formal-play-only room enabled');
    } catch (_error) {
      // The game bundle loads after authentication; keep polling until it is available.
    }
  }

  var patchTimer = window.setInterval(function () {
    patchClient();
    patchGameModules();
    if (patched && gameModulesPatched) window.clearInterval(patchTimer);
  }, 10);
  patchClient();
  patchGameModules();
}());
