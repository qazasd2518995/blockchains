(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || window.location.origin + '/api').replace(/\/$/, '');
  var gameApi = apiBase + '/games/thor2';
  var refreshInFlight = null;
  var sessionInFlight = null;
  var platformSession = null;
  var activeSequence = null;
  var requestTimeoutMs = 60000;
  var pendingOperationKey = 'bg.thor2.original.pending-operation';
  var capturedAudioContexts = [];
  var NativeWebSocket = window.WebSocket;
  var legalFeatureMultipliers = {
    2: true,
    3: true,
    4: true,
    5: true,
    6: true,
    8: true,
    10: true,
    12: true,
    15: true,
    20: true,
    25: true,
    50: true,
    100: true,
    250: true,
    500: true,
    1000: true,
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
      var persisted = raw ? JSON.parse(raw) : null;
      return persisted && persisted.state ? persisted.state : {};
    } catch (_error) {
      return {};
    }
  }

  function notifyParent(type, payload) {
    try {
      window.parent.postMessage(Object.assign({ type: type }, payload || {}), window.location.origin);
    } catch (_error) {
      // Standalone diagnostics have no parent shell.
    }
  }

  function publicError(payload, fallback) {
    var message = payload && (payload.message || payload.error);
    if (
      (payload && payload.code === 'INTERNAL') ||
      /prisma\.|query execution|prismaclient|postgres(?:ql)?|connectorerror/i.test(
        String(message || ''),
      )
    ) {
      return '遊戲結算暫時失敗，請稍後再試';
    }
    return String(message || fallback);
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
      // The parent Zustand store is updated through postMessage as well.
    }
    notifyParent('thor2:tokens', { accessToken: accessToken, refreshToken: refreshToken });
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
            throw new Error(publicError(body, '登入已過期，請回到大廳重新登入'));
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

  function authorizedFetch(path, method, body, retried) {
    var auth = readAuth();
    if (!auth.accessToken) return Promise.reject(new Error('找不到登入憑證，請回到大廳重新登入'));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = window.setTimeout(function () {
      if (controller) controller.abort();
    }, requestTimeoutMs);
    return fetch(gameApi + path, {
      method: method || 'GET',
      headers: Object.assign(
        { Authorization: 'Bearer ' + auth.accessToken },
        body === undefined ? {} : { 'Content-Type': 'application/json' },
      ),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (response.status === 401 && !retried) {
          return refreshAccessToken().then(function () {
            return authorizedFetch(path, method, body, true);
          });
        }
        return response.json().then(function (payload) {
          if (!response.ok) throw new Error(publicError(payload, '遊戲伺服器拒絕請求'));
          return payload;
        });
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') throw new Error('遊戲伺服器回應逾時，請稍後重試');
        throw error;
      })
      .finally(function () {
        window.clearTimeout(timeout);
      });
  }

  function loadSession(force) {
    if (sessionInFlight && !force) return sessionInFlight;
    sessionInFlight = authorizedFetch('/session', 'GET')
      .then(function (session) {
        platformSession = session;
        notifyParent('thor2:ready', { balance: session.balance });
        return session;
      })
      .catch(function (error) {
        notifyParent('thor2:error', { message: error.message });
        throw error;
      })
      .finally(function () {
        sessionInFlight = null;
      });
    return sessionInFlight;
  }

  function installAudioContextCapture() {
    var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (
      typeof AudioContextConstructor !== 'function' ||
      AudioContextConstructor.__qmoneyThor2Capture
    ) {
      return;
    }
    function CapturedAudioContext() {
      var args = Array.prototype.slice.call(arguments);
      var context = Reflect.construct(AudioContextConstructor, args);
      if (capturedAudioContexts.indexOf(context) < 0) capturedAudioContexts.push(context);
      return context;
    }
    CapturedAudioContext.prototype = AudioContextConstructor.prototype;
    CapturedAudioContext.__qmoneyThor2Capture = true;
    try {
      Object.setPrototypeOf(CapturedAudioContext, AudioContextConstructor);
      window.AudioContext = CapturedAudioContext;
      if (window.webkitAudioContext === AudioContextConstructor) {
        window.webkitAudioContext = CapturedAudioContext;
      }
    } catch (_error) {
      // Read-only WebViews still unlock from the Cocos canvas gesture.
    }
  }

  function unlockAudio() {
    capturedAudioContexts = capturedAudioContexts.filter(function (context) {
      if (!context || context.state === 'closed') return false;
      if (context.state !== 'running' && typeof context.resume === 'function') {
        try {
          var resumed = context.resume();
          if (resumed && typeof resumed.catch === 'function') resumed.catch(function () {});
        } catch (_error) {
          // A later real gesture retries the context.
        }
      }
      return true;
    });
  }

  installAudioContextCapture();
  window.__QmoneyThor2UnlockAudio = unlockAudio;
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== window.parent || !event.data)
      return;
    if (event.data.type === 'thor2:audio-sync' || event.data.type === 'thor2:audio-unlock') {
      unlockAudio();
    }
  });
  ['pointerdown', 'touchend', 'mouseup', 'keydown'].forEach(function (eventName) {
    window.addEventListener(eventName, unlockAudio, { capture: true, passive: true });
  });

  function createUserInfo(session) {
    var auth = readAuth();
    var user = auth.user || {};
    return {
      online: '1',
      account: String(user.username || 'qmoney-player'),
      webid: 'QMONEY',
      lang: params.get('lang') || 'zh-TW',
      server: 'thor2.local',
      port: '80',
      dir: '',
      gameServer: 'ws://thor2.local/RewardableSlotUser',
      userIP: '127.0.0.1',
      Extra: {
        SystemCode: 'QMONEY',
        Company: 'QMONEY',
        Device: 'web',
        GameTokenId: 'qmoney-thor2-local',
        Mode: 4,
        SingleCredit: 'true',
        HomeIsEnabled: true,
        FullScreenIsEnabled: false,
        EnableEventSystem: false,
        EnableHistoryButton: false,
        EnableBuyFeature: true,
        ShowAmountType: 0,
        ShowHistoryType: 0,
        JackpotDisplayEnabled: false,
        SerialNumDisplayEnabled: true,
        RestartBtnEnabled: true,
        CloseBtnEnabled: true,
        BetSettings: {
          BetList: [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].map(function (betLevel) {
            return { BetLevel: betLevel, Denom: 0.05 };
          }),
          BetDefaultIndex: 0,
          ExtraBetList: [false, true],
          ExtraBetDefaultIndex: 0,
          Line: 0,
          MiniBet: 20,
        },
        ReconnectIntervals: [1, 2, 3],
        InitialBalance: session.balance,
      },
    };
  }

  // Replace only the provider session/socket boundary. Rendering, controls,
  // rules panels, effects and audio remain the archived original Cocos build.
  window.getUserInfo = function (callback) {
    loadSession(false)
      .then(function (session) {
        window.LoginJSON = createUserInfo(session);
        callback(window.LoginJSON);
      })
      .catch(function () {
        callback({ error: '-101' });
      });
  };

  function cryptoConfig() {
    return {
      key: CryptoJS.enc.Utf8.parse('A+x*f_1+'),
      iv: CryptoJS.enc.Utf8.parse('eskOnlineVec'),
    };
  }

  function decryptMessage(value) {
    var config = cryptoConfig();
    var result = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(value), salt: '', iv: config.iv },
      config.key,
      { iv: config.iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
    );
    return CryptoJS.enc.Utf8.stringify(result);
  }

  function encryptMessage(payload) {
    var config = cryptoConfig();
    var result = CryptoJS.DES.encrypt(JSON.stringify(payload), config.key, {
      iv: config.iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return CryptoJS.enc.Base64.stringify(result.ciphertext);
  }

  function LocalWebSocket(url, protocols) {
    if (String(url).indexOf('thor2.local') < 0) {
      return protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);
    }
    this.url = String(url);
    this.protocol = '';
    this.extensions = '';
    this.binaryType = 'blob';
    this.bufferedAmount = 0;
    this.readyState = LocalWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this._listeners = { open: [], message: [], error: [], close: [] };
    var socket = this;
    window.setTimeout(function () {
      if (socket.readyState !== LocalWebSocket.CONNECTING) return;
      socket.readyState = LocalWebSocket.OPEN;
      socket._dispatch('open', { type: 'open', target: socket });
    }, 0);
  }

  LocalWebSocket.CONNECTING = 0;
  LocalWebSocket.OPEN = 1;
  LocalWebSocket.CLOSING = 2;
  LocalWebSocket.CLOSED = 3;
  LocalWebSocket.prototype.CONNECTING = 0;
  LocalWebSocket.prototype.OPEN = 1;
  LocalWebSocket.prototype.CLOSING = 2;
  LocalWebSocket.prototype.CLOSED = 3;
  LocalWebSocket.prototype.addEventListener = function (type, listener) {
    if (this._listeners[type] && typeof listener === 'function') this._listeners[type].push(listener);
  };
  LocalWebSocket.prototype.removeEventListener = function (type, listener) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(function (candidate) {
      return candidate !== listener;
    });
  };
  LocalWebSocket.prototype._dispatch = function (type, event) {
    var handler = this['on' + type];
    if (typeof handler === 'function') handler.call(this, event);
    (this._listeners[type] || []).slice().forEach(function (listener) {
      listener.call(this, event);
    }, this);
  };
  LocalWebSocket.prototype._respond = function (payload) {
    if (this.readyState !== LocalWebSocket.OPEN) return;
    var event = { type: 'message', target: this, data: encryptMessage(payload) };
    this._dispatch('message', event);
  };
  LocalWebSocket.prototype.send = function (value) {
    if (this.readyState !== LocalWebSocket.OPEN) throw new Error('WebSocket is not open');
    if (value === 'Egret') return;
    var socket = this;
    window.setTimeout(function () {
      try {
        var request = JSON.parse(decryptMessage(String(value)));
        handleRequest(socket, request);
      } catch (error) {
        reportProtocolError(socket, error);
      }
    }, 0);
  };
  LocalWebSocket.prototype.close = function (code, reason) {
    if (this.readyState === LocalWebSocket.CLOSED) return;
    this.readyState = LocalWebSocket.CLOSING;
    var socket = this;
    window.setTimeout(function () {
      socket.readyState = LocalWebSocket.CLOSED;
      socket._dispatch('close', {
        type: 'close',
        target: socket,
        code: Number(code) || 1000,
        reason: String(reason || ''),
        wasClean: true,
      });
    }, 0);
  };

  window.WebSocket = LocalWebSocket;

  function handleRequest(socket, request) {
    var type = String(request && request.Type);
    if (type === 'Ping') {
      socket._respond({ Type: 'Pong', Timestamp: Date.now() });
      return;
    }
    if (type === 'PlayerReqestLogin') {
      loadSession(false)
        .then(function (session) {
          socket._respond(loginResponse(session));
          window.setTimeout(function () {
            socket._respond(versionResponse());
          }, 0);
        })
        .catch(function (error) {
          reportProtocolError(socket, error);
        });
      return;
    }
    if (type === 'AutoCompleteStatesRequest') {
      socket._respond({
        Type: 'AutoCompleteStatesResponse',
        Enable: true,
        IsSuccess: true,
        States: [],
        Error: '',
        Timestamp: Date.now(),
      });
      return;
    }
    if (type === 'PlayerRequestStrip') {
      socket._respond(stripResponse());
      return;
    }
    if (type === 'CurrentCreditRequest') {
      respondCurrentCredit(socket);
      return;
    }
    if (
      type === 'PlayerRequestGameStart' ||
      type === 'PlayerRequestGameStartForDemo' ||
      type === 'PlayerRequestGameStartForQA' ||
      type === 'PlayerRequestGameStartForRecord' ||
      type === 'PlayerRequestBuyFeature'
    ) {
      handleGameStart(socket, request);
      return;
    }
    reportProtocolError(socket, new Error('不支援的原始遊戲請求：' + type));
  }

  function loginResponse(session) {
    return {
      Success: true,
      ErrCode: '',
      Msg: {
        Language: params.get('lang') || 'zh-TW',
        Denoms: [0.05, 0.1, 0.25, 0.5, 1],
        DefaultDenomIndex: 0,
        Bets: [1, 2, 5, 10, 20, 40, 100],
        DefaultBetIndex: 0,
        Lines: null,
        DefaultLineIndex: 0,
        AutoPlayEnable: true,
        RecoveryEnable: true,
        GambleEnable: false,
        GambleTimes: 0,
        GambleLimit: 0,
        CreditLimit: 10000000,
        WinLimit: 5000000,
        AccountingUnit: 1,
        PlayerCredit: Number(session.balance),
        Type: 'ServerResponseLoginMsgDetail',
      },
      HaveExtra: false,
      ExtraData: null,
      JackpotInfo: {
        PoolID: [0, 1, 2, 3],
        PoolName: [null, null, null, null],
        PoolAmt: [0, 0, 0, 0],
        HaveExtra: false,
        ExtraData: null,
        Type: 'ServerRequestJackpotInfo',
      },
      isUseJackpot: false,
      CurrencyRatio: 1,
      Type: 'ServerResponseLogin',
    };
  }

  function versionResponse() {
    return {
      ServerMode: 'Prod',
      Versions: {
        Server: 'qmoney-local',
        Game: '2.9.0',
        Math: '2.9.0',
        GameCommon: '1.5.0',
        MathCommon: '1.5.0',
        GameInterface: '2.9.0',
        Protocol: '1.9.0',
      },
      Type: 'NotifyVersions',
      Timestamp: Date.now(),
    };
  }

  function stripResponse() {
    var strip = [
      3, 9, 15, 10, 4, 11, 5, 13, 16, 6, 12, 9, 10, 17, 3, 4, 11, 18, 5, 6, 12, 13,
      9, 10, 19, 3, 4, 5, 11, 6, 12, 13,
    ];
    var strips = Array.from({ length: 12 }, function (_value, index) {
      return strip.slice(index % 8).concat(strip.slice(0, index % 8));
    });
    return {
      ErrCode: null,
      ExtraBetFeatureMsg: [{ ExtraData: {}, FeatureID: 0, MaximumBet: -1, Times: 1.25 }],
      ExtraData: JSON.stringify({
        Demo: {},
        DefaultLineIndex: 0,
        DefaultExtrabetIndex: 0,
        DefaultLineList: [20],
        DefaultExtraBet: [0],
      }),
      FeatureMsg: [
        { ExtraData: {}, FeatureID: 0, MaximumBet: -1, Times: 100 },
        { ExtraData: {}, FeatureID: 1, MaximumBet: 1000, Times: 500 },
        { ExtraData: {}, FeatureID: 2, MaximumBet: 60, Times: 4000 },
      ],
      HaveExtra: true,
      Msg: {
        MathName: 'PowerOfThor2-000129',
        RTP: '96.50',
        StripCount: 12,
        Strips: strips,
        SymbolID: [
          JSON.stringify({
            B1: '1',
            M1: '3',
            M2: '4',
            M3: '5',
            M4: '6',
            A: '9',
            K: '10',
            Q: '11',
            J: '12',
            TE: '13',
            F1: '15',
            F2: '16',
            F3: '17',
            F4: '18',
            F5: '19',
            B2: '20',
          }),
        ],
      },
      Success: true,
      Type: 'ServerResponseStrip',
    };
  }

  function randomOperationId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID().replace(/-/g, '');
    }
    return 'thor2_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2).repeat(2);
  }

  function operationFingerprint(action, amount) {
    return action + ':' + Number(amount).toFixed(2);
  }

  function operationIdFor(action, amount) {
    var fingerprint = operationFingerprint(action, amount);
    var pending = null;
    try {
      pending = JSON.parse(window.sessionStorage.getItem(pendingOperationKey) || 'null');
    } catch (_error) {
      pending = null;
    }
    var operationId =
      pending && pending.fingerprint === fingerprint && pending.operationId
        ? pending.operationId
        : randomOperationId();
    try {
      window.sessionStorage.setItem(
        pendingOperationKey,
        JSON.stringify({ fingerprint: fingerprint, operationId: operationId }),
      );
    } catch (_error) {
      // The database operation key still protects a retried request.
    }
    return operationId;
  }

  function clearOperation(operationId) {
    try {
      var pending = JSON.parse(window.sessionStorage.getItem(pendingOperationKey) || 'null');
      if (pending && pending.operationId === operationId) {
        window.sessionStorage.removeItem(pendingOperationKey);
      }
    } catch (_error) {
      // Private browsing storage failures must not break a settled spin.
    }
  }

  function requestAction(request) {
    if (request.Type === 'PlayerRequestBuyFeature') {
      var feature = Number(request.ExtraData);
      return feature === 1 ? 'super' : feature === 2 ? 'lucky' : 'regular';
    }
    return request.ExtraBet === true && Number(request.ExtraBetFeatureID) === 0 ? 'extra' : 'spin';
  }

  function requestAmount(request) {
    var bet = Number(request.Bet);
    var denom = Number(request.Denom);
    if (!Number.isFinite(bet) || bet <= 0) bet = 20 * Math.max(1, Number(request.BetLevel) || 1);
    if (!Number.isFinite(denom) || denom <= 0) denom = 0.05;
    return Math.max(1, Math.round(bet * denom * 100) / 100);
  }

  function handleGameStart(socket, request) {
    if (activeSequence && activeSequence.queue.length > 0) {
      advanceProgress(activeSequence)
        .then(function () {
          serveNextPacket(socket);
        })
        .catch(function (error) {
          reportProtocolError(socket, error);
        });
      return;
    }
    if (activeSequence && activeSequence.finalDelivered) {
      settleSequence(socket)
        .then(function () {
          handleGameStart(socket, request);
        })
        .catch(function () {
          // settleSequence already reported the protocol error to the host shell.
        });
      return;
    }

    var pending = platformSession && platformSession.pendingFeature;
    if (pending) {
      startSequence(socket, pending, true);
      return;
    }

    var action = requestAction(request);
    var amount = requestAmount(request);
    var operationId = operationIdFor(action, amount);
    authorizedFetch('/spin', 'POST', {
      action: action,
      amount: amount,
      operationId: operationId,
      clientSeed: 'thor2-original-' + Date.now().toString(36),
    })
      .then(function (result) {
        clearOperation(operationId);
        if (result.payoutDeferred) {
          platformSession.balance = result.newBalance;
          platformSession.pendingFeature = result;
          notifyParent('thor2:balance', { balance: result.newBalance });
        }
        startSequence(socket, result, false);
      })
      .catch(function (error) {
        reportProtocolError(socket, error);
      });
  }

  function startSequence(socket, result, recovered) {
    activeSequence = buildSequence(result);
    activeSequence.recovered = recovered;
    if (Number.isFinite(Number(result.featureCursor))) {
      activeSequence.progressCursor = Math.max(0, Number(result.featureCursor));
      if (activeSequence.progressCursor > 0) {
        activeSequence.queue = activeSequence.queue.filter(function (entry) {
          // A resumed feature must start with the next FreeGame response. If
          // the paid AddFreeGame trigger is replayed here, the original client
          // treats a recovery as a brand-new 15-spin feature and its status
          // graph can no longer continue from the saved cursor.
          return entry.freeRound > activeSequence.progressCursor;
        });
      }
    }
    if (activeSequence.queue.length === 0) {
      settleSequence(socket);
      return;
    }
    serveNextPacket(socket);
  }

  function serveNextPacket(socket) {
    if (!activeSequence || activeSequence.queue.length === 0) return;
    var entry = activeSequence.queue.shift();
    socket._respond(entry.payload);
    if (entry.freeRoundComplete) {
      activeSequence.pendingProgress = Math.max(
        activeSequence.pendingProgress,
        entry.freeRoundComplete,
      );
    }
    if (activeSequence.queue.length === 0) {
      activeSequence.finalDelivered = true;
      window.setTimeout(function () {
        if (!activeSequence || !activeSequence.finalDelivered) return;
        socket._respond({
          LoginID: '',
          Currency: 'TWD',
          TransactionType: 'BET_SETTLED',
          Amount: 0,
          Timestamp: Date.now(),
          Type: 'WalletUpdate',
        });
      }, 0);
      activeSequence.settlementTimer = window.setTimeout(function () {
        settleSequence(socket);
      }, 30000);
    }
  }

  function advanceProgress(sequence) {
    if (!sequence || !sequence.result.payoutDeferred) return Promise.resolve();
    var cursor = Math.max(sequence.progressCursor, sequence.pendingProgress);
    if (cursor <= sequence.progressCursor) return Promise.resolve();
    return authorizedFetch('/feature/progress', 'POST', {
      betId: sequence.result.betId,
      cursor: cursor,
    }).then(function (response) {
      sequence.progressCursor = Number(response.cursor) || cursor;
      return response;
    });
  }

  function settleSequence(socket) {
    var sequence = activeSequence;
    if (!sequence) {
      respondBalance(socket, platformSession ? platformSession.balance : 0);
      return Promise.resolve();
    }
    if (sequence.settlementInFlight) return sequence.settlementInFlight;
    if (sequence.settlementTimer) window.clearTimeout(sequence.settlementTimer);
    sequence.settlementInFlight = advanceProgress(sequence)
      .then(function () {
        if (!sequence.result.payoutDeferred) return { newBalance: sequence.result.newBalance };
        return authorizedFetch('/feature/complete', 'POST', { betId: sequence.result.betId });
      })
      .then(function (response) {
        var balance = response.newBalance;
        platformSession = platformSession || {};
        platformSession.balance = balance;
        platformSession.pendingFeature = null;
        activeSequence = null;
        notifyParent('thor2:balance', { balance: balance });
        respondBalance(socket, balance);
        return response;
      })
      .catch(function (error) {
        reportProtocolError(socket, error);
        throw error;
      });
    return sequence.settlementInFlight;
  }

  function respondCurrentCredit(socket) {
    if (activeSequence && activeSequence.finalDelivered) {
      settleSequence(socket).then(function () {
        socket._respond({
          Credit: Number(platformSession.balance),
          Type: 'CurrentCreditResponse',
          Timestamp: Date.now(),
        });
      });
      return;
    }
    loadSession(false)
      .then(function (session) {
        socket._respond({
          Credit: Number(session.balance),
          Type: 'CurrentCreditResponse',
          Timestamp: Date.now(),
        });
      })
      .catch(function (error) {
        reportProtocolError(socket, error);
      });
  }

  function respondBalance(socket, balance) {
    socket._respond({ PlayerBalance: Number(balance), Type: 'ServerResponsePlayerBalance' });
  }

  function reportProtocolError(socket, error) {
    var message = error && error.message ? error.message : '原始遊戲協議轉接失敗';
    console.error('[Thor2 original adapter]', error);
    notifyParent('thor2:error', { message: message });
    if (socket && socket.readyState === LocalWebSocket.OPEN) {
      socket._respond({
        Success: false,
        ErrCode: '-999',
        Msg: message,
        HaveExtra: false,
        ExtraData: null,
        Type: 'ServerRequestInfoMsg',
      });
    }
  }

  function buildSequence(result) {
    var queue = [];
    var feature = result.feature;
    var entersFree = feature && feature.kind !== 'lucky';
    var luckyRound = feature && feature.kind === 'lucky' && feature.rounds
      ? feature.rounds[0]
      : null;
    var baseGrid =
      result.cascades && result.cascades.length ? result.cascades[0].before : result.grid;
    if (entersFree) baseGrid = ensureFreeTriggerGrid(baseGrid);
    var baseRound = {
      index: 0,
      grid: baseGrid,
      finalGrid: result.grid,
      cascades: result.cascades || [],
      payoutMultiplier: sumCascadePayout(result.cascades || []),
      accumulatedMultiplier: 0,
      retriggeredSpins: 0,
      superBonusMultiplier: 0,
    };
    var cumulativeMultiplier = 0;
    var baseBonusCount = countSymbol(baseGrid, 1);
    var baseBonusPay = entersFree ? bonusPay(baseBonusCount) : 0;
    appendRound(queue, luckyRound || baseRound, {
      key: 0,
      subKey: 0,
      flowEnd: entersFree ? 0 : 1,
      cumulativeStart: cumulativeMultiplier,
      enterFreeSpins: entersFree ? feature.spinsAwarded : 0,
      addFreeSpins: 0,
      freeGame: null,
      bonusPayMultiplier: baseBonusPay,
      freeRound: luckyRound ? 1 : 0,
    });
    cumulativeMultiplier += baseRound.payoutMultiplier + baseBonusPay;

    if (entersFree) {
      (feature.rounds || []).forEach(function (round, roundIndex) {
        var isLast = roundIndex === feature.rounds.length - 1;
        appendRound(queue, round, {
          key: 1,
          subKey: 1,
          flowEnd: isLast ? 1 : 0,
          cumulativeStart: cumulativeMultiplier,
          addFreeSpins: round.retriggeredSpins || 0,
          freeGame: {
            FreeSpinTimesSelect: roundIndex,
            FreeSpinTime: feature.spinsAwarded,
          },
          bonusPayMultiplier: round.superBonusMultiplier || 0,
          freeRound: roundIndex + 1,
        });
        cumulativeMultiplier += Number(round.payoutMultiplier || 0);
      });
    }

    return {
      result: result,
      queue: queue,
      progressCursor: 0,
      pendingProgress: 0,
      finalDelivered: false,
      settlementInFlight: null,
      settlementTimer: 0,
    };
  }

  function appendRound(queue, round, options) {
    var cascades = round.cascades || [];
    var runningTotal = Number(options.cumulativeStart || 0);
    if (cascades.length === 0) {
      var emptyTotal = runningTotal + Number(options.bonusPayMultiplier || 0);
      var emptyFeatures = commonFeatures(round, null, emptyTotal, options);
      if (options.enterFreeSpins) {
        emptyFeatures.push(addFreeGameFeature(options.enterFreeSpins));
      }
      if (options.addFreeSpins) {
        emptyFeatures.push({ Type: 'AddFreeGame', AddFreeSpinTime: options.addFreeSpins, AddType: 0 });
      }
      if (options.freeGame) emptyFeatures.push(freeGameFeature(options.freeGame, emptyTotal));
      queue.push({
        payload: gameStartResponse({
          grid: round.grid,
          wins: [],
          dropScreen: emptyReels(),
          dropMultiple: emptyReels(),
          multiple: gridMultipliers(round.grid),
          multipleOrigin: [],
          screenOrigin: [],
          features: emptyFeatures,
          key: options.key,
          subKey: options.subKey,
          flowEnd: options.flowEnd,
          subFlowEnd: 1,
          totalWin: emptyTotal,
          bonusLine: options.bonusPayMultiplier
            ? createBonusLine(round.grid, options.bonusPayMultiplier)
            : null,
        }),
        freeRound: options.freeRound || 0,
        freeRoundComplete: options.freeRound || 0,
      });
      return;
    }

    cascades.forEach(function (cascade, cascadeIndex) {
      var isLastCascade = cascadeIndex === cascades.length - 1;
      runningTotal += Number(cascade.payoutMultiplier || 0);
      var packetTotal =
        runningTotal + (isLastCascade ? Number(options.bonusPayMultiplier || 0) : 0);
      var features = commonFeatures(round, cascade, packetTotal, options);
      if (isLastCascade && options.enterFreeSpins) {
        features.push(addFreeGameFeature(options.enterFreeSpins));
      }
      if (isLastCascade && options.addFreeSpins) {
        features.push({ Type: 'AddFreeGame', AddFreeSpinTime: options.addFreeSpins, AddType: 0 });
      }
      if (options.freeGame) features.push(freeGameFeature(options.freeGame, packetTotal));
      var drop = deriveDrop(cascade);
      queue.push({
        payload: gameStartResponse({
          grid: cascade.before,
          wins: cascade.wins || [],
          dropScreen: drop.symbols,
          dropMultiple: drop.multipliers,
          multiple: gridMultipliers(cascade.before, cascade.upgrades),
          multipleOrigin: cascade.upgrades && cascade.upgrades.length
            ? gridMultipliers(cascade.before)
            : [],
          screenOrigin: cascade.upgrades && cascade.upgrades.length
            ? toReels(cascade.before)
            : [],
          features: features,
          key: cascadeIndex === 0 ? options.key : 7,
          subKey: options.subKey,
          flowEnd: isLastCascade ? options.flowEnd : 0,
          subFlowEnd: isLastCascade ? 1 : 0,
          totalWin: packetTotal,
          bonusLine:
            isLastCascade && options.bonusPayMultiplier
              ? createBonusLine(cascade.before, options.bonusPayMultiplier)
              : null,
          upgrades: cascade.upgrades || [],
        }),
        freeRound: options.freeRound || 0,
        freeRoundComplete: isLastCascade ? options.freeRound || 0 : 0,
      });
    });
  }

  function commonFeatures(round, cascade, runningTotal) {
    var collected = cascade ? Number(cascade.collectedMultiplier || 0) : 0;
    var accumulated = cascade
      ? Number(cascade.accumulatedMultiplier || 0)
      : Number(round.accumulatedMultiplier || 0);
    return [
      { Type: 'ScreenMultiple', AddMultiple: collected, Multiple: accumulated },
      {
        Type: 'AccumulateWin',
        TumblingWinOrigin: cascade ? Number(cascade.baseWinMultiplier || 0) * 20 : 0,
        TumblingWin: cascade ? Number(cascade.payoutMultiplier || 0) * 20 : 0,
        TotalWin: Number(runningTotal || 0) * 20,
      },
    ];
  }

  function freeGameFeature(data, runningTotal) {
    return {
      Type: 'FreeGame',
      FreeSpinTimesSelect: data.FreeSpinTimesSelect,
      FreeSpinTime: data.FreeSpinTime,
      AccumulateWinning: Number(runningTotal || 0) * 20,
      TriggerBonusWinning: 0,
      TriggerOtherWinning: 0,
    };
  }

  function addFreeGameFeature(spins) {
    return {
      Type: 'AddFreeGame',
      AddFreeSpinTime: Math.max(0, Number(spins) || 0),
      AddType: 0,
    };
  }

  function gameStartResponse(data) {
    var winLines = (data.wins || []).map(createWinLine);
    if (data.bonusLine) winLines.push(data.bonusLine);
    var rng = toReels(data.grid);
    var dropScreen = normalizeReelMatrix(data.dropScreen);
    var screenOrigin = normalizeReelMatrix(data.screenOrigin);
    var multiple = normalizeMultiplierMatrix(rng, data.multiple);
    var dropMultiple = normalizeMultiplierMatrix(dropScreen, data.dropMultiple);
    var multipleOrigin = screenOrigin.length
      ? normalizeMultiplierMatrix(screenOrigin, data.multipleOrigin)
      : [];
    var upgradeLevels = [];
    var highestUpgradeLevel = (data.upgrades || []).reduce(function (highest, upgrade) {
      return Math.max(highest, Math.max(1, Number(upgrade.level) || 1));
    }, 0);
    for (var step = 0; step < highestUpgradeLevel; step += 1) upgradeLevels.push(1);
    return {
      ErrCode: null,
      ExtraData: {
        Extra: {
          DropMultiple: dropMultiple,
          DropScreen: dropScreen,
          Features: data.features,
          IsMaxWin: false,
          Multiple: multiple,
          MultipleOrigin: multipleOrigin,
          ScreenOrigin: screenOrigin,
          SubFlowEnd: data.subFlowEnd,
          SubKey: data.subKey,
          TriggerUpgrade: upgradeLevels.length > 0,
          UpgradeLevel: upgradeLevels,
          isSpinHint: false,
          isUpgradeHint: false,
        },
        FlowEnd: data.flowEnd,
        Key: data.key,
        RNG: rng,
        Win: Number(data.totalWin || 0) * 20,
        WinLineCount: winLines.length,
        WinLines: winLines,
      },
      HaveExtra: true,
      Msg: {
        GameSerialNumber: 'QM-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        MathName: null,
        RNG: rng,
        WinLineCount: winLines.length,
        WinLines: winLines.length ? winLines : null,
      },
      Success: true,
      Type: 'ServerResponseGameStart',
    };
  }

  function createWinLine(win) {
    return {
      WinType: 0,
      Multiply: 1,
      LineNo: 0,
      WinCredit: Number(win.payMultiplier || 0) * 20,
      SymbolID: Number(win.symbol),
      SymbolCount: Number(win.count),
      Position: positionMatrix(win.positions || []),
      Extra: null,
    };
  }

  function createBonusLine(grid, payMultiplier) {
    var positions = [];
    (grid || []).forEach(function (cell, index) {
      if (Number(cell.symbol) === 1) positions.push(index);
    });
    return {
      WinType: 1,
      Multiply: 1,
      LineNo: -1,
      WinCredit: Number(payMultiplier || 0) * 20,
      SymbolID: 1,
      SymbolCount: positions.length,
      Position: positionMatrix(positions),
      Extra: null,
    };
  }

  function positionMatrix(positions) {
    var selected = {};
    positions.forEach(function (position) {
      selected[Number(position)] = true;
    });
    return Array.from({ length: 6 }, function (_value, reel) {
      return Array.from({ length: 5 }, function (_cell, row) {
        return selected[reel * 5 + row] ? 1 : 0;
      });
    });
  }

  function toReels(grid) {
    return Array.from({ length: 6 }, function (_value, reel) {
      return Array.from({ length: 5 }, function (_cell, row) {
        var value = grid && grid[reel * 5 + row];
        return value ? Number(value.symbol) : 13;
      });
    });
  }

  function gridMultipliers(grid, upgrades) {
    var upgraded = {};
    (upgrades || []).forEach(function (upgrade) {
      upgraded[Number(upgrade.position)] = Number(upgrade.to);
    });
    return Array.from({ length: 6 }, function (_value, reel) {
      var values = [];
      for (var row = 0; row < 5; row += 1) {
        var position = reel * 5 + row;
        var cell = grid && grid[position];
        if (cell && Number(cell.symbol) >= 15 && Number(cell.symbol) <= 19) {
          values.push(
            normalizeFeatureMultiplier(
              upgraded[position] || Number(cell.multiplier),
              Number(cell.symbol),
            ),
          );
        }
      }
      return values;
    });
  }

  function deriveDrop(cascade) {
    var removed = {};
    (cascade.wins || []).forEach(function (win) {
      (win.positions || []).forEach(function (position) {
        removed[Number(position)] = true;
      });
    });
    var symbols = [];
    var multipliers = [];
    for (var reel = 0; reel < 6; reel += 1) {
      var missing = 0;
      for (var row = 0; row < 5; row += 1) {
        if (removed[reel * 5 + row]) missing += 1;
      }
      symbols[reel] = [];
      multipliers[reel] = [];
      for (var nextRow = 0; nextRow < missing; nextRow += 1) {
        var cell = cascade.after[reel * 5 + nextRow];
        symbols[reel].push(Number(cell.symbol));
        if (Number(cell.symbol) >= 15 && Number(cell.symbol) <= 19) {
          multipliers[reel].push(
            normalizeFeatureMultiplier(Number(cell.multiplier), Number(cell.symbol)),
          );
        }
      }
    }
    return { symbols: symbols, multipliers: multipliers };
  }

  function emptyReels() {
    return [[], [], [], [], [], []];
  }

  function normalizeReelMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) return [];
    return Array.from({ length: 6 }, function (_value, reel) {
      return Array.isArray(matrix[reel])
        ? matrix[reel].map(function (value) {
            return Number(value);
          })
        : [];
    });
  }

  // The original client consumes one multiplier for every F1-F5 symbol in
  // each reel. A missing entry becomes zero inside the archived parser and
  // makes its original thunder animation reject the symbol. Keep the server's
  // legal value, while completing only malformed/missing protocol entries.
  function normalizeMultiplierMatrix(symbols, multipliers) {
    if (!Array.isArray(symbols) || symbols.length === 0) return [];
    return Array.from({ length: 6 }, function (_value, reel) {
      var sourceSymbols = Array.isArray(symbols[reel]) ? symbols[reel] : [];
      var sourceMultipliers =
        multipliers && Array.isArray(multipliers[reel]) ? multipliers[reel] : [];
      var sourceIndex = 0;
      var values = [];
      sourceSymbols.forEach(function (symbol) {
        var symbolId = Number(symbol);
        if (symbolId < 15 || symbolId > 19) return;
        values.push(normalizeFeatureMultiplier(sourceMultipliers[sourceIndex], symbolId));
        sourceIndex += 1;
      });
      return values;
    });
  }

  function normalizeFeatureMultiplier(value, symbolId) {
    var numeric = Number(value);
    if (legalFeatureMultipliers[numeric]) return numeric;
    if (symbolId === 16) return 10;
    if (symbolId === 17) return 50;
    if (symbolId === 18) return 100;
    if (symbolId === 19) return 1000;
    return 2;
  }

  function countSymbol(grid, symbol) {
    return (grid || []).filter(function (cell) {
      return Number(cell.symbol) === symbol;
    }).length;
  }

  function ensureFreeTriggerGrid(grid) {
    var next = (grid || []).map(function (cell) {
      return cell ? Object.assign({}, cell) : { symbol: 13 };
    });
    while (next.length < 30) next.push({ symbol: 13 });
    var bonusCount = countSymbol(next, 1);
    for (var position = 0; position < next.length && bonusCount < 4; position += 1) {
      var cell = next[position];
      if (Number(cell.symbol) === 1 || Number(cell.symbol) === 20 || cell.multiplier) continue;
      next[position] = { symbol: 1 };
      bonusCount += 1;
    }
    return next;
  }

  function bonusPay(count) {
    if (count >= 6) return 100;
    if (count === 5) return 5;
    return count === 4 ? 3 : 0;
  }

  function sumCascadePayout(cascades) {
    return (cascades || []).reduce(function (total, cascade) {
      return total + Number(cascade.payoutMultiplier || 0);
    }, 0);
  }

  window.__QmoneyThor2OriginalAdapterTest = {
    LocalWebSocket: LocalWebSocket,
    buildSequence: buildSequence,
    deriveDrop: deriveDrop,
    normalizeMultiplierMatrix: normalizeMultiplierMatrix,
    positionMatrix: positionMatrix,
    requestAction: requestAction,
    requestAmount: requestAmount,
    stripResponse: stripResponse,
  };
})();
