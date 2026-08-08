(function () {
  'use strict';

  var NativeXHR = window.XMLHttpRequest;
  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || (window.location.origin + '/api')).replace(/\/$/, '');
  var gameApi = apiBase + '/games/h5-slots';
  var gameCode = params.get('gameId') || '161';
  var requestTimeoutMs = 15000;
  var refreshInFlight = null;
  var latestSession = null;
  var ROOM_BET_AMOUNTS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  var FISH_GAME_CODES = ['2', '12', '13', '14'];
  var isFishGame = FISH_GAME_CODES.indexOf(gameCode) !== -1;
  var fishRoomBet = 10;
  var fishBullets = {};
  var fishSequence = 0;
  var fishTargets = [];

  function installAudioDecodeFallback() {
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !AudioContextClass.prototype.decodeAudioData) return;
    var originalDecodeAudioData = AudioContextClass.prototype.decodeAudioData;
    AudioContextClass.prototype.decodeAudioData = function (audioData, onSuccess, onError) {
      var context = this;
      function silentBuffer(error) {
        console.warn('[Yachiyo H5 Slots] replaced an unreadable source audio asset with silence', error);
        return context.createBuffer(1, 1, context.sampleRate || 44100);
      }
      if (typeof onSuccess === 'function') {
        var callbackDecode = originalDecodeAudioData.call(context, audioData, onSuccess, function (error) {
          onSuccess(silentBuffer(error));
        });
        return callbackDecode && typeof callbackDecode.catch === 'function'
          ? callbackDecode.catch(function () {})
          : callbackDecode;
      }
      var decoded = originalDecodeAudioData.call(context, audioData);
      return decoded && typeof decoded.catch === 'function'
        ? decoded.catch(function (error) { return silentBuffer(error); })
        : decoded;
    };
  }

  installAudioDecodeFallback();

  var GAME_SHAPES = {
    '113': { family: 'classic', cells: 15 },
    '116': { family: 'classic', cells: 15 },
    '135': { family: 'classic', cells: 15 },
    '155': { family: 'classic', cells: 20 },
    '160': { family: 'classic', cells: 15 },
    '161': { family: 'classic', cells: 9, multiplierWheel: true },
    '188': { family: 'classic', cells: 9 },
    '232': { family: 'classic', cells: 9 },
    '244': { family: 'classic', cells: 15 },
    '252': { family: 'classic', cells: 15 },
    '262': { family: 'classic', cells: 9 },
    '264': { family: 'classic', cells: 12 },
    '269': { family: 'mahjong', cells: 20 },
    '271': { family: 'mahjong', cells: 25 },
    '273': { family: 'tumble', cells: 30 },
    '276': { family: 'step', cells: 15 },
    '278': { family: 'ways', cells: 30 },
    '281': { family: 'step', cells: 15 },
    '301': { family: 'classic', cells: 15 },
    '302': { family: 'classic', cells: 9, extraCard: true },
    '321': { family: 'tumble', cells: 30 },
  };

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
      // The original Cocos build remains usable when opened outside the platform shell.
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
      // Parent receives the refreshed values through postMessage below.
    }
    notifyParent('h5-slots:tokens', {
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
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
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

  function localSession() {
    if (latestSession) return Promise.resolve(latestSession);
    return authorizedRequest(gameApi + '/session', 'GET', null, false).then(function (payload) {
      latestSession = payload.user;
      return latestSession;
    });
  }

  function routeFor(rawUrl) {
    var parsed;
    try {
      parsed = new URL(rawUrl, window.location.href);
    } catch (_error) {
      return { kind: 'blocked' };
    }
    if (parsed.pathname.endsWith('/checkVersion')) return { kind: 'version' };
    if (parsed.pathname.endsWith('/getAPIUserInfo')) return { kind: 'session' };
    if (parsed.pathname.endsWith('/ml_api')) return { kind: 'register' };
    if (parsed.origin === window.location.origin) return null;
    return { kind: 'blocked' };
  }

  function BridgeXHR() {
    this._native = null;
    this._route = null;
    this._listeners = {};
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
    this._dispatch('loadstart');
    if (this._route.kind === 'version') return this._complete({ code: 1 });
    if (this._route.kind === 'register') {
      this._complete({ status: 2 });
      window.setTimeout(ensureLobbyLogin, 50);
      return;
    }
    if (this._route.kind === 'blocked') {
      return this._complete({ code: 0, status: 0, message: 'External service disabled by Yachiyo' });
    }
    localSession()
      .then(function (session) {
        bridge._complete({
          code: 1,
          balance: Number(session.balance || 0),
          uid: session.id,
          nickname: session.nickname,
        });
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '遊戲伺服器連線失敗';
        notifyParent('h5-slots:error', { message: message });
        bridge._complete({ code: 0, message: message });
      });
  };

  BridgeXHR.prototype._complete = function (payload) {
    var bridge = this;
    window.setTimeout(function () {
      bridge._status = 200;
      bridge._statusText = 'OK';
      bridge._responseText = JSON.stringify(payload);
      bridge._response = bridge._responseType === 'json' ? payload : bridge._responseText;
      bridge._readyState = BridgeXHR.DONE;
      bridge._dispatch('readystatechange');
      bridge._dispatch('load');
      bridge._dispatch('loadend');
    }, 0);
  };

  function ensureLobbyLogin() {
    if (!window.cc) return;
    try {
      var canvas = window.cc.find('Canvas');
      var lobby = canvas && canvas.getComponent('LobbyMain');
      var network = lobby && lobby.netWork;
      if (!network || network.socket) return;
      network.accountChange = true;
      network.loginAccount_Function(
        'http://127.0.0.1:0',
        (latestSession && latestSession.username) || 'testplayer',
        'yachiyo-local'
      );
    } catch (error) {
      console.error('[Yachiyo H5 Slots] unable to continue local lobby login', error);
    }
  }

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
    this._listeners[type] = (this._listeners[type] || []).filter(function (candidate) {
      return candidate !== listener;
    });
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
    ['readystatechange', 'load', 'error', 'timeout', 'abort', 'loadstart', 'loadend', 'progress'].forEach(function (type) {
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
    responseURL: { get: function () { return this._native ? this._native.responseURL : ''; } },
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

  function FakeSocket() {
    this.connected = true;
    this._connectAnnounced = false;
    this.id = 'yachiyo-local';
    this.$events = {};
    var socket = this;
    window.setTimeout(function () {
      if (socket._connectAnnounced) return;
      socket._connectAnnounced = true;
      socket._trigger('connected', true);
      socket._trigger('connect');
    }, 0);
  }

  FakeSocket.prototype.on = function (event, handler) {
    (this.$events[event] || (this.$events[event] = [])).push(handler);
    if (this.connected && this._connectAnnounced && (event === 'connected' || event === 'connect')) {
      window.setTimeout(function () { handler(true); }, 0);
    }
    return this;
  };
  FakeSocket.prototype.once = function (event, handler) {
    var socket = this;
    function onceHandler(payload) {
      socket.off(event, onceHandler);
      handler(payload);
    }
    return this.on(event, onceHandler);
  };
  FakeSocket.prototype.off = function (event, handler) {
    if (!event) this.$events = {};
    else if (!handler) delete this.$events[event];
    else this.$events[event] = (this.$events[event] || []).filter(function (candidate) {
      return candidate !== handler;
    });
    return this;
  };
  FakeSocket.prototype.removeListener = FakeSocket.prototype.off;
  FakeSocket.prototype.removeListen = FakeSocket.prototype.off;
  FakeSocket.prototype.removeAllListeners = function (event) { return this.off(event); };
  FakeSocket.prototype._trigger = function (event, payload) {
    (this.$events[event] || []).slice().forEach(function (handler) {
      try {
        handler(payload);
      } catch (error) {
        console.error('[Yachiyo H5 Slots] event handler failed', event, error);
      }
    });
  };
  FakeSocket.prototype.connect = function () {
    this.connected = true;
    this._trigger('connect');
    return this;
  };
  FakeSocket.prototype.disconnect = function () {
    if (!this.connected) return this;
    this.connected = false;
    this._trigger('disconnect', 'yachiyo scene switch');
    return this;
  };
  FakeSocket.prototype.close = FakeSocket.prototype.disconnect;
  FakeSocket.prototype.emit = function (event, rawPayload) {
    var socket = this;
    if (event === 'login') {
      if (latestSession) {
        window.setTimeout(function () {
          socket._trigger('loginResult', buildLobbyLogin(latestSession));
        }, 0);
        return this;
      }
      localSession().then(function (session) {
        socket._trigger('loginResult', buildLobbyLogin(session));
      }).catch(reportSocketError);
    } else if (event === 'LoginGame') {
      if (latestSession) {
        window.setTimeout(function () {
          emitGameLogin(socket, latestSession);
        }, 0);
        return this;
      }
      localSession().then(function (session) {
        emitGameLogin(socket, session);
      }).catch(reportSocketError);
    } else if (event === 'LoginRoom') {
      emitRoomLogin(socket);
    } else if (event === 'fishShoot') {
      handleFishShoot(socket, rawPayload);
    } else if (event === 'fishHit') {
      handleFishCollision(socket, rawPayload);
    } else if (event === 'changePower') {
      socket._trigger('changePowerResult', parseSocketPayload(rawPayload));
    } else if (event === 'changeCannon') {
      socket._trigger('changeCannonResult', parseSocketPayload(rawPayload));
    } else if (event === 'LoginfreeCount') {
      window.setTimeout(function () {
        socket._trigger('LoginfreeCountResult', { ResultCode: 1, freeCount: 0, freeType: 0 });
      }, 0);
    } else if (event === 'history') {
      authorizedRequest(gameApi + '/history', 'GET', null, false)
        .then(function (payload) { socket._trigger('historyResult', payload); })
        .catch(reportSocketError);
    } else if (event === 'lottery') {
      settleSpin(socket, rawPayload);
    } else if (event === 'freeTimeType') {
      window.setTimeout(function () {
        socket._trigger('freeTimeTypeResult', { ResultCode: 1, ResultData: { type: 1 } });
      }, 0);
    }
    return this;
  };

  function emitGameLogin(socket, session) {
    if (isFishGame && window.cc) {
      try {
        var lobbyCanvas = window.cc.find('Canvas');
        var lobby = lobbyCanvas && lobbyCanvas.getComponent('LobbyMain');
        if (lobby && lobby.netWork && !lobby.netWork.socket) {
          lobby.netWork.socket = { disconnect: function () {} };
        }
      } catch (_error) {
        // Some source variants keep the lobby socket elsewhere; their own handler still switches scenes.
      }
    }
    socket._trigger('loginGameResult', {
      resultid: 1,
      Obj: {
        nGamblingWinPool: 1000000,
        score: Number(session.balance || 0),
        bet: fishRoomBet,
        cannonConfig: [],
      },
    });
    if (!isFishGame) emitRoomLogin(socket);
    notifyParent('h5-slots:ready', { balance: Number(session.balance || 0), gameCode: gameCode });
  }

  function emitRoomLogin(socket) {
    if (isFishGame) {
      var session = latestSession || {};
      socket._trigger('LoginRoomResult', {
        ResultCode: 1,
        ResultData: {
          TableId: 'yachiyo-local-table',
          seatId: 0,
          userList: [{
            seatId: 0,
            nickname: session.nickname || session.username || 'testplayer',
            score: Number(session.balance || 0),
            diamond: 0,
            userId: session.id,
            headimgurl: '',
          }],
        },
      });
      startFishStream(socket);
      return;
    }
    socket._trigger('LoginRoomResult', {
      ResultCode: 1,
      ResultData: {
        roomConfig: {
          roomMul: Number(params.get('roomMul') || 0.2),
          roomBetList: ROOM_BET_AMOUNTS.slice(),
        },
      },
    });
  }

  function parseSocketPayload(rawPayload) {
    try {
      return typeof rawPayload === 'string' ? JSON.parse(rawPayload) : (rawPayload || {});
    } catch (_error) {
      return {};
    }
  }

  function handleFishShoot(socket, rawPayload) {
    var shot = parseSocketPayload(rawPayload);
    var bulletId = String(shot.bulletId == null ? Date.now() : shot.bulletId);
    var amount = Math.max(10, Number(shot.bet || 1) * fishRoomBet);
    fishBullets[bulletId] = { hit: null, result: null };
    socket._trigger('fishShoot', shot);
    authorizedRequest(gameApi + '/spin', 'POST', {
      gameCode: gameCode,
      amount: amount,
      isBuyFree: false,
    }, false)
      .then(function (result) {
        var bullet = fishBullets[bulletId];
        if (!bullet) return;
        bullet.result = result;
        latestSession = latestSession || {};
        latestSession.balance = Number(result.newBalance || 0);
        resolveFishHit(socket, bulletId);
        notifyParent('h5-slots:balance', {
          balance: Number(result.newBalance || 0),
          gameCode: gameCode,
          spinId: result.betId,
        });
      })
      .catch(function (error) {
        delete fishBullets[bulletId];
        reportSocketError(error);
      });
  }

  function handleFishCollision(socket, rawPayload) {
    var hit = parseSocketPayload(rawPayload);
    var bulletId = String(hit.bulletId == null ? '' : hit.bulletId);
    var bullet = fishBullets[bulletId];
    if (!bullet) return;
    bullet.hit = hit;
    resolveFishHit(socket, bulletId);
  }

  function resolveFishHit(socket, bulletId) {
    var bullet = fishBullets[bulletId];
    if (!bullet || !bullet.result) return;
    var payout = Number(bullet.result.payout || 0);
    var targetFishId = bullet.hit && bullet.hit.fishId
      ? bullet.hit.fishId
      : fishTargets.pop();
    if (payout > 0) {
      socket._trigger('HitResult', {
        ResultCode: 1,
        ResultData: {
          fishId: targetFishId,
          userId: (latestSession && latestSession.id) || (bullet.hit && bullet.hit.uid),
          hitSocre: payout / fishRoomBet,
        },
      });
    }
    syncFishBalance(Number(bullet.result.newBalance || 0));
    delete fishBullets[bulletId];
  }

  function syncFishBalance(balance) {
    if (!window.cc || !Number.isFinite(balance)) return;
    function applyBalance() {
      try {
        var canvas = window.cc.find('Canvas');
        var scene = window.cc.director.getScene();
        var main = canvas && scene && canvas.getComponent(scene.name);
        var seatId = main && main.fishNet ? main.fishNet.seatId : 0;
        if (main && main.playerList && main.playerList[seatId]) {
          main.playerList[seatId].score = balance;
        }
        if (main && main.pInfo) main.pInfo.playerCoin = balance;
      } catch (_error) {
        // The parent balance remains authoritative if a source scene uses a different component layout.
      }
    }
    applyBalance();
    window.setTimeout(applyBalance, 1200);
  }

  function startFishStream(socket) {
    function spawnFish() {
      if (!socket.connected) return;
      if (latestSession) syncFishBalance(Number(latestSession.balance || 0));
      fishSequence += 1;
      var fishId = 'yachiyo-fish-' + fishSequence;
      fishTargets.push(fishId);
      if (fishTargets.length > 24) fishTargets.shift();
      socket._trigger('FishOut', {
        fishType: 1 + (fishSequence % 4),
        fishPath: 0,
        fishLineup: 0,
        fishCount: 1,
        fishId: [fishId],
      });
      window.setTimeout(spawnFish, 1400);
    }
    window.setTimeout(spawnFish, 600);
  }

  function buildLobbyLogin(session) {
    return {
      resultid: 1,
      win_pool: 1000000,
      Obj: {
        account: session.username,
        sign: 'yachiyo-local',
        id: session.id,
        nickname: session.nickname,
        score: Number(session.balance || 0),
        diamond: 0,
        headimgurl: '',
        ChannelType: '',
        proplist: [0, 0],
        phoneNo: '',
        official: false,
      },
    };
  }

  function settleSpin(socket, rawPayload) {
    var payload;
    try {
      payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : (rawPayload || {});
    } catch (_error) {
      payload = {};
    }
    var requestedAmount = Number(payload.nBetList && payload.nBetList[0]);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      socket._trigger('lotteryResult', { ResultCode: -2, msg: '投注金額不正確' });
      return;
    }
    var amount = Math.max(ROOM_BET_AMOUNTS[0], requestedAmount);
    authorizedRequest(gameApi + '/spin', 'POST', {
      gameCode: gameCode,
      amount: amount,
      isBuyFree: payload.isBuyFree === 1,
    }, false)
      .then(function (result) {
        latestSession = latestSession || {};
        latestSession.balance = Number(result.newBalance || 0);
        socket._trigger('lotteryResult', buildLotteryResponse(result));
        notifyParent('h5-slots:balance', {
          balance: Number(result.newBalance || 0),
          gameCode: gameCode,
          spinId: result.betId,
        });
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '遊戲伺服器連線失敗';
        socket._trigger('lotteryResult', buildLotteryResponse({
          grid: [],
          payout: 0,
          multiplier: 0,
          newBalance: Number(latestSession && latestSession.balance || 0),
        }));
        notifyParent('h5-slots:error', { message: message });
      });
  }

  function buildLotteryResponse(result) {
    var shape = GAME_SHAPES[gameCode] || GAME_SHAPES['161'];
    var payout = Number(result.payout || 0);
    var balance = Number(result.newBalance || 0);
    var symbols = flattenSymbols(result.grid, shape.cells);
    var data = {
      userscore: balance,
      winscore: payout,
      freeCount: 0,
      getFreeTime: { bFlag: false, nFreeTime: 0 },
    };

    if (shape.family === 'mahjong') {
      data.viewarray = [buildStep(symbols, payout, true)];
    } else if (shape.family === 'step') {
      data.viewarray = [buildStep(symbols, payout, false)];
    } else if (shape.family === 'ways') {
      data.viewarray = [buildWaysStep(symbols, payout)];
    } else if (shape.family === 'tumble') {
      data.viewarray = buildTumble(symbols, payout);
      data.aw = payout;
    } else {
      data.viewarray = buildClassic(symbols, payout, result.multiplier, shape);
    }
    return { ResultCode: 1, ResultData: data };
  }

  function flattenSymbols(grid, count) {
    var source = [];
    (Array.isArray(grid) ? grid : []).forEach(function (column) {
      (Array.isArray(column) ? column : []).forEach(function (symbol) {
        source.push((Number(symbol) % 6) + 1);
      });
    });
    if (!source.length) source = [1, 2, 3, 4, 5, 6];
    var output = [];
    for (var index = 0; index < count; index += 1) output.push(source[index % source.length]);
    return output;
  }

  function falseList(length) {
    return Array.from({ length: length }, function () { return false; });
  }

  function buildClassic(symbols, payout, multiplier, shape) {
    return {
      nHandCards: symbols,
      nWinCards: falseList(symbols.length),
      nWinLinesDetail: [],
      nWinLines: [],
      nWinDetail: [],
      fMultiple: shape.multiplierWheel ? Math.max(1, Number(multiplier || 1)) : 0,
      getFreeTime: { bFlag: false, nFreeTime: 0 },
      getOpenBox: { bFlag: false, card: 0 },
      getAllSame: { bFlag: false },
      getBigWin: { bFlag: false, isStart: false },
      exCard: shape.extraCard ? 0 : undefined,
      winEx: false,
      user_score: 0,
      winscore: payout,
    };
  }

  function buildStep(symbols, payout, mahjong) {
    return {
      nHandCards: symbols,
      nWinCards: falseList(symbols.length),
      nWinLinesDetail: [],
      nWinLines: [],
      nWinDetail: [],
      goldCards: mahjong ? [] : undefined,
      winscore: payout,
      user_score: Number(latestSession && latestSession.balance || 0),
      getFreeTime: { bFlag: false, nFreeTime: 0 },
    };
  }

  function buildWaysStep(symbols, payout) {
    return {
      nHandCards: symbols,
      nWinCards: falseList(symbols.length),
      nWinCards_top: falseList(4),
      nWinLinesDetail: [],
      nWinLines: [],
      nWinDetail: [],
      trl: [1, 2, 3, 4],
      sr: [],
      srd: [],
      winscore: payout,
      user_score: Number(latestSession && latestSession.balance || 0),
    };
  }

  function buildTumble(symbols, payout) {
    return {
      nst: 1,
      aw: payout,
      tw: payout,
      ctw: payout,
      cb: 0,
      orl: symbols,
      rl: symbols,
      wp: {},
      gm: 0,
      fs: null,
      ts: null,
      df: [],
    };
  }

  function reportSocketError(error) {
    var message = error && error.message ? error.message : '遊戲伺服器連線失敗';
    notifyParent('h5-slots:error', { message: message });
  }

  function fakeIo() {
    return new FakeSocket();
  }
  fakeIo.connect = fakeIo;
  fakeIo.io = fakeIo;

  window.__YachiyoFakeIo = fakeIo;
  window.XMLHttpRequest = BridgeXHR;
  try {
    Object.defineProperty(window, 'io', {
      configurable: true,
      get: function () { return fakeIo; },
      set: function () { /* Keep all legacy socket traffic local. */ },
    });
  } catch (_error) {
    window.io = fakeIo;
  }
  window.SocketIO = fakeIo;
  console.info('[Yachiyo H5 Slots] authenticated local bridge enabled for game', gameCode);
}());
