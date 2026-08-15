(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || window.location.origin + '/api').replace(/\/$/, '');
  var sourceUrl = apiBase + '/games/seth2/source';
  var requestTimeoutMs = 20000;
  var refreshInFlight = null;
  var initialResponseInFlight = null;
  var selectedMachineId = 1;
  var lastSpinId = '';
  var PENDING_OPERATION_KEY = 'bg.seth2.pending-operation';
  var SFX_PREFS_KEY = 'bg.sfx.prefs';
  var BGM_PREFS_KEY = 'bg.bgm.prefs';
  var UPDATE_TOTAL_WINNINGS = 'SlotFrameworkEvent:UPDATE_TOTAL_WINNINGS';
  var GAME_ENTRY_GATE_ID = 'yachiyo-seth2-entry-gate';
  var GAME_ENTRY_BOOT_TIMEOUT_MS = 25000;
  var GAME_ENTRY_TRANSITION_TIMEOUT_MS = 12000;
  var GAME_ENTRY_REQUIRED_UI_COUNT = 4;
  var gameEntryPollTimer = 0;
  var gameEntryPollStartedAt = 0;
  var gameEntryTransitionTimer = 0;
  var gameEntryTransitionStartedAt = 0;
  var gameEntryPaintPending = false;
  var gameEntryInProgress = false;
  var gameCanvasRecoveryBound = false;
  var gameCanvasContextLost = false;

  function wrapFrameworkDispatch(dispatcher) {
    if (typeof dispatcher !== 'function' || dispatcher.__yachiyoTotalWinGuard) return dispatcher;
    function guardedDispatch() {
      var eventName = arguments[0];
      var event = arguments[1];
      var data = event && event.data;
      var needsZeroCompletion =
        eventName === UPDATE_TOTAL_WINNINGS &&
        data &&
        data.needComplete === true &&
        Object.prototype.hasOwnProperty.call(data, 'value') &&
        Number(data.value) === 0 &&
        !Number(data.accValue) &&
        typeof event.complete === 'function';
      var completed = false;
      if (needsZeroCompletion) {
        var originalComplete = event.complete;
        event.complete = function () {
          if (completed) return;
          completed = true;
          return originalComplete.apply(this, arguments);
        };
      }
      var result = dispatcher.apply(this, arguments);
      // The landscape v1.1.5 framework forgets to complete a zero-value total
      // win tween.  Complete on the next task so every registered listener has
      // still received the event, while keeping the callback idempotent for the
      // portrait framework which already handles this case correctly.
      if (needsZeroCompletion && !completed) {
        window.setTimeout(function () {
          if (!completed) event.complete();
        }, 0);
      }
      return result;
    }
    guardedDispatch.__yachiyoTotalWinGuard = true;
    return guardedDispatch;
  }

  function installFrameworkDispatchGuard() {
    if (typeof window.dispatch === 'function') {
      window.dispatch = wrapFrameworkDispatch(window.dispatch);
      return;
    }
    try {
      Object.defineProperty(window, 'dispatch', {
        configurable: true,
        set: function (dispatcher) {
          Object.defineProperty(window, 'dispatch', {
            configurable: true,
            writable: true,
            value: wrapFrameworkDispatch(dispatcher),
          });
        },
      });
    } catch (_error) {
      // Cocos will install dispatch during boot; old browsers can fall back to
      // the framework behavior without preventing the source adapter itself.
    }
  }

  function guardBigwinClass(BigwinView) {
    var prototype = BigwinView && BigwinView.prototype;
    if (!prototype || prototype.__yachiyoCompletionGuard) return false;
    var originalOnClose = prototype.onClose;
    var originalShowBigwin = prototype.showBigwin;
    if (typeof originalOnClose !== 'function' || typeof originalShowBigwin !== 'function') {
      return false;
    }

    prototype.onClose = function () {
      var completion = this.completedCB;
      if (
        typeof completion === 'function' &&
        this.showWinStatus !== 4 &&
        !this.__yachiyoCompletingBigwin
      ) {
        // The source close button calls onClose directly.  Its original method
        // tears down every scheduled callback before the flow completion runs,
        // leaving the already-settled game permanently locked. Complete the
        // flow first; completedCB calls onClose again with status 4.
        this.__yachiyoCompletingBigwin = true;
        try {
          return completion.call(this);
        } finally {
          this.__yachiyoCompletingBigwin = false;
        }
      }
      return originalOnClose.apply(this, arguments);
    };

    prototype.showBigwin = function () {
      var view = this;
      var result = originalShowBigwin.apply(this, arguments);
      window.setTimeout(function () {
        if (
          view &&
          view.showWinStatus !== 4 &&
          typeof view.completedCB === 'function' &&
          !view.__yachiyoCompletingBigwin
        ) {
          view.__yachiyoCompletingBigwin = true;
          try {
            view.completedCB.call(view);
          } finally {
            view.__yachiyoCompletingBigwin = false;
          }
        }
      }, 35000);
      return result;
    };
    prototype.__yachiyoCompletionGuard = true;
    return true;
  }

  function installBigwinCompletionGuard(attempt) {
    var tries = Number(attempt || 0);
    var loader = window.System;
    var moduleId = 'chunks:///_virtual/BigwinView.ts';
    try {
      var loaded = loader && typeof loader.get === 'function' ? loader.get(moduleId) : null;
      if (loaded && guardBigwinClass(loaded.BigwinView || loaded.default)) return;
    } catch (_error) {
      // The module may be registered but not executed yet.
    }
    if (tries < 240) {
      window.setTimeout(function () {
        installBigwinCompletionGuard(tries + 1);
      }, 250);
    }
  }

  function guardGameViewClass(GameView) {
    var prototype = GameView && GameView.prototype;
    if (!prototype || prototype.__yachiyoInitializationGuard) return false;
    var originalInit = prototype.init;
    if (typeof originalInit !== 'function') return false;

    prototype.init = function () {
      this.__yachiyoInitializationStatus = 'running';
      this.__yachiyoInitializationError = '';
      try {
        var result = originalInit.apply(this, arguments);
        this.__yachiyoInitializationStatus = 'ready';
        return result;
      } catch (error) {
        this.__yachiyoInitializationStatus = 'failed';
        this.__yachiyoInitializationError =
          error && error.message ? String(error.message) : 'unknown game view error';
        window.setTimeout(function () {
          failGameEntryTransition('遊戲介面初始化失敗・重新整理', 'game-view-init');
        }, 0);
        throw error;
      }
    };
    prototype.__yachiyoInitializationGuard = true;
    return true;
  }

  function installGameViewInitializationGuard(attempt) {
    var tries = Number(attempt || 0);
    var loader = window.System;
    var moduleId = 'chunks:///_virtual/GameView.ts';
    try {
      var loaded = loader && typeof loader.get === 'function' ? loader.get(moduleId) : null;
      if (loaded && guardGameViewClass(loaded.default || loaded.GameView)) return;
    } catch (_error) {
      // The game bundle registers this class after the framework has loaded.
    }
    if (tries < 240) {
      window.setTimeout(function () {
        installGameViewInitializationGuard(tries + 1);
      }, 250);
    }
  }

  function protectPlatformStorage() {
    if (typeof Storage === 'undefined' || Storage.prototype.__yachiyoProtectedClear) return;
    var originalClear = Storage.prototype.clear;
    var protectedKeys = ['bg-auth', SFX_PREFS_KEY, BGM_PREFS_KEY];
    Storage.prototype.clear = function () {
      var preserved = {};
      protectedKeys.forEach(function (key) {
        var value = this.getItem(key);
        if (value !== null) preserved[key] = value;
      }, this);
      originalClear.call(this);
      Object.keys(preserved).forEach(function (key) {
        this.setItem(key, preserved[key]);
      }, this);
    };
    Storage.prototype.__yachiyoProtectedClear = true;
  }

  protectPlatformStorage();
  installFrameworkDispatchGuard();
  installBigwinCompletionGuard(0);
  installGameViewInitializationGuard(0);

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
      window.parent.postMessage(
        Object.assign({ type: type }, payload || {}),
        window.location.origin,
      );
    } catch (_error) {
      // Standalone mode has no parent store to update.
    }
  }

  function randomOperationId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID().replace(/-/g, '');
    }
    var random = Math.random().toString(36).slice(2);
    return 'seth2_' + Date.now().toString(36) + '_' + random + random;
  }

  function operationFingerprint(data) {
    return JSON.stringify({
      action: data.action || 'spin',
      featureIndex: data.featureIndex === undefined ? null : Number(data.featureIndex),
      stakeValue: Number(data.stakeValue),
      ratioValue: Number(data.ratioValue),
      machineId: Number(data.machineId || selectedMachineId),
    });
  }

  function attachPendingOperation(data) {
    var fingerprint = operationFingerprint(data);
    var pending = null;
    try {
      pending = JSON.parse(window.sessionStorage.getItem(PENDING_OPERATION_KEY) || 'null');
    } catch (_error) {
      pending = null;
    }
    var operationId =
      pending && pending.fingerprint === fingerprint && pending.operationId
        ? pending.operationId
        : randomOperationId();
    data.operationId = operationId;
    try {
      window.sessionStorage.setItem(
        PENDING_OPERATION_KEY,
        JSON.stringify({ fingerprint: fingerprint, operationId: operationId }),
      );
    } catch (_error) {
      // The database unique key still protects retries when storage is unavailable.
    }
    return operationId;
  }

  function clearPendingOperation(operationId) {
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
      // Private browsing/storage policy failures must not break a settled spin.
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
      // The parent store is also updated through postMessage below.
    }
    notifyParent('seth2:tokens', { accessToken: accessToken, refreshToken: refreshToken });
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
    return message || fallback;
  }

  function authorizedPost(body, retried) {
    var auth = readAuth();
    if (!auth.accessToken) return Promise.reject(new Error('找不到登入憑證，請回到大廳重新登入'));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = window.setTimeout(function () {
      if (controller) controller.abort();
    }, requestTimeoutMs);
    return fetch(sourceUrl, {
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
            return authorizedPost(body, true);
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

  function prefetchInitialResponse() {
    if (initialResponseInFlight || !readAuth().accessToken) return initialResponseInFlight;
    // Start the read-only platform request while Cocos downloads and parses its
    // engine/assets.  A failed speculative request is ignored and retried when
    // the game actually emits `initial`.
    initialResponseInFlight = authorizedPost({ event: 'initial', data: {} }, false).catch(
      function () {
        return null;
      },
    );
    return initialResponseInFlight;
  }

  function sendRequest(request) {
    if (request.event !== 'initial') return authorizedPost(request, false);
    var prefetched = initialResponseInFlight;
    initialResponseInFlight = null;
    if (!prefetched) return authorizedPost(request, false);
    return prefetched.then(function (response) {
      return response || authorizedPost(request, false);
    });
  }

  function gameStates(response) {
    var states = response && response.engine && response.engine.gameState;
    return Array.isArray(states) ? states : [];
  }

  function normalizeFeatureSequence(response, states) {
    var totalViews = states.length;
    states.forEach(function (state, currentView) {
      state.currentView = currentView;
      state.totalViews = totalViews;
      // Only the purchased/natural trigger opens the intro.  Subsequent free
      // spins are already in the same source sequence and must advance instead
      // of reopening the 15-game alert.
      if (currentView > 0) state.startFreeGame = false;
    });
    response.engine.gameState = states;
    return response;
  }

  function collectFeatureSequence(socket, event, eventData, response) {
    var states = gameStates(response).slice();
    var entry = states[0];
    if (
      event !== 'spin' ||
      !entry ||
      !entry.startFreeGame ||
      entry.action === 'superSpin' ||
      Number(entry.freeGameCount) <= 0
    ) {
      return Promise.resolve(response);
    }

    var nextData = {
      sequenceId: response.engine && response.engine.spinId,
    };

    return authorizedPost({ event: 'collectFeatureSequence', data: nextData }, false).then(
      function (nextResponse) {
        var nextStates = gameStates(nextResponse);
        var finalState = nextStates[nextStates.length - 1];
        if (
          nextStates.length === 0 ||
          !finalState ||
          finalState.action !== 'freeSpin' ||
          Number(finalState.freeGameCount) !== 0
        ) {
          throw new Error('免費遊戲序列不完整，請稍後重試');
        }
        nextStates.forEach(function (state) {
          state.startFreeGame = false;
          states.push(state);
        });
        if (nextResponse.platform) response.platform = nextResponse.platform;
        if (nextResponse.engine && nextResponse.engine.spinId) {
          response.engine.spinId = nextResponse.engine.spinId;
        }
        return normalizeFeatureSequence(response, states);
      },
    );
  }

  function readAudioPreference(key, fallback) {
    try {
      var raw = parentStorage().getItem(key);
      var value = raw ? JSON.parse(raw) : null;
      var volume = Number(value && value.volume);
      return {
        muted: Boolean(value && value.muted),
        volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : fallback,
      };
    } catch (_error) {
      return { muted: false, volume: fallback };
    }
  }

  function applyAudioPreferences(response) {
    var sounds =
      response &&
      response.platform &&
      response.platform.player &&
      response.platform.player.settings &&
      response.platform.player.settings.advancedSettings &&
      response.platform.player.settings.advancedSettings.sounds;
    if (!sounds) return response;
    var music = readAudioPreference(BGM_PREFS_KEY, 0.32);
    var effects = readAudioPreference(SFX_PREFS_KEY, 0.6);
    sounds.background = !music.muted;
    sounds.backgroundVolume = music.muted ? 0 : music.volume;
    sounds.effect = !effects.muted;
    sounds.effectVolume = effects.muted ? 0 : effects.volume;
    return response;
  }

  function syncJackpotPools(socket, response) {
    var pools = response && response.platform && response.platform.jackpotPools;
    if (!pools) return;
    socket.dispatch('notify', { type: 'jackpotUpdate', data: pools });
  }

  function syncRunningAudio() {
    var music = readAudioPreference(BGM_PREFS_KEY, 0.32);
    var effects = readAudioPreference(SFX_PREFS_KEY, 0.6);
    try {
      var audio = window.App && window.App.globalAudio;
      if (audio && typeof audio.getAudioInfo === 'function') {
        var info = audio.getAudioInfo();
        if (info && info.musicSource) info.musicSource.volume = music.muted ? 0 : music.volume;
        if (info && Array.isArray(info.effectSources)) {
          info.effectSources.forEach(function (source) {
            source.volume = effects.muted ? 0 : effects.volume;
          });
        }
      }
    } catch (_error) {
      // Initial settings remain authoritative until the audio nodes are ready.
    }
  }

  function findIntroView() {
    try {
      var cocos = window.cc;
      var scene = cocos && cocos.director && cocos.director.getScene();
      if (!scene || typeof scene.getComponentsInChildren !== 'function') return null;
      var components = scene.getComponentsInChildren(cocos.Component) || [];
      for (var index = 0; index < components.length; index += 1) {
        var component = components[index];
        if (
          component &&
          component.node &&
          component.node.name === 'IntroView' &&
          component.bbr &&
          typeof component.bbr.emit === 'function' &&
          typeof component.startGame === 'object'
        ) {
          return component;
        }
      }
    } catch (_error) {
      // The scene graph is still being built; the ready poll will try again.
    }
    return null;
  }

  function markLoadingComplete() {
    try {
      var loading = window.App && window.App.gameLoading;
      if (!loading) return;
      // GameLoading.complete() contributes the final handler-ready unit. Keep
      // the internal counter at total - 1 so that click reaches exactly 100%
      // (setting it to total here would produce 104% and skip Cocos' hide path).
      var total = Number(loading.loadTotal);
      if (Number.isFinite(total) && total > 0 && Number(loading.loadedNum) >= total) {
        loading.loadedNum = total - 1;
      }
      if (loading.percentText) loading.percentText.string = '100%';
      if (loading.bar) loading.bar.progress = 1;
    } catch (_error) {
      // The entry button remains authoritative even when a source build uses a
      // different loading-label implementation.
    }
  }

  function resumeAudioFromGesture() {
    syncRunningAudio();
    try {
      var audioContext =
        window.cc && window.cc.audioEngine && window.cc.audioEngine._audioContext;
      if (audioContext && audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
        audioContext.resume().catch(function () {});
      }
    } catch (_error) {
      // The original IntroView handler still performs its normal audio setup.
    }
  }

  function gameEntryGate() {
    if (typeof document === 'undefined') return null;
    return document.getElementById(GAME_ENTRY_GATE_ID);
  }

  function gameEntryButton(gate) {
    return gate && typeof gate.querySelector === 'function' ? gate.querySelector('button') : null;
  }

  function setGameEntryGateState(state, label) {
    var gate = gameEntryGate();
    var button = gameEntryButton(gate);
    if (!gate || !button) return;

    var waiting = state === 'loading' || state === 'entering';
    gate.setAttribute('aria-busy', waiting ? 'true' : 'false');
    gate.style.pointerEvents = state === 'ready' ? 'none' : 'auto';
    gate.style.background =
      state === 'ready'
        ? 'transparent'
        : 'radial-gradient(circle at center,rgba(39,16,77,.82) 0%,rgba(5,2,14,.96) 72%)';
    button.dataset.action = state === 'retry' ? 'reload' : 'enter';
    button.disabled = waiting;
    button.textContent = label
      ? label
      : state === 'loading'
        ? '正在準備遊戲…'
        : state === 'entering'
          ? '正在進入遊戲…'
          : state === 'retry'
            ? '載入逾時・重新整理'
            : '進入遊戲';
    button.setAttribute('aria-label', button.textContent);
    button.style.opacity = waiting ? '0.82' : '1';
    button.style.cursor = waiting ? 'wait' : 'pointer';
  }

  function activeChildNamed(parent, name) {
    var children = parent && parent.children;
    if (!children || typeof children.length !== 'number') return false;
    for (var index = 0; index < children.length; index += 1) {
      var child = children[index];
      if (
        child &&
        child.name === name &&
        child.active !== false &&
        child.activeInHierarchy !== false
      ) {
        return true;
      }
    }
    return false;
  }

  function gameCanvasIsReady() {
    if (gameCanvasContextLost || typeof document === 'undefined') return false;
    var canvas = document.getElementById('GameCanvas');
    if (!canvas || Number(canvas.width) < 2 || Number(canvas.height) < 2) return false;
    try {
      var context =
        (typeof canvas.getContext === 'function' && canvas.getContext('webgl2')) ||
        (typeof canvas.getContext === 'function' && canvas.getContext('webgl')) ||
        (typeof canvas.getContext === 'function' && canvas.getContext('experimental-webgl'));
      return Boolean(context && (!context.isContextLost || !context.isContextLost()));
    } catch (_error) {
      return false;
    }
  }

  function isGameEntryTransitionReady() {
    try {
      var app = window.App;
      var loading = app && app.gameLoading;
      var gameView = app && app.gameView;
      var loadingClosed = !loading || !loading.node || loading.node.active === false;
      var gameViewActive =
        gameView &&
        gameView.node &&
        gameView.node.active !== false &&
        gameView.node.activeInHierarchy !== false;
      var uiReady =
        gameView &&
        gameView.__yachiyoInitializationStatus !== 'failed' &&
        gameView.slotUIMap &&
        Number(gameView.slotUIMap.size) >= GAME_ENTRY_REQUIRED_UI_COUNT;
      var boardReady =
        gameView &&
        activeChildNamed(gameView.gameLayer, 'BackgroundView') &&
        activeChildNamed(gameView.gameLayer, 'ReelView') &&
        activeChildNamed(gameView.gameLayer, 'SymbolView');
      return Boolean(loadingClosed && gameViewActive && uiReady && boardReady && gameCanvasIsReady());
    } catch (_error) {
      return false;
    }
  }

  function afterGameEntryPaint(callback, remainingFrames) {
    var frames = remainingFrames === undefined ? 6 : Number(remainingFrames);
    if (frames <= 0) {
      // WebKit can report active scene nodes one frame before their textures
      // are presented. Give it a compositor turn before uncovering it.
      window.setTimeout(callback, 300);
      return;
    }
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        afterGameEntryPaint(callback, frames - 1);
      });
      return;
    }
    window.setTimeout(function () {
      afterGameEntryPaint(callback, frames - 1);
    }, 16);
  }

  function bindGameCanvasRecovery() {
    if (gameCanvasRecoveryBound || typeof document === 'undefined') return false;
    var canvas = document.getElementById('GameCanvas');
    if (!canvas || typeof canvas.addEventListener !== 'function') return false;
    gameCanvasRecoveryBound = true;
    canvas.addEventListener(
      'webglcontextlost',
      function (event) {
        gameCanvasContextLost = true;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        failGameEntryTransition('遊戲畫面已中斷・重新整理', 'webgl-context-lost');
      },
      false,
    );
    canvas.addEventListener(
      'webglcontextrestored',
      function () {
        gameCanvasContextLost = false;
      },
      false,
    );
    return true;
  }

  function failGameEntryTransition(label, stage) {
    if (gameEntryTransitionTimer) {
      window.clearTimeout(gameEntryTransitionTimer);
      gameEntryTransitionTimer = 0;
    }
    gameEntryPaintPending = false;
    gameEntryInProgress = false;
    createGameEntryGate('retry');
    setGameEntryGateState('retry', label);
    notifyParent('seth2:entry-timeout', { stage: stage || 'game-view' });
  }

  function watchGameEntryTransition() {
    if (!gameEntryInProgress) return;
    if (gameEntryTransitionTimer) {
      window.clearTimeout(gameEntryTransitionTimer);
      gameEntryTransitionTimer = 0;
    }

    var gameView = window.App && window.App.gameView;
    if (gameView && gameView.__yachiyoInitializationStatus === 'failed') {
      failGameEntryTransition('遊戲介面初始化失敗・重新整理', 'game-view-init');
      return;
    }
    if (gameCanvasContextLost) {
      failGameEntryTransition('遊戲畫面已中斷・重新整理', 'webgl-context-lost');
      return;
    }

    if (isGameEntryTransitionReady()) {
      if (gameEntryPaintPending) return;
      gameEntryPaintPending = true;
      afterGameEntryPaint(function () {
        gameEntryPaintPending = false;
        if (!gameEntryInProgress) return;
        if (!isGameEntryTransitionReady()) {
          watchGameEntryTransition();
          return;
        }
        removeGameEntryGate();
        notifyParent('seth2:entered');
      });
      return;
    }

    if (Date.now() - gameEntryTransitionStartedAt >= GAME_ENTRY_TRANSITION_TIMEOUT_MS) {
      failGameEntryTransition('載入逾時・重新整理', 'game-view');
      return;
    }
    gameEntryTransitionTimer = window.setTimeout(watchGameEntryTransition, 100);
  }

  function removeGameEntryGate() {
    if (gameEntryPollTimer) {
      window.clearTimeout(gameEntryPollTimer);
      gameEntryPollTimer = 0;
    }
    if (gameEntryTransitionTimer) {
      window.clearTimeout(gameEntryTransitionTimer);
      gameEntryTransitionTimer = 0;
    }
    gameEntryPaintPending = false;
    gameEntryInProgress = false;
    if (typeof document === 'undefined') return;
    var gate = gameEntryGate();
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
  }

  function enterReadyGame() {
    if (gameEntryInProgress) return false;
    var introView = findIntroView();
    if (!introView) return false;
    gameEntryInProgress = true;
    gameEntryTransitionStartedAt = Date.now();
    setGameEntryGateState('entering');
    resumeAudioFromGesture();
    try {
      var eventType =
        window.cc && window.cc.Node && window.cc.Node.EventType
          ? window.cc.Node.EventType.TOUCH_START
          : 'touch-start';
      introView.bbr.emit(eventType, {});
      watchGameEntryTransition();
      return true;
    } catch (_error) {
      if (gameEntryTransitionTimer) {
        window.clearTimeout(gameEntryTransitionTimer);
        gameEntryTransitionTimer = 0;
      }
      gameEntryInProgress = false;
      setGameEntryGateState('ready');
      return false;
    }
  }

  function createGameEntryGate(initialState) {
    if (typeof document === 'undefined' || !document.body) return false;
    if (document.getElementById(GAME_ENTRY_GATE_ID)) {
      if (initialState) setGameEntryGateState(initialState);
      return true;
    }

    var gate = document.createElement('div');
    gate.id = GAME_ENTRY_GATE_ID;
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-label', '遊戲載入完成');
    gate.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;' +
      'justify-content:center;pointer-events:none;padding:24px;box-sizing:border-box;' +
      'background:transparent;transition:background .18s ease;';

    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = '進入遊戲';
    button.setAttribute('aria-label', '進入遊戲');
    button.style.cssText =
      'pointer-events:auto;min-width:180px;min-height:58px;padding:14px 34px;border:2px solid #ffe894;' +
      'border-radius:999px;background:linear-gradient(180deg,#8c4cff 0%,#5a20c9 100%);' +
      'box-shadow:0 8px 28px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.45);' +
      'color:#fff;font:800 20px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
      'letter-spacing:.08em;text-shadow:0 2px 3px rgba(0,0,0,.55);touch-action:manipulation;' +
      '-webkit-tap-highlight-color:transparent;cursor:pointer;';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.action === 'reload') {
        window.location.reload();
        return;
      }
      if (!enterReadyGame()) gameEntryInProgress = false;
    });
    gate.appendChild(button);
    document.body.appendChild(gate);
    setGameEntryGateState(initialState || 'ready');
    window.setTimeout(function () {
      if (typeof button.focus === 'function') button.focus({ preventScroll: true });
    }, 0);
    return true;
  }

  function showGameEntryGateWhenReady() {
    if (typeof document === 'undefined') return;
    if (gameEntryPollTimer) window.clearTimeout(gameEntryPollTimer);
    gameEntryPollTimer = 0;

    if (isGameEntryTransitionReady()) {
      removeGameEntryGate();
      notifyParent('seth2:entered');
      return;
    }

    if (findIntroView()) {
      markLoadingComplete();
      createGameEntryGate('ready');
      return;
    }

    if (Date.now() - gameEntryPollStartedAt >= GAME_ENTRY_BOOT_TIMEOUT_MS) {
      failGameEntryTransition('遊戲素材載入逾時・重新整理', 'intro-view');
      return;
    }
    createGameEntryGate('loading');
    gameEntryPollTimer = window.setTimeout(showGameEntryGateWhenReady, 125);
  }

  function scheduleGameEntryGate() {
    gameEntryPollStartedAt = Date.now();
    gameEntryTransitionStartedAt = 0;
    gameEntryPaintPending = false;
    gameEntryInProgress = false;
    bindGameCanvasRecovery();
    createGameEntryGate('loading');
    showGameEntryGateWhenReady();
  }

  function LocalSocket() {
    this.connected = false;
    this.handlers = Object.create(null);
    this.queue = Promise.resolve();
    this.lastStakeData = Object.create(null);
    var socket = this;
    window.setTimeout(function () {
      socket.connected = true;
      socket.dispatch('connect');
    }, 0);
  }

  LocalSocket.prototype.on = function (event, handler) {
    (this.handlers[event] || (this.handlers[event] = [])).push(handler);
    return this;
  };

  LocalSocket.prototype.off = function (event, handler) {
    var handlers = this.handlers[event] || [];
    this.handlers[event] = handlers.filter(function (candidate) {
      return candidate !== handler;
    });
    return this;
  };

  LocalSocket.prototype.dispatch = function (event, payload) {
    (this.handlers[event] || []).slice().forEach(function (handler) {
      handler(payload);
    });
  };

  LocalSocket.prototype.emit = function (event, data, callback) {
    var socket = this;
    var eventData = Object.assign({}, data || {});
    if (event === 'updateSlotTable') {
      var requestedTable = eventData.table || eventData;
      selectedMachineId = Number(
        requestedTable.machineId || requestedTable.roomId || requestedTable.number || 1,
      );
    }
    if (event === 'spin' || event === 'getSlotTables') {
      eventData.machineId = selectedMachineId;
    }
    if (event === 'spin') {
      ['stakeIndex', 'stakeValue', 'ratioIndex', 'ratioValue'].forEach(function (key) {
        if (eventData[key] !== undefined) socket.lastStakeData[key] = eventData[key];
      });
    }
    if (event === 'initial') {
      // Read-only boot requests are intentionally not assigned operation IDs.
    } else if (event === 'spin' && !eventData.spinId) {
      attachPendingOperation(eventData);
    }
    if (event === 'closeSpin') {
      eventData.spinId = String(eventData.spinId || lastSpinId || '');
    }
    if (event === 'updateSettings' && !eventData.settings) {
      eventData = { settings: Object.assign({}, eventData) };
    }
    var request = { event: event, data: eventData };
    this.queue = this.queue
      .then(function () {
        return sendRequest(request);
      })
      .then(function (response) {
        return collectFeatureSequence(socket, event, eventData, response);
      })
      .then(function (response) {
        var responseSpinId =
          response &&
          response.engine &&
          (response.engine.spinId ||
            (Array.isArray(response.engine.gameState) &&
              response.engine.gameState[0] &&
              response.engine.gameState[0].spinId));
        if (responseSpinId) lastSpinId = String(responseSpinId);
        syncJackpotPools(socket, response);
        if (event === 'spin' && eventData.operationId) {
          clearPendingOperation(eventData.operationId);
        }
        if (event === 'initial') {
          var table = response && response.platform && response.platform.table;
          if (table) selectedMachineId = Number(table.roomId || table.number || 1);
          if (response.isResuming && gameStates(response).length > 1) {
            normalizeFeatureSequence(response, gameStates(response));
            lastSpinId = String(response.engine.spinId || gameStates(response)[0].spinId || '');
          }
          applyAudioPreferences(response);
          var balance = Number(
            response &&
              response.platform &&
              response.platform.player &&
              response.platform.player.balance &&
              response.platform.player.balance.amount,
          );
          notifyParent('seth2:ready', { balance: balance });
          scheduleGameEntryGate();
        } else if (response && response.platform && response.platform.player) {
          notifyParent('seth2:balance', {
            balance: Number(response.platform.player.balance.amount),
          });
        }
        if (typeof callback === 'function') callback(response);
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '遊戲連線失敗';
        notifyParent('seth2:error', { message: message });
        if (event === 'spin' && eventData.action === 'buyFeature') {
          try {
            dispatch('GameEvent:CLOSE_FEATURE_POPUP');
          } catch (_error) {
            // If the game module has not mounted yet, the next open creates fresh buttons.
          }
        }
        if (typeof callback === 'function')
          callback({ status: 500, code: 'LOCAL_BRIDGE', message: message });
        socket.dispatch('error', { message: message });
      });
    return this;
  };

  LocalSocket.prototype.close = function () {
    if (!this.connected) return this;
    this.connected = false;
    this.dispatch('disconnect', { reason: 'client close' });
    return this;
  };

  LocalSocket.prototype.disconnect = LocalSocket.prototype.close;

  var originalIo = window.io;
  function localIo() {
    return new LocalSocket();
  }
  function captureOriginalIo(candidate) {
    if (!candidate || candidate === localIo) return;
    originalIo = candidate;
    Object.keys(candidate).forEach(function (key) {
      // Preserve useful constructors/constants without replacing the local
      // connection entry point with Socket.IO's real network connector.
      if (key !== 'connect') localIo[key] = candidate[key];
    });
    window.__YachiyoOriginalIo = candidate;
  }
  captureOriginalIo(originalIo);
  localIo.connect = localIo;
  try {
    Object.defineProperty(window, 'io', {
      configurable: true,
      get: function () {
        return localIo;
      },
      set: captureOriginalIo,
    });
  } catch (_error) {
    window.io = localIo;
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== window.parent || !event.data)
      return;
    if (event.data.type === 'seth2:audio-sync' || event.data.type === 'seth2:audio-unlock') {
      syncRunningAudio();
    }
  });
  window.addEventListener('storage', function (event) {
    if (event.key === SFX_PREFS_KEY || event.key === BGM_PREFS_KEY) syncRunningAudio();
  });
  window.__YachiyoSeth2UnlockAudio = syncRunningAudio;
  window.__YachiyoSeth2SourceAdapterTest = {
    LocalSocket: LocalSocket,
    applyAudioPreferences: applyAudioPreferences,
    collectFeatureSequence: collectFeatureSequence,
    prefetchInitialResponse: prefetchInitialResponse,
    publicError: publicError,
    guardBigwinClass: guardBigwinClass,
    wrapFrameworkDispatch: wrapFrameworkDispatch,
    findIntroView: findIntroView,
    enterReadyGame: enterReadyGame,
    failGameEntryTransition: failGameEntryTransition,
    gameCanvasIsReady: gameCanvasIsReady,
    guardGameViewClass: guardGameViewClass,
    isGameEntryTransitionReady: isGameEntryTransitionReady,
    markLoadingComplete: markLoadingComplete,
    watchGameEntryTransition: watchGameEntryTransition,
  };

  if (typeof document !== 'undefined') prefetchInitialResponse();
})();
