(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || window.location.origin + '/api').replace(/\/$/, '');
  var protocolUrl = apiBase + '/games/seth2/protocol';
  var requestTimeoutMs = 15000;
  var patched = false;
  var gameModulesPatched = false;
  var loginStarted = false;
  var refreshInFlight = null;
  var selectedMachinePage = 1;
  var PENDING_OPERATION_KEY = 'bg.seth2.legacy.pending-operation';
  var officialMultiplierValues = [2, 3, 4, 6, 8, 10, 15, 25, 50, 100, 200, 300, 500];
  var SFX_PREFS_KEY = 'bg.sfx.prefs';
  var BGM_PREFS_KEY = 'bg.bgm.prefs';
  var audioBridge = null;
  var audioBridgeAttempts = 0;
  var platformAudioPrefs = readPlatformAudioPrefs();

  function attachOperationId(request) {
    var fingerprint = JSON.stringify({
      type: request.type,
      machineId: Number(request.machineId),
      yazhu: Number(request.yazhu),
      gameModelType: Number(request.gameModelType || 0),
    });
    var pending = null;
    try {
      pending = JSON.parse(window.sessionStorage.getItem(PENDING_OPERATION_KEY) || 'null');
    } catch (_error) {
      pending = null;
    }
    var operationId =
      pending && pending.fingerprint === fingerprint
        ? pending.operationId
        : 'seth2_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2).repeat(2);
    request.operationId = operationId;
    try {
      window.sessionStorage.setItem(
        PENDING_OPERATION_KEY,
        JSON.stringify({ fingerprint: fingerprint, operationId: operationId }),
      );
    } catch (_error) {
      // Database idempotency remains authoritative if browser storage is blocked.
    }
    return operationId;
  }

  function clearOperationId(operationId) {
    try {
      var pending = JSON.parse(window.sessionStorage.getItem(PENDING_OPERATION_KEY) || 'null');
      if (
        pending &&
        pending.operationId === operationId &&
        typeof window.sessionStorage.removeItem === 'function'
      ) {
        window.sessionStorage.removeItem(PENDING_OPERATION_KEY);
      }
    } catch (_error) {
      // Storage failures must never lock a successfully settled game.
    }
  }

  function machinePageNumber(pageIndex) {
    var index = Number(pageIndex);
    if (!Number.isInteger(index)) return 1;
    return Math.max(1, Math.min(8, index + 1));
  }

  function machineDisplayRate(machineId, timestamp, salt) {
    var id = Number(machineId);
    var now = Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now();
    var rateSalt = Number(salt) || 0;
    var bucket = Math.floor(now / 2500) % 6000;
    var machineFactor = 137 + (bucket % 97) * 60;
    var rateUnits = (id * machineFactor + bucket * 431 + rateSalt * 1877) % 6000;
    return (70 + rateUnits / 100).toFixed(2);
  }

  function multiplierVisualTier(value) {
    var multiplier = Number(value);
    if (multiplier >= 200) return 3;
    if (multiplier >= 50) return 2;
    if (multiplier >= 10) return 1;
    return 0;
  }

  function multiplierAssetName(value, rare) {
    return 'game/pic/symbol/symbol_' + (10 + multiplierVisualTier(value)) + (rare ? '_01' : '');
  }

  function clampVolume(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(1, parsed));
  }

  function readAudioPrefs(storageKey, defaultVolume) {
    try {
      var raw = parentStorage().getItem(storageKey);
      var saved = raw ? JSON.parse(raw) : null;
      return {
        muted: Boolean(saved && saved.muted),
        volume: clampVolume(saved && saved.volume, defaultVolume),
      };
    } catch (_error) {
      return { muted: false, volume: defaultVolume };
    }
  }

  function readPlatformAudioPrefs() {
    var music = readAudioPrefs(BGM_PREFS_KEY, 0.32);
    var effects = readAudioPrefs(SFX_PREFS_KEY, 0.6);
    return {
      musicMuted: music.muted,
      musicVolume: music.volume,
      effectsMuted: effects.muted,
      effectsVolume: effects.volume,
    };
  }

  function installCocosAudioControls(engine) {
    if (!engine || typeof engine.setMusicVolume !== 'function') return null;
    if (engine.__yachiyoSeth2AudioBridge) return engine.__yachiyoSeth2AudioBridge;

    var originalSetMusicVolume = engine.setMusicVolume.bind(engine);
    var originalSetEffectsVolume = engine.setEffectsVolume.bind(engine);
    var originalPlay = typeof engine.play === 'function' ? engine.play.bind(engine) : null;
    var originalPlayMusic =
      typeof engine.playMusic === 'function' ? engine.playMusic.bind(engine) : null;
    var originalPlayEffect =
      typeof engine.playEffect === 'function' ? engine.playEffect.bind(engine) : null;
    var originalSetVolume =
      typeof engine.setVolume === 'function' ? engine.setVolume.bind(engine) : null;
    var categorizedPlayDepth = 0;
    var applyingPrefs = false;
    var directAudio = {};
    var requestedMusicVolume = clampVolume(
      typeof engine.getMusicVolume === 'function' ? engine.getMusicVolume() : 1,
      1,
    );
    var requestedEffectsVolume = clampVolume(
      typeof engine.getEffectsVolume === 'function' ? engine.getEffectsVolume() : 1,
      1,
    );
    var currentPrefs = platformAudioPrefs;

    function apply() {
      applyingPrefs = true;
      try {
        originalSetMusicVolume(
          currentPrefs.musicMuted ? 0 : requestedMusicVolume * currentPrefs.musicVolume,
        );
        originalSetEffectsVolume(
          currentPrefs.effectsMuted ? 0 : requestedEffectsVolume * currentPrefs.effectsVolume,
        );
        if (originalSetVolume) {
          Object.keys(directAudio).forEach(function (id) {
            if (engine._id2audio && !engine._id2audio[id]) {
              delete directAudio[id];
              return;
            }
            var entry = directAudio[id];
            var muted =
              entry.kind === 'music' ? currentPrefs.musicMuted : currentPrefs.effectsMuted;
            var master =
              entry.kind === 'music' ? currentPrefs.musicVolume : currentPrefs.effectsVolume;
            originalSetVolume(id, muted ? 0 : entry.volume * master);
          });
        }
      } finally {
        applyingPrefs = false;
      }
    }

    engine.setMusicVolume = function (volume) {
      requestedMusicVolume = clampVolume(volume, requestedMusicVolume);
      apply();
    };
    engine.setEffectsVolume = function (volume) {
      requestedEffectsVolume = clampVolume(volume, requestedEffectsVolume);
      apply();
    };
    if (originalPlay) {
      engine.play = function (clip, loop, volume) {
        if (categorizedPlayDepth > 0) return originalPlay(clip, loop, volume);
        var kind = loop ? 'music' : 'effects';
        var requestedVolume = clampVolume(volume, 1);
        var muted = kind === 'music' ? currentPrefs.musicMuted : currentPrefs.effectsMuted;
        var master = kind === 'music' ? currentPrefs.musicVolume : currentPrefs.effectsVolume;
        var id = originalPlay(clip, loop, muted ? 0 : requestedVolume * master);
        directAudio[String(id)] = { kind: kind, volume: requestedVolume };
        return id;
      };
    }
    if (originalPlayMusic) {
      engine.playMusic = function () {
        categorizedPlayDepth += 1;
        try {
          return originalPlayMusic.apply(null, arguments);
        } finally {
          categorizedPlayDepth -= 1;
        }
      };
    }
    if (originalPlayEffect) {
      engine.playEffect = function () {
        categorizedPlayDepth += 1;
        try {
          return originalPlayEffect.apply(null, arguments);
        } finally {
          categorizedPlayDepth -= 1;
        }
      };
    }
    if (originalSetVolume) {
      engine.setVolume = function (id, volume) {
        if (applyingPrefs) return originalSetVolume(id, volume);
        var entry = directAudio[String(id)];
        if (!entry) return originalSetVolume(id, volume);
        entry.volume = clampVolume(volume, entry.volume);
        var muted = entry.kind === 'music' ? currentPrefs.musicMuted : currentPrefs.effectsMuted;
        var master = entry.kind === 'music' ? currentPrefs.musicVolume : currentPrefs.effectsVolume;
        return originalSetVolume(id, muted ? 0 : entry.volume * master);
      };
    }

    var bridge = {
      apply: apply,
      updatePrefs: function (prefs) {
        currentPrefs = prefs;
        apply();
      },
      getState: function () {
        return {
          musicMuted: currentPrefs.musicMuted,
          musicVolume: currentPrefs.musicVolume,
          effectsMuted: currentPrefs.effectsMuted,
          effectsVolume: currentPrefs.effectsVolume,
        };
      },
    };
    try {
      Object.defineProperty(engine, '__yachiyoSeth2AudioBridge', {
        configurable: true,
        value: bridge,
      });
    } catch (_error) {
      engine.__yachiyoSeth2AudioBridge = bridge;
    }
    apply();
    return bridge;
  }

  function getCocosAudioContext() {
    var support = window.cc && window.cc.sys && window.cc.sys.__audioSupport;
    return support && support.context;
  }

  function syncCocosAudio() {
    var engine = window.cc && window.cc.audioEngine;
    if (!engine) return false;
    audioBridge = installCocosAudioControls(engine);
    if (!audioBridge) return false;
    audioBridge.updatePrefs(platformAudioPrefs);
    return true;
  }

  function resumeCocosAudio() {
    syncCocosAudio();
    var context = getCocosAudioContext();
    if (context && context.state === 'suspended' && typeof context.resume === 'function') {
      var resumed = context.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(function () {});
    }
  }

  function scheduleAudioBridge() {
    if (syncCocosAudio() || audioBridgeAttempts >= 600) return;
    audioBridgeAttempts += 1;
    window.setTimeout(scheduleAudioBridge, 100);
  }

  function updatePlatformAudioPrefs() {
    platformAudioPrefs = readPlatformAudioPrefs();
    if (audioBridge) audioBridge.updatePrefs(platformAudioPrefs);
  }

  function installPlatformAudioBridge() {
    if (typeof window.addEventListener !== 'function') return;
    window.addEventListener('storage', function (event) {
      if (event.key === SFX_PREFS_KEY || event.key === BGM_PREFS_KEY) {
        updatePlatformAudioPrefs();
      }
    });
    window.addEventListener('message', function (event) {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        !event.data
      ) {
        return;
      }
      if (event.data.type === 'seth2:audio-sync') updatePlatformAudioPrefs();
      if (event.data.type === 'seth2:audio-unlock') resumeCocosAudio();
    });
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (eventName) {
      window.addEventListener(eventName, resumeCocosAudio, { capture: true, passive: true });
    });
    scheduleAudioBridge();
  }

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
      window.parent.postMessage(
        Object.assign({ type: type }, payload || {}),
        window.location.origin,
      );
    } catch (error) {
      console.warn('[Seth2 Adapter] Parent notification failed', error);
    }
  }

  function publicGameError(payload, fallback) {
    var message = payload && (payload.message || payload.error);
    var internal = payload && payload.code === 'INTERNAL';
    if (
      internal ||
      /prisma\.|query execution|prismaclient|postgres(?:ql)?|connectorerror/i.test(
        String(message || ''),
      )
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
        Authorization: 'Bearer ' + auth.accessToken,
      },
      body: JSON.stringify(body || {}),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (response.status === 401 && !retried) {
          return refreshAccessToken().then(function () {
            return authorizedFetch(url, body, true);
          });
        }
        return response.json().then(function (payload) {
          if (!response.ok) throw new Error(publicGameError(payload, '遊戲伺服器拒絕請求'));
          return payload;
        });
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('遊戲伺服器回應逾時，請稍後重試');
        }
        throw error;
      })
      .finally(function () {
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
        if (
          typeof game.getIsAuto === 'function' &&
          game.getIsAuto() &&
          typeof game.endAuto === 'function'
        ) {
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
        if (
          typeof game.getIsAuto === 'function' &&
          game.getIsAuto() &&
          typeof game.endAuto === 'function'
        ) {
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

  function syncMultiplierBankBefore(game, returnData) {
    var multiplierBank = Number(returnData && returnData.multiplierBankBefore);
    if (!Number.isInteger(multiplierBank) || multiplierBank < 0) return;
    var rightMultiplier = game && game.rightBeiShu;
    if (!rightMultiplier) return;
    rightMultiplier.cur_beishu = multiplierBank;
    if (rightMultiplier.ttf_beishu) rightMultiplier.ttf_beishu.string = multiplierBank + 'x';
  }

  function featureModelType(returnData) {
    if (!returnData || typeof returnData !== 'object') return 0;
    return Number(returnData.gameModelType) === 1 || returnData.featureMode === 'awakening' ? 1 : 0;
  }

  function syncFeatureMode(returnData) {
    var modelType = featureModelType(returnData);
    try {
      var Game = window.__require && window.__require('Game').default;
      if (Game && Game.instance) Game.instance.gameModelType = modelType;
    } catch (_error) {
      // The result contract remains available for the next animation stage.
    }
    return modelType;
  }

  function formatPrizeAmount(value) {
    var amount = Number(value);
    if (!Number.isFinite(amount)) amount = 0;
    var parts = amount.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function addJackpotAmount(view, amount) {
    if (!window.cc || !view || !view.node || view.node.getChildByName('YachiyoJPAmount')) return;
    var scoreNode = new cc.Node('YachiyoJPAmount');
    scoreNode.parent = view.node;
    scoreNode.y = -105;
    scoreNode.zIndex = 9999;
    scoreNode.color = cc.color(255, 224, 94);
    var label = scoreNode.addComponent(cc.Label);
    label.string = formatPrizeAmount(amount);
    label.fontSize = 48;
    label.lineHeight = 56;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    var outline = scoreNode.addComponent(cc.LabelOutline);
    outline.color = cc.color(80, 32, 0);
    outline.width = 3;
  }

  function showFatal(message) {
    var overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:#10091d',
      'color:#fff',
      'font-family:system-ui,sans-serif',
      'text-align:center',
      'padding:24px',
    ].join(';');
    overlay.innerHTML =
      '<div><div style="font-size:20px;font-weight:700;margin-bottom:10px">遊戲連線失敗</div>' +
      '<div style="color:#c9bdd9">' +
      String(message).replace(/[<>&]/g, '') +
      '</div></div>';
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
    var machinePageAtSend = selectedMachinePage;
    if (socket.readyState !== LocalGameSocket.OPEN) throw new Error('Socket is not open');
    socket._queue = socket._queue
      .then(function () {
        request = JSON.parse(raw);
        if (request.type === 'getMachineList') request.page = machinePageAtSend;
        if (
          request.type === 'useMachine' ||
          request.type === 'gameToolsList' ||
          request.type === 'buyFreeGame'
        ) {
          request.isFreeModel = 0;
        }
        if (request.type === 'gameToolsList' || request.type === 'buyFreeGame') {
          attachOperationId(request);
        }
        return authorizedFetch(protocolUrl, request, false).then(function (payload) {
          if (request.type === 'getMachineList' && request.page !== selectedMachinePage) return;
          if (payload && payload.data && payload.data.balance !== undefined) {
            notifyParent('seth2:balance', { balance: Number(payload.data.balance) });
          }
          var returnData = payload && payload.data && payload.data.returnData;
          if (returnData) syncFeatureMode(returnData);
          if (request.operationId) clearOperationId(request.operationId);
          if (socket.readyState === LocalGameSocket.OPEN && socket.onmessage) {
            socket.onmessage({ data: JSON.stringify(payload) });
          }
          // BuyFreeView writes its old client-side random mode after processing the
          // response. Restore the server-authoritative mode before the entry popup.
          if (returnData) {
            window.setTimeout(function () {
              syncFeatureMode(returnData);
            }, 0);
          }
        });
      })
      .catch(function (error) {
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
    officialMultiplierValues: officialMultiplierValues.slice(),
    machineDisplayRate: machineDisplayRate,
    machinePageNumber: machinePageNumber,
    multiplierVisualTier: multiplierVisualTier,
    multiplierAssetName: multiplierAssetName,
    publicGameError: publicGameError,
    recoverAnimationFailure: recoverAnimationFailure,
    syncMultiplierBankBefore: syncMultiplierBankBefore,
    featureModelType: featureModelType,
    formatPrizeAmount: formatPrizeAmount,
    installCocosAudioControls: installCocosAudioControls,
  };

  function requestSession(callback) {
    authorizedFetch(apiBase + '/games/seth2/session', {}, false)
      .then(function (body) {
        callback(true, body);
      })
      .catch(function (error) {
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
            console.warn(
              '[Seth2 Adapter] Original login startup failed; continuing with Yachiyo login',
              error,
            );
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
      var ColSingleItem = window.__require('ColSingleItem').default;
      var ResMgr = window.__require('ResMgr').default;
      var ResourceManager = window.__require('ResourceManager').default;
      var RoomListSingleItem = window.__require('RoomListSingleItem').default;
      var RoomListView = window.__require('RoomListView').default;
      var AudioManager = window.__require('AudioManager').default;
      var FreeTransInOut = window.__require('FreeTransInOut').default;
      var JPRewardView = window.__require('JPRewardView').default;
      var PopDataLayer = window.__require('PopDataLayer').default;
      var WinView = window.__require('WinView').default;
      var i18nModule = window.__require('i18nMgr');
      if (
        !Game ||
        !ColMain ||
        !ColSingleItem ||
        !ResMgr ||
        !ResourceManager ||
        !RoomListSingleItem ||
        !RoomListView ||
        !AudioManager ||
        !FreeTransInOut ||
        !JPRewardView ||
        !PopDataLayer ||
        !WinView
      )
        return;

      // The bundled i18n directory belongs to an unrelated flower-shop demo.
      // Keep Seth's original Traditional Chinese bitmap labels and prevent those
      // legacy resources from replacing them with an incompatible UI language.
      if (i18nModule && i18nModule.i18nMgr && !i18nModule.i18nMgr.__yachiyoSethIsolated) {
        i18nModule.i18nMgr._getLabel = function (key) {
          return key;
        };
        i18nModule.i18nMgr._getSprite = function (_key, callback) {
          callback(null);
        };
        i18nModule.i18nMgr.__yachiyoSethIsolated = true;
      }

      if (!FreeTransInOut.prototype.__yachiyoFeatureAudioPatched) {
        var originalFreeTransOnLoad = FreeTransInOut.prototype.onLoad;
        FreeTransInOut.prototype.onLoad = function () {
          if (originalFreeTransOnLoad) originalFreeTransOnLoad.call(this);
          var view = this;
          this.freeIn.setCompleteListener(function () {
            var eventModule = window.__require('GameEvent');
            var eventBus = eventModule.default.getInstance;
            if (view.gameType === 'buy') {
              eventBus.emit(eventModule.GameEventName.BUY_GAME_NEXT_STEP);
            } else if (view.gameType === 'free') {
              eventBus.emit(eventModule.GameEventName.FREE_GAME_NEXT_STEP);
            }
            var awakening = Game.instance && Game.instance.gameModelType === 1;
            AudioManager.instance.playBg(awakening ? 'audios/bgm_golden_fg' : 'audios/bgm_fg');
            view.closeMyView();
          });
        };
        FreeTransInOut.prototype.__yachiyoFeatureAudioPatched = true;
      }

      if (!JPRewardView.prototype.__yachiyoPrizePatched) {
        var originalJPStart = JPRewardView.prototype.start;
        JPRewardView.prototype.start = function () {
          var dataLayer = this.getComponent(PopDataLayer);
          var data = (dataLayer && dataLayer.data) || {};
          var originalScheduleOnce = this.scheduleOnce;
          this.scheduleOnce = function (callback, delay) {
            return originalScheduleOnce.call(this, callback, delay === 3 ? 4.5 : delay);
          };
          try {
            if (originalJPStart) originalJPStart.call(this);
          } finally {
            this.scheduleOnce = originalScheduleOnce;
          }
          addJackpotAmount(this, data.jpGold);
          if (Number(data.jpType) === 12) {
            AudioManager.instance.playEffect('audios/btm_w_major_vocal');
          }
        };
        JPRewardView.prototype.__yachiyoPrizePatched = true;
      }

      if (!WinView.prototype.__yachiyoPrizeTimingPatched) {
        var originalWinOnLoad = WinView.prototype.onLoad;
        WinView.prototype.onLoad = function () {
          var originalScheduleOnce = this.scheduleOnce;
          this.scheduleOnce = function (callback, delay) {
            return originalScheduleOnce.call(this, callback, delay === 3 ? 4.5 : delay);
          };
          try {
            return originalWinOnLoad && originalWinOnLoad.call(this);
          } finally {
            this.scheduleOnce = originalScheduleOnce;
          }
        };
        WinView.prototype.__yachiyoPrizeTimingPatched = true;
      }

      if (!ColSingleItem.prototype.__yachiyoOfficialMultiplierPatched) {
        var originalSetIconByType = ColSingleItem.prototype.setIconByType;
        ColSingleItem.prototype.setIconByType = function () {
          if (ResMgr.getMulItemTypeList().indexOf(this.item_type) === -1) {
            return originalSetIconByType.call(this);
          }
          var item = this;
          var path = multiplierAssetName(this.mulNum, Number(this.mul_type) === 0);
          return ResourceManager.getSpriteFrame(path).then(function (frame) {
            if (item.item_icon) item.item_icon.spriteFrame = frame;
          });
        };
        ColSingleItem.prototype.__yachiyoOfficialMultiplierPatched = true;
      }

      if (!ResMgr.__yachiyoOfficialMultiplierPatched) {
        var originalGetSpineByType = ResMgr.getSpineByType;
        ResMgr.getSpineByType = function (type, multiplier, multiplierType) {
          if (ResMgr.getMulItemTypeList().indexOf(type) === -1) {
            return originalGetSpineByType.call(ResMgr, type, multiplier, multiplierType);
          }
          var tier = multiplierVisualTier(multiplier);
          var spineIndex = Number(multiplierType) === 0 ? 21 - tier : 9 + tier;
          return ResMgr.instance.symbol_spine_list[spineIndex];
        };
        ResMgr.__yachiyoOfficialMultiplierPatched = true;
      }

      var originalGameOnLoad = Game.prototype.onLoad;
      Game.prototype.onLoad = function () {
        if (originalGameOnLoad) originalGameOnLoad.call(this);
        this.cur_game_model = 1;
      };

      var originalColMainStartRoll = ColMain.prototype.startRoll;
      ColMain.prototype.startRoll = function (returnData) {
        try {
          syncMultiplierBankBefore(Game.instance, returnData);
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
        if (!this.__yachiyoRateTicker && typeof this.schedule === 'function') {
          this.__yachiyoRateTicker = true;
          var room = this;
          this.schedule(function () {
            var machine = room.cur_mac_info;
            if (!machine) return;
            machine.day_rate = machineDisplayRate(machine.id, Date.now(), 0);
            machine.day_rate_30 = machineDisplayRate(machine.id, Date.now(), 1);
            if (room.ttf_total_score_percent) {
              room.ttf_total_score_percent.string = machine.day_rate + '%';
            }
            if (room.ttf_month_score_percent) {
              room.ttf_month_score_percent.string = machine.day_rate_30 + '%';
            }
          }, 2.5);
        }
      };

      var originalRoomClickBtn = RoomListView.prototype.clickBtn;
      RoomListView.prototype.clickBtn = function () {
        selectedMachinePage = machinePageNumber(arguments[1]);
        return originalRoomClickBtn.apply(this, arguments);
      };

      var originalShowMachineList = RoomListView.prototype.showMachineList;
      RoomListView.prototype.showMachineList = function (payload) {
        if (payload && Array.isArray(payload.machineList)) {
          this.scroll_ori_data = payload.machineList;
        }
        var result = originalShowMachineList.call(this, payload);
        if (this.page_index !== 0 && this.scroll_ori_data.length > 0) {
          var room = this;
          this.scheduleOnce(function () {
            room.setMacState(room.getEmptyMachiine());
          });
        }
        return result;
      };

      var originalRoomItemUpdate = RoomListSingleItem.prototype.updateItem;
      RoomListSingleItem.prototype.updateItem = function (data) {
        if (data && data.id) data.day_rate = machineDisplayRate(data.id, Date.now(), 0);
        var result = originalRoomItemUpdate.call(this, data);
        if (!this.__yachiyoRateTicker && typeof this.schedule === 'function') {
          this.__yachiyoRateTicker = true;
          var item = this;
          this.schedule(function () {
            if (!item.data || !item.ttf_percent || !item.node.activeInHierarchy) return;
            item.data.day_rate = machineDisplayRate(item.data.id, Date.now(), 0);
            item.ttf_percent.string = item.data.day_rate + '%';
          }, 2.5);
        }
        return result;
      };
      RoomListView.prototype.clickFree = function () {
        return this.clickEnterGame();
      };
      gameModulesPatched = true;
      console.info('[Seth2 Adapter] Seth feature, prize, audio, and machine patches enabled');
    } catch (_error) {
      // The game bundle loads after authentication; keep polling until it is available.
    }
  }

  var patchTimer = window.setInterval(function () {
    patchClient();
    patchGameModules();
    if (patched && gameModulesPatched) window.clearInterval(patchTimer);
  }, 10);
  window.__YachiyoSeth2UnlockAudio = resumeCocosAudio;
  installPlatformAudioBridge();
  patchClient();
  patchGameModules();
})();
