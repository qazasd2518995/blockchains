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
  var ACTIVE_SPIN_KEY = 'bg.seth2.active-spin';
  var SFX_PREFS_KEY = 'bg.sfx.prefs';
  var BGM_PREFS_KEY = 'bg.bgm.prefs';
  var UPDATE_TOTAL_WINNINGS = 'SlotFrameworkEvent:UPDATE_TOTAL_WINNINGS';
  var CREATE_SPIN_COMPLETE_FLOW = 'GameEvent:CREATE_SPIN_COMPLETE_FLOW';
  var SHOW_CHARACTER_FIRE = 'GameEvent:SHOW_CHARACTER_FIRE';
  var SHOW_CLONE_TIMES_MOVING = 'GameEvent:SHOW_CLONE_TIMES_MOVING';
  var SHOW_TIMES_B = 'GameEvent:SHOW_TIMES_B';
  var SYMBOL_LANDING_EVENTS = {
    'GameEvent:SHOW_SYMBOLS_IN_ANIM': true,
    'GameEvent:SHOW_NEW_SYMBOLS_IN_ANIM': true,
    'GameEvent:SHOW_SYMBOLS_QUICK_IN_ANIM': true,
  };
  var CHARACTER_FIRE_LEAD_MS = 700;
  // The source game starts the moving clone while its source symbol is still
  // playing split_A. On slower mobile renderers the projectile can therefore
  // finish before split_B asks to create the authoritative target symbol. Do
  // not guess that timing: hold the projectile until split_B is ready and use
  // the effect's real completion callback before materializing the target.
  var SPLIT_CLONE_START_FALLBACK_MS = 2000;
  var SPLIT_CLONE_COMPLETE_FALLBACK_MS = 4000;
  var GAME_ENTRY_BOOT_TIMEOUT_MS = 60000;
  var GAME_ENTRY_REQUIRED_UI_COUNT = 4;
  var TABLE_REFERENCE_REFRESH_MS = 5000;
  var TABLE_OCCUPANCY_REFRESH_MS = 30000;
  var TABLES_PER_PAGE = 500;
  var SIMULATED_MARQUEE_INITIAL_DELAY_MS = 2500;
  var SIMULATED_MARQUEE_MIN_INTERVAL_MS = 5000;
  var SIMULATED_MARQUEE_INTERVAL_SWING_MS = 2500;
  var gameEntryPollTimer = 0;
  var tableReferenceRefreshTimer = 0;
  var gameEntryPollStartedAt = 0;
  var gameEntryIntroNotified = false;
  var gameEntryCompleted = false;
  var gameCanvasRecoveryBound = false;
  var gameCanvasContextLost = false;
  var gameEntryDisposing = false;
  var rotateScreenPatched = false;
  var shellHandlesTableChanges = false;
  var progressInFlight = null;
  var queuedProgress = null;
  var capturedAudioContexts = [];
  var characterFireLeadUntil = 0;
  var pendingSymbolLandingTimer = 0;
  var splitCloneSequence = 0;
  var splitCloneMoving = false;
  var queuedSplitMovingDispatch = null;
  var pendingSplitTargetDispatches = [];
  var splitCloneStartFallbackTimer = 0;
  var splitCloneCompleteFallbackTimer = 0;

  function installAudioContextCapture() {
    var NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    if (typeof NativeAudioContext !== 'function' || NativeAudioContext.__yachiyoAudioCapture)
      return;

    function CapturedAudioContext() {
      var args = Array.prototype.slice.call(arguments);
      var context;
      if (typeof Reflect === 'object' && typeof Reflect.construct === 'function') {
        context = Reflect.construct(NativeAudioContext, args);
      } else {
        context = new NativeAudioContext();
      }
      if (capturedAudioContexts.indexOf(context) < 0) capturedAudioContexts.push(context);
      return context;
    }

    CapturedAudioContext.prototype = NativeAudioContext.prototype;
    CapturedAudioContext.__yachiyoAudioCapture = true;
    try {
      Object.setPrototypeOf(CapturedAudioContext, NativeAudioContext);
    } catch (_error) {
      // Static AudioContext properties are optional for the Cocos runtime.
    }
    try {
      window.AudioContext = CapturedAudioContext;
      if (window.webkitAudioContext === NativeAudioContext) {
        window.webkitAudioContext = CapturedAudioContext;
      }
    } catch (_error) {
      // Older WebViews can expose a read-only constructor. Cocos' own canvas
      // gesture fallback remains available in that case.
    }
  }

  function resumeCapturedAudioContexts() {
    var activeContexts = [];
    for (var index = 0; index < capturedAudioContexts.length; index += 1) {
      var context = capturedAudioContexts[index];
      if (!context || context.state === 'closed') continue;
      activeContexts.push(context);
      if (context.state === 'running' || typeof context.resume !== 'function') continue;
      try {
        var resumeResult = context.resume();
        if (resumeResult && typeof resumeResult.catch === 'function') {
          resumeResult.catch(function () {});
        }
      } catch (_error) {
        // A later real gesture can retry the same suspended context.
      }
    }
    capturedAudioContexts = activeContexts;
    return activeContexts.length;
  }

  installAudioContextCapture();

  function clearSplitCloneTimer(timer) {
    if (timer) window.clearTimeout(timer);
    return 0;
  }

  function finishSplitCloneTravel(sequence) {
    if (sequence !== undefined && sequence !== splitCloneSequence) return false;
    splitCloneMoving = false;
    splitCloneCompleteFallbackTimer = clearSplitCloneTimer(splitCloneCompleteFallbackTimer);
    var targetDispatches = pendingSplitTargetDispatches.splice(0);
    targetDispatches.forEach(function (pending) {
      pending.dispatcher.apply(pending.receiver, pending.args);
    });
    return targetDispatches.length > 0;
  }

  function startQueuedSplitMoving() {
    var pending = queuedSplitMovingDispatch;
    if (!pending) return false;
    queuedSplitMovingDispatch = null;
    splitCloneStartFallbackTimer = clearSplitCloneTimer(splitCloneStartFallbackTimer);
    splitCloneMoving = true;
    var sequence = pending.sequence;
    splitCloneCompleteFallbackTimer = clearSplitCloneTimer(splitCloneCompleteFallbackTimer);
    splitCloneCompleteFallbackTimer = window.setTimeout(function () {
      finishSplitCloneTravel(sequence);
    }, SPLIT_CLONE_COMPLETE_FALLBACK_MS);
    pending.dispatcher.apply(pending.receiver, pending.args);
    return true;
  }

  function queueSplitMovingDispatch(dispatcher, receiver, args) {
    if (queuedSplitMovingDispatch || splitCloneMoving || pendingSplitTargetDispatches.length > 0) {
      finishSplitCloneTravel();
    }
    splitCloneSequence += 1;
    var sequence = splitCloneSequence;
    queuedSplitMovingDispatch = {
      dispatcher: dispatcher,
      receiver: receiver,
      args: args,
      sequence: sequence,
    };
    splitCloneStartFallbackTimer = clearSplitCloneTimer(splitCloneStartFallbackTimer);
    splitCloneStartFallbackTimer = window.setTimeout(function () {
      if (queuedSplitMovingDispatch && queuedSplitMovingDispatch.sequence === sequence) {
        startQueuedSplitMoving();
      }
    }, SPLIT_CLONE_START_FALLBACK_MS);
  }

  function guardEffectsViewClass(EffectsView) {
    var prototype = EffectsView && EffectsView.prototype;
    if (!prototype || prototype.__yachiyoSplitCompletionGuard) return Boolean(prototype);
    var originalShowCloneTimesMoving = prototype.showCloneTimesMoving;
    if (typeof originalShowCloneTimesMoving !== 'function') return false;

    prototype.showCloneTimesMoving = function (from, targets, originalComplete) {
      var completed = false;
      var sequence = splitCloneSequence;
      return originalShowCloneTimesMoving.call(this, from, targets, function () {
        if (completed) return undefined;
        completed = true;
        var result;
        try {
          if (typeof originalComplete === 'function') {
            result = originalComplete.apply(this, arguments);
          }
        } finally {
          finishSplitCloneTravel(sequence);
        }
        return result;
      });
    };
    prototype.__yachiyoSplitCompletionGuard = true;
    return true;
  }

  function installEffectsViewSplitGuard(attempt) {
    var tries = Number(attempt || 0);
    var loader = window.System;
    var moduleId = 'chunks:///_virtual/EffectsView.ts';
    try {
      var loaded = loader && typeof loader.get === 'function' ? loader.get(moduleId) : null;
      if (loaded && guardEffectsViewClass(loaded.EffectsView || loaded.default)) return;
    } catch (_error) {
      // The effect module may be registered but not executed yet.
    }
    if (tries < 240) {
      window.setTimeout(function () {
        installEffectsViewSplitGuard(tries + 1);
      }, 250);
    }
  }

  function wrapFrameworkDispatch(dispatcher) {
    if (typeof dispatcher !== 'function' || dispatcher.__yachiyoTotalWinGuard) return dispatcher;
    function guardedDispatch() {
      var eventName = arguments[0];
      var event = arguments[1];
      if (eventName === CREATE_SPIN_COMPLETE_FLOW) advanceActiveSpinProgress();
      if (eventName === SHOW_CLONE_TIMES_MOVING) {
        queueSplitMovingDispatch(dispatcher, this, Array.prototype.slice.call(arguments));
        return undefined;
      }
      if (eventName === SHOW_TIMES_B) {
        // split_B is the source animation's exact hand-off point. Start the
        // held projectile now, then keep the real target multiplier hidden
        // until EffectsView reports that every projectile has been destroyed.
        startQueuedSplitMoving();
        if (splitCloneMoving) {
          pendingSplitTargetDispatches.push({
            dispatcher: dispatcher,
            receiver: this,
            args: Array.prototype.slice.call(arguments),
          });
          return undefined;
        }
      }
      if (eventName === SHOW_CHARACTER_FIRE) {
        // Start the character/fireball immediately, then give it a visible
        // lead before the new multiplier symbol begins falling. The source
        // flow only leaves 300 ms and a previous adapter accidentally reversed
        // the order, making the ball appear before the throw animation.
        characterFireLeadUntil = Date.now() + CHARACTER_FIRE_LEAD_MS;
      }
      if (SYMBOL_LANDING_EVENTS[eventName]) {
        var landingDelay = characterFireLeadUntil - Date.now();
        if (landingDelay > 0) {
          var landingReceiver = this;
          var landingArgs = Array.prototype.slice.call(arguments);
          if (pendingSymbolLandingTimer) window.clearTimeout(pendingSymbolLandingTimer);
          pendingSymbolLandingTimer = window.setTimeout(function () {
            pendingSymbolLandingTimer = 0;
            dispatcher.apply(landingReceiver, landingArgs);
          }, landingDelay);
          return undefined;
        }
        if (pendingSymbolLandingTimer) {
          window.clearTimeout(pendingSymbolLandingTimer);
          pendingSymbolLandingTimer = 0;
        }
      }
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
          notifyParent('seth2:error', {
            message: '遊戲介面初始化失敗，請重新整理後再試',
            stage: 'game-view-init',
          });
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
    var protectedKeys = [
      'bg-auth',
      PENDING_OPERATION_KEY,
      ACTIVE_SPIN_KEY,
      SFX_PREFS_KEY,
      BGM_PREFS_KEY,
    ];
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
  installEffectsViewSplitGuard(0);
  installBigwinCompletionGuard(0);
  installGameViewInitializationGuard(0);

  function parentStorage() {
    try {
      return window.parent.localStorage;
    } catch (_error) {
      return window.localStorage;
    }
  }

  function readActiveSpin() {
    try {
      var value = JSON.parse(parentStorage().getItem(ACTIVE_SPIN_KEY) || 'null');
      if (
        !value ||
        typeof value.spinId !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(value.spinId) ||
        !Number.isFinite(Number(value.cursor)) ||
        !Number.isFinite(Number(value.totalViews))
      ) {
        return null;
      }
      return {
        spinId: value.spinId,
        cursor: Math.max(0, Math.floor(Number(value.cursor))),
        totalViews: Math.max(1, Math.floor(Number(value.totalViews))),
        durable: value.durable === true,
      };
    } catch (_error) {
      return null;
    }
  }

  function writeActiveSpin(value) {
    try {
      parentStorage().setItem(ACTIVE_SPIN_KEY, JSON.stringify(value));
    } catch (_error) {
      // Server-side feature recovery still replays the complete sequence when
      // persistent browser storage is unavailable.
    }
    return value;
  }

  function clearActiveSpin(spinId) {
    var active = readActiveSpin();
    if (spinId && active && active.spinId !== String(spinId)) return;
    try {
      var storage = parentStorage();
      if (typeof storage.removeItem === 'function') storage.removeItem(ACTIVE_SPIN_KEY);
      else storage.setItem(ACTIVE_SPIN_KEY, '');
    } catch (_error) {
      // A stale marker is harmless: the server only resumes a recent spin
      // owned by the current player and ignores completed feature sequences.
    }
  }

  function initialRequestData(data) {
    var result = Object.assign({}, data || {});
    var active = readActiveSpin();
    if (active) result.resumeSpinId = active.spinId;
    return result;
  }

  function responseSpinId(response) {
    return String(
      (response &&
        response.engine &&
        (response.engine.spinId ||
          (Array.isArray(response.engine.gameState) &&
            response.engine.gameState[0] &&
            response.engine.gameState[0].spinId))) ||
        '',
    );
  }

  function rememberNewSpin(response) {
    var states = gameStates(response);
    var spinId = responseSpinId(response);
    if (!spinId || states.length === 0) return null;
    var durable = states.some(function (state) {
      return state.startFreeGame || state.action === 'freeSpin' || state.action === 'superSpin';
    });
    return writeActiveSpin({
      spinId: spinId,
      cursor: 0,
      totalViews: states.length,
      durable: durable,
    });
  }

  function applyStoredResumeProgress(response) {
    var originalStates = gameStates(response);
    var states = repairTerminalFemaleGuarantee(originalStates);
    var spinId = responseSpinId(response);
    if (!response || !response.isResuming || !spinId || states.length === 0) return response;
    var serverCursor = Math.max(0, Math.floor(Number(response.resumeCursor) || 0));
    var repairedViews = Math.max(0, originalStates.length - states.length);
    var totalViews = Math.max(
      states.length + serverCursor,
      Math.max(0, Math.floor(Number(response.resumeTotalViews) || 0) - repairedViews),
    );
    var active = readActiveSpin();
    var requestedCursor =
      active && active.spinId === spinId ? Math.max(serverCursor, active.cursor) : serverCursor;
    var nextCursor = Math.min(requestedCursor, totalViews - 1);
    // A multiplier collection view reads the preceding win from preSpinData.
    // Keep one completed view as context instead of resuming on an isolated
    // collection frame that would silently skip its animation.
    var absoluteCursor =
      nextCursor > serverCursor ? Math.max(serverCursor, nextCursor - 1) : serverCursor;
    var relativeCursor = Math.min(Math.max(0, absoluteCursor - serverCursor), states.length - 1);
    if (relativeCursor > 0) states = states.slice(relativeCursor);
    normalizeFeatureSequence(response, states);
    response.resumeCursor = serverCursor + relativeCursor;
    response.resumeTotalViews = totalViews;
    writeActiveSpin({
      spinId: spinId,
      cursor: response.resumeCursor,
      totalViews: totalViews,
      durable: response.resumeKind === 'feature',
    });
    return response;
  }

  function flushFeatureProgress() {
    if (progressInFlight || !queuedProgress) return;
    var progress = queuedProgress;
    queuedProgress = null;
    progressInFlight = authorizedPost(
      {
        event: 'updateFeatureProgress',
        data: { sequenceId: progress.spinId, completedViews: progress.cursor },
      },
      false,
    )
      .catch(function () {
        // The local cursor remains available for same-device recovery; a later
        // completed view retries with a monotonically larger cursor.
        return null;
      })
      .finally(function () {
        progressInFlight = null;
        flushFeatureProgress();
      });
  }

  function advanceActiveSpinProgress() {
    var active = readActiveSpin();
    if (!active) return null;
    active.cursor = Math.min(active.totalViews, active.cursor + 1);
    writeActiveSpin(active);
    if (active.durable && active.cursor > 0) {
      if (!queuedProgress || queuedProgress.spinId !== active.spinId) queuedProgress = active;
      else queuedProgress.cursor = Math.max(queuedProgress.cursor, active.cursor);
      flushFeatureProgress();
    }
    return active;
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
    var attemptedRefreshToken = auth.refreshToken;
    refreshInFlight = fetch(apiBase + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: attemptedRefreshToken }),
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok || !body.accessToken || !body.refreshToken) {
            // The parent React application and this same-origin iframe share
            // one rotating refresh token. If the parent won the refresh race,
            // reuse the newly persisted pair instead of treating the consumed
            // token as a logout and leaving the Cocos canvas black.
            var latest = readAuth();
            if (
              latest.accessToken &&
              latest.refreshToken &&
              latest.refreshToken !== attemptedRefreshToken
            ) {
              return latest.accessToken;
            }
            var error = new Error(body.message || '登入已過期，請回到大廳重新登入');
            error.code = body.code || 'UNAUTHORIZED';
            throw error;
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
    if (!auth.accessToken) {
      if (!retried && auth.refreshToken) {
        return refreshAccessToken().then(function () {
          return authorizedPost(body, true);
        });
      }
      return Promise.reject(new Error('找不到登入憑證，請回到大廳重新登入'));
    }
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
    initialResponseInFlight = authorizedPost(
      { event: 'initial', data: initialRequestData({}) },
      false,
    ).catch(function () {
      return null;
    });
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

  function repairTerminalFemaleGuarantee(states) {
    if (!Array.isArray(states) || states.length < 3) return states;
    var previous = states[states.length - 3];
    var trigger = states[states.length - 2];
    var finalState = states[states.length - 1];
    var triggerWins = trigger && trigger.winSymbols;
    var triggerTimes = trigger && trigger.timesSymbols;
    var malformed =
      previous &&
      Array.isArray(previous.winSymbols) &&
      previous.winSymbols.length > 0 &&
      trigger &&
      Number(trigger.freeGameCount) === 0 &&
      Number(trigger.femaleTotemLevel) > 0 &&
      Array.isArray(triggerWins) &&
      triggerWins.length > 0 &&
      triggerWins.every(function (win) {
        return Number(win && win.symbol) === 18 && Number(win && win.winnings) === 0;
      }) &&
      Array.isArray(triggerTimes) &&
      triggerTimes.some(function (symbol) {
        return Number(symbol && symbol.lock) > 0;
      }) &&
      finalState &&
      Number(finalState.freeGameCount) === 0 &&
      Array.isArray(finalState.winSymbols) &&
      finalState.winSymbols.length === 0;
    if (!malformed) return states;

    // Builds deployed before the terminal-lock fix stored one bad presentation
    // frame between the real last win and its authoritative collection view.
    // Keep the original board/multipliers as transient client context, retain
    // the final winnings from the server, and omit only that impossible frame.
    var repairedFinal = Object.assign({}, finalState, {
      view: previous.view,
      currentTimes: previous.currentTimes,
      femaleTotemLevel: 0,
      maleTotemLevel: 0,
      newTimesSymbols: [],
      posTransform: [],
      splitList: [],
      timesSymbols: Array.isArray(previous.timesSymbols) ? previous.timesSymbols : [],
      timesUpgrade: [],
      winSymbols: [],
    });
    return states.slice(0, -3).concat([previous, repairedFinal]);
  }

  function normalizeFeatureSequence(response, states) {
    states = repairTerminalFemaleGuarantee(states);
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
      var audioData = audio && audio.audioData;
      if (!audioData) return;
      // Use the public AudioData methods only after Cocos has created the
      // singleton. Calling GlobalAudio.getAudioInfo() without a URL/bundle (or
      // touching the bridge while it is half-initialized) rejects on iOS.
      if (typeof audioData.setMusicVolume === 'function') {
        audioData.setMusicVolume(music.muted ? 0 : music.volume);
      }
      if (typeof audioData.setEffectVolume === 'function') {
        audioData.setEffectVolume(effects.muted ? 0 : effects.volume);
      }
      if (typeof audioData.setMusicStatus === 'function') {
        audioData.setMusicStatus(!music.muted);
      }
      if (typeof audioData.setEffectStatus === 'function') {
        audioData.setEffectStatus(!effects.muted);
      }
    } catch (_error) {
      // Initial settings remain authoritative until the audio nodes are ready.
    }
  }

  function syncRunningAudioWhenReady() {
    if (!gameEntryCompleted && !isGameEntryTransitionReady()) return false;
    syncRunningAudio();
    return true;
  }

  function unlockOriginalGameAudio() {
    // This must run synchronously inside the real pointer/touch/key gesture.
    // postMessage alone is asynchronous and does not satisfy iOS autoplay.
    resumeCapturedAudioContexts();
    var synced = syncRunningAudioWhenReady();
    if (!synced) return false;
    var music = readAudioPreference(BGM_PREFS_KEY, 0.32);
    var audioData = window.App && window.App.globalAudio && window.App.globalAudio.audioData;
    if (!music.muted && audioData && typeof audioData.resumeMusic === 'function') {
      try {
        audioData.resumeMusic();
      } catch (_error) {
        // The next game sound will reuse the already-resumed AudioContext.
      }
    }
    return true;
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

  function findSlotTableView() {
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
          component.node.activeInHierarchy !== false &&
          component.slotTableMap &&
          typeof component.slotTableMap.forEach === 'function' &&
          typeof component.slotTableMap.has === 'function' &&
          typeof component.setTableInfo === 'function'
        ) {
          return component;
        }
      }
    } catch (_error) {
      // The selector may be opening or closing between refresh ticks.
    }
    return null;
  }

  function machineReferenceRate(machineId, timestamp, salt) {
    var tick = Math.floor(timestamp / TABLE_REFERENCE_REFRESH_MS);
    var baseUnits = 7800 + ((machineId * 137 + salt * 911) % 4400);
    var phaseUnits = (tick + machineId * 29 + salt * 173) % 720;
    var waveUnits = Math.round(Math.sin((phaseUnits / 720) * Math.PI * 2) * 500);
    var rateUnits = Math.max(7000, Math.min(12999, baseUnits + waveUnits));
    return rateUnits / 100;
  }

  function machineHasSimulatedPlayer(machineId, timestamp) {
    var pageIndex = Math.floor((machineId - 1) / TABLES_PER_PAGE);
    var pagePosition = (machineId - 1) % TABLES_PER_PAGE;
    var tick = Math.floor(timestamp / TABLE_OCCUPANCY_REFRESH_MS);
    var minimumOccupied = Math.ceil(TABLES_PER_PAGE * 0.75);
    var middleOccupied = Math.ceil(TABLES_PER_PAGE * 0.8);
    var occupancySwing = Math.floor(TABLES_PER_PAGE * 0.05);
    var occupiedCount = Math.max(
      minimumOccupied,
      Math.min(
        TABLES_PER_PAGE,
        middleOccupied + Math.round(Math.sin((tick + pageIndex * 31) / 20) * occupancySwing),
      ),
    );
    var rank = (pagePosition * 137 + tick + pageIndex * 83) % TABLES_PER_PAGE;
    return rank < occupiedCount;
  }

  function simulatedHash(value) {
    var hash = value >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^ (hash >>> 16)) >>> 0;
  }

  function formatSimulatedWin(amount) {
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function simulatedMarqueeMessage(sequence, timestamp) {
    var timeBucket = Math.floor(timestamp / 1000);
    var seed = simulatedHash(timeBucket + sequence * 8191);
    var idPrefixes = [
      'Aki',
      'Ace',
      'Kai',
      'Leo',
      'Luna',
      'Mina',
      'Nova',
      'Panda',
      'Rex',
      'Sky',
      '阿凱',
      '小宇',
      '樂樂',
      '大熊',
      '星野',
      '幸運',
    ];
    var prizeProfiles = [
      { winType: 'bigWin', minimum: 800, maximum: 12000 },
      { winType: 'bigWin', minimum: 1200, maximum: 18000 },
      { winType: 'bigWin', minimum: 2000, maximum: 25000 },
      { winType: 'superWin', minimum: 5000, maximum: 60000 },
      { winType: 'superWin', minimum: 8000, maximum: 90000 },
      { winType: 'megaWin', minimum: 20000, maximum: 180000 },
      { winType: 'megaWin', minimum: 30000, maximum: 260000 },
      { winType: 'ultraWin', minimum: 80000, maximum: 500000 },
      { winType: 'legendaryWin', minimum: 200000, maximum: 1200000 },
      { winType: 'jp-mini', minimum: 500, maximum: 5000 },
      { winType: 'jp-mini', minimum: 800, maximum: 8000 },
      { winType: 'jp-minor', minimum: 5000, maximum: 30000 },
      { winType: 'jp-major', minimum: 30000, maximum: 160000 },
      { winType: 'jp-grand', minimum: 200000, maximum: 900000 },
    ];
    var profile = prizeProfiles[seed % prizeProfiles.length];
    var amountSeed = simulatedHash(seed + 1777);
    var amountRangeCents = (profile.maximum - profile.minimum) * 100;
    var amount = (profile.minimum * 100 + (amountSeed % (amountRangeCents + 1))) / 100;
    var playerNumber = String(simulatedHash(seed + 311) % 10000).padStart(4, '0');
    var roomNumber = 1 + (simulatedHash(seed + 977) % 4000);
    return {
      type: 'system',
      data: {
        player: idPrefixes[simulatedHash(seed + 101) % idPrefixes.length] + '***' + playerNumber,
        game: '戰神賽特 II：覺醒之力',
        // The source framework's localized key keeps its historical slug even
        // though the displayed title is the corrected Storm of Seth 2 name.
        gameCode: 'golden-seth',
        win: formatSimulatedWin(amount),
        winType: profile.winType,
        roomNumber: roomNumber,
        simulated: true,
      },
      expiredAt: timestamp + 60000,
      shiftTime: 4,
    };
  }

  function stopSimulatedMarquee(socket) {
    if (!socket) return;
    if (socket.simulatedMarqueeTimer) window.clearTimeout(socket.simulatedMarqueeTimer);
    socket.simulatedMarqueeTimer = 0;
  }

  function startSimulatedMarquee(socket) {
    if (!socket) return false;
    stopSimulatedMarquee(socket);
    socket.simulatedMarqueeSequence = Number(socket.simulatedMarqueeSequence) || 0;
    function scheduleNext(delay) {
      socket.simulatedMarqueeTimer = window.setTimeout(function () {
        socket.simulatedMarqueeTimer = 0;
        if (!socket.connected || gameEntryDisposing) return;
        var timestamp = Date.now();
        var sequence = socket.simulatedMarqueeSequence;
        socket.simulatedMarqueeSequence += 1;
        socket.dispatch('notify', simulatedMarqueeMessage(sequence, timestamp));
        var interval =
          SIMULATED_MARQUEE_MIN_INTERVAL_MS +
          (simulatedHash(timestamp + sequence * 131) % SIMULATED_MARQUEE_INTERVAL_SWING_MS);
        scheduleNext(interval);
      }, delay);
    }
    scheduleNext(SIMULATED_MARQUEE_INITIAL_DELAY_MS);
    return true;
  }

  function machineReferenceStats(machineId, timestamp) {
    var dayMs = 86400000;
    var dayBucket = Math.floor(timestamp / dayMs);
    var tickInDay = Math.floor((timestamp - dayBucket * dayMs) / TABLE_REFERENCE_REFRESH_MS);
    var seed = (machineId * 8191 + dayBucket * 131) % 100003;
    var openingBetCents = 100000 + (seed % 900000);
    var incrementCents = 25 + (seed % 176);
    var todayBet = Number(((openingBetCents + tickInDay * incrementCents) / 100).toFixed(2));
    var dayBet = Number((todayBet + 150000 + ((seed * 37) % 650000)).toFixed(2));
    var todayRate = machineReferenceRate(machineId, timestamp, 0);
    var dayRate = machineReferenceRate(machineId, timestamp, 1);
    var todayWin = Number((todayBet * (todayRate / 100)).toFixed(2));
    var dayWin = Number((dayBet * (dayRate / 100)).toFixed(2));
    var currentCycle = 24 + (seed % 73);
    return {
      dayWin: dayWin,
      dayBet: dayBet,
      hourWin: todayWin,
      hourBet: todayBet,
      todayBet: todayBet,
      todayWin: todayWin,
      mgCounts: [
        1 + ((tickInDay + seed) % currentCycle),
        6 + ((seed * 17 + dayBucket) % 91),
        8 + ((seed * 29 + dayBucket * 3) % 103),
      ],
    };
  }

  function applyTableReferenceStats(view, timestamp) {
    if (
      !view ||
      !view.slotTableMap ||
      typeof view.slotTableMap.forEach !== 'function' ||
      typeof view.slotTableMap.has !== 'function'
    )
      return false;
    view.slotTableMap.forEach(function (item, roomId) {
      if (!item || !item.tableVO || typeof item.setData !== 'function') return;
      var machineId = Number(roomId);
      var stats = machineReferenceStats(machineId, timestamp);
      var currentUser = item.tableVO.user;
      var isCurrentTable = machineId === Number(view.currentRoomId);
      var hasRealPlayer = Boolean(currentUser && currentUser.simulated !== true);
      var preservePlayer = isCurrentTable || hasRealPlayer;
      var simulated = !preservePlayer && machineHasSimulatedPlayer(machineId, timestamp);
      var table = Object.assign({}, item.tableVO, {
        bet: stats.todayBet,
        win: stats.todayWin,
        today: { bet: stats.todayBet, win: stats.todayWin },
        status: preservePlayer ? item.tableVO.status : simulated ? 'Full' : 'Empty',
        user: preservePlayer
          ? currentUser
          : simulated
            ? { userId: 'sim:seth2:' + machineId, simulated: true }
            : null,
      });
      item.setData(table);
    });
    var selectedRoomId = Number(view.selectRoomId);
    if (
      Number.isFinite(selectedRoomId) &&
      view.slotTableMap.has(selectedRoomId) &&
      typeof view.setTableInfo === 'function'
    ) {
      view.setTableInfo({ data: { detail: machineReferenceStats(selectedRoomId, timestamp) } });
    }
    return true;
  }

  function refreshTableReferenceStats() {
    tableReferenceRefreshTimer = 0;
    if (!gameEntryDisposing) applyTableReferenceStats(findSlotTableView(), Date.now());
    scheduleTableReferenceRefresh();
  }

  function scheduleTableReferenceRefresh() {
    if (gameEntryDisposing || tableReferenceRefreshTimer) return;
    tableReferenceRefreshTimer = window.setTimeout(
      refreshTableReferenceStats,
      TABLE_REFERENCE_REFRESH_MS,
    );
  }

  function sourceViewMode() {
    var mode = params.get('view_mode') || window.viewMode;
    return mode === 'portrait' ? 'portrait' : 'landscape';
  }

  function requestViewMode(nextViewMode) {
    if (nextViewMode !== 'portrait' && nextViewMode !== 'landscape') return false;
    try {
      window.localStorage.setItem((params.get('gn') || 'golden-seth') + '_view_mode', nextViewMode);
    } catch (_error) {
      // The query value on the next iframe remains authoritative.
    }
    notifyParent('seth2:view-mode-request', { viewMode: nextViewMode });
    return true;
  }

  function patchRotateScreenButtons() {
    try {
      var cocos = window.cc;
      var scene = cocos && cocos.director && cocos.director.getScene();
      if (!scene || typeof scene.getComponentsInChildren !== 'function') return false;
      var components = scene.getComponentsInChildren(cocos.Component) || [];
      var patched = false;
      for (var index = 0; index < components.length; index += 1) {
        var component = components[index];
        if (
          !component ||
          component.__yachiyoViewModeBridge ||
          typeof component.rotateScreenHandler !== 'function' ||
          typeof component.showConfirmAlert !== 'function'
        ) {
          continue;
        }
        component.__yachiyoViewModeBridge = true;
        component.rotateScreenHandler = function () {
          return requestViewMode(sourceViewMode() === 'portrait' ? 'landscape' : 'portrait');
        };
        patched = true;
      }
      rotateScreenPatched = rotateScreenPatched || patched;
      return rotateScreenPatched;
    } catch (_error) {
      return false;
    }
  }

  function disposeGameForRemount() {
    if (gameEntryDisposing) return false;
    gameEntryDisposing = true;
    gameEntryCompleted = true;
    if (gameEntryPollTimer) {
      window.clearTimeout(gameEntryPollTimer);
      gameEntryPollTimer = 0;
    }
    if (tableReferenceRefreshTimer) {
      window.clearTimeout(tableReferenceRefreshTimer);
      tableReferenceRefreshTimer = 0;
    }
    if (pendingSymbolLandingTimer) {
      window.clearTimeout(pendingSymbolLandingTimer);
      pendingSymbolLandingTimer = 0;
    }
    splitCloneStartFallbackTimer = clearSplitCloneTimer(splitCloneStartFallbackTimer);
    splitCloneCompleteFallbackTimer = clearSplitCloneTimer(splitCloneCompleteFallbackTimer);
    queuedSplitMovingDispatch = null;
    pendingSplitTargetDispatches = [];
    splitCloneMoving = false;
    splitCloneSequence += 1;
    characterFireLeadUntil = 0;
    try {
      if (window.cc && window.cc.game && typeof window.cc.game.pause === 'function') {
        window.cc.game.pause();
      }
      if (window.cc && window.cc.director && typeof window.cc.director.pause === 'function') {
        window.cc.director.pause();
      }
    } catch (_error) {
      // Removing the iframe remains the final cleanup boundary.
    }
    try {
      var canvas = document.getElementById('GameCanvas');
      var context =
        canvas &&
        (canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl'));
      var loseContext = context && context.getExtension('WEBGL_lose_context');
      if (loseContext && typeof loseContext.loseContext === 'function') loseContext.loseContext();
    } catch (_error) {
      // Some WebKit versions reject context access while navigation is pending.
    }
    window.setTimeout(function () {
      notifyParent('seth2:disposed');
    }, 0);
    return true;
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
    // Re-requesting an existing WebGL context is unreliable in mobile Safari
    // and can return null even while the Cocos scene is visibly rendering.
    // Canvas dimensions plus the explicit context-lost event are stable.
    return Boolean(canvas && Number(canvas.width) >= 2 && Number(canvas.height) >= 2);
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
      return Boolean(
        loadingClosed && gameViewActive && uiReady && boardReady && gameCanvasIsReady(),
      );
    } catch (_error) {
      return false;
    }
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
        if (gameEntryDisposing) return;
        notifyParent('seth2:error', {
          message: '遊戲畫面已中斷，請重新整理後再試',
          stage: 'webgl-context-lost',
        });
      },
      false,
    );
    canvas.addEventListener(
      'webglcontextrestored',
      function () {
        gameCanvasContextLost = false;
        scheduleGameEntryObserver();
      },
      false,
    );
    return true;
  }

  function watchOriginalGameEntry() {
    if (gameEntryCompleted) return;
    if (gameEntryPollTimer) window.clearTimeout(gameEntryPollTimer);
    gameEntryPollTimer = 0;
    patchRotateScreenButtons();
    var gameView = window.App && window.App.gameView;
    if (gameView && gameView.__yachiyoInitializationStatus === 'failed') {
      gameEntryCompleted = true;
      notifyParent('seth2:error', {
        message: '遊戲介面初始化失敗，請重新整理後再試',
        stage: 'game-view-init',
      });
      return;
    }
    if (gameCanvasContextLost) {
      return;
    }

    if (isGameEntryTransitionReady()) {
      gameEntryCompleted = true;
      syncRunningAudio();
      notifyParent('seth2:entered');
      return;
    }

    if (findIntroView() && !gameEntryIntroNotified) {
      // Keep the original full-art IntroView and its native Cocos touch
      // handler. The custom purple DOM gate used to cover this scene and then
      // emit an incomplete synthetic touch, which is the mobile black screen.
      gameEntryIntroNotified = true;
      notifyParent('seth2:intro-ready');
    }
    if (
      !gameEntryIntroNotified &&
      Date.now() - gameEntryPollStartedAt >= GAME_ENTRY_BOOT_TIMEOUT_MS
    ) {
      gameEntryCompleted = true;
      notifyParent('seth2:error', {
        message: '遊戲素材載入逾時，請重新整理後再試',
        stage: 'intro-view',
      });
      return;
    }
    gameEntryPollTimer = window.setTimeout(watchOriginalGameEntry, 125);
  }

  function scheduleGameEntryObserver() {
    gameEntryPollStartedAt = Date.now();
    gameEntryIntroNotified = false;
    gameEntryCompleted = false;
    bindGameCanvasRecovery();
    watchOriginalGameEntry();
  }

  function copyKnownSettings(source, keys) {
    var target = {};
    if (!source || typeof source !== 'object') return target;
    keys.forEach(function (key) {
      if (source[key] !== undefined) target[key] = source[key];
    });
    return target;
  }

  function normalizeUpdateSettings(data) {
    var settings = data && data.settings ? data.settings : data;
    if (!settings || typeof settings !== 'object') return null;
    if (settings.type === 'game') {
      var gameData = copyKnownSettings(settings.data, [
        'turbo',
        'notify',
        'stopOnJackpot',
        'backgroundVolume',
        'effectVolume',
        'stakeIndex',
        'ratioIndex',
      ]);
      return Object.keys(gameData).length > 0 ? { type: 'game', data: gameData } : null;
    }

    var normalized = copyKnownSettings(settings, ['autoPlay', 'stakeIndex', 'ratioIndex']);
    var advanced = settings.advancedSettings;
    if (advanced && typeof advanced === 'object') {
      var normalizedAdvanced = copyKnownSettings(advanced, ['notify', 'turbo']);
      if (advanced.sounds && typeof advanced.sounds === 'object') {
        var sounds = copyKnownSettings(advanced.sounds, [
          'background',
          'backgroundVolume',
          'effect',
          'effectVolume',
        ]);
        if (Object.keys(sounds).length > 0) normalizedAdvanced.sounds = sounds;
      }
      if (Object.keys(normalizedAdvanced).length > 0) {
        normalized.advancedSettings = normalizedAdvanced;
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  function LocalSocket() {
    this.connected = false;
    this.handlers = Object.create(null);
    this.queue = Promise.resolve();
    this.lastStakeData = Object.create(null);
    this.simulatedMarqueeTimer = 0;
    this.simulatedMarqueeSequence = 0;
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
    var requestedMachineId =
      event === 'updateSlotTable' ? tableMachineId(eventData, selectedMachineId) : null;
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
      // A persisted spin id only asks the server to replay an already-settled
      // ordinary spin; READY feature sequences are discovered server-side.
      eventData = initialRequestData(eventData);
    } else if (event === 'spin' && !eventData.spinId) {
      attachPendingOperation(eventData);
    }
    if (event === 'closeSpin') {
      eventData.spinId = String(eventData.spinId || lastSpinId || '');
    }
    if (event === 'updateSettings') {
      var normalizedSettings = normalizeUpdateSettings(eventData);
      if (!normalizedSettings) {
        // Unknown source-only preferences do not affect wallet/gameplay. Treat
        // them as a local no-op instead of returning HTTP 400 and navigating
        // the original client's generic error path.
        if (typeof callback === 'function') {
          window.setTimeout(function () {
            callback({ status: 200 });
          }, 0);
        }
        return this;
      }
      eventData = { settings: normalizedSettings };
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
        if (event === 'initial') {
          if (response && response.isResuming && gameStates(response).length > 0) {
            applyStoredResumeProgress(response);
          } else {
            clearActiveSpin();
          }
        } else if (event === 'spin' && gameStates(response).length > 0) {
          rememberNewSpin(response);
        }
        var resolvedSpinId = responseSpinId(response);
        if (resolvedSpinId) lastSpinId = resolvedSpinId;
        syncJackpotPools(socket, response);
        if (event === 'spin' && eventData.operationId) {
          clearPendingOperation(eventData.operationId);
        }
        if (event === 'initial') {
          var table = response && response.platform && response.platform.table;
          if (table) selectedMachineId = tableMachineId(table, selectedMachineId);
          if (response.isResuming && gameStates(response).length > 0) {
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
          scheduleGameEntryObserver();
          scheduleTableReferenceRefresh();
          startSimulatedMarquee(socket);
        } else if (response && response.platform && response.platform.player) {
          notifyParent('seth2:balance', {
            balance: Number(response.platform.player.balance.amount),
          });
        }
        if (event === 'closeSpin') clearActiveSpin(eventData.spinId || lastSpinId);
        if (event === 'updateSlotTable' && Number(response && response.status) === 200) {
          selectedMachineId = tableMachineId(
            response && response.table,
            requestedMachineId || selectedMachineId,
          );
          if (shellHandlesTableChanges) {
            // The source callback reloads Cocos inside the existing iframe.
            // Mobile WebKit can retain that iframe's WebGL context and freeze
            // the replacement scene at the loading spinner. Let the React
            // shell dispose and remount the iframe exactly as orientation
            // changes do. Standalone pages keep the untouched source reload.
            notifyParent('seth2:table-change-request', { machineId: selectedMachineId });
            return response;
          }
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
    if (tableReferenceRefreshTimer) {
      window.clearTimeout(tableReferenceRefreshTimer);
      tableReferenceRefreshTimer = 0;
    }
    stopSimulatedMarquee(this);
    this.dispatch('disconnect', { reason: 'client close' });
    return this;
  };

  LocalSocket.prototype.disconnect = LocalSocket.prototype.close;

  function tableMachineId(value, fallback) {
    var source = value;
    if (source && typeof source === 'object' && source.table !== undefined) {
      source = source.table;
    }
    var candidate;
    if (source && typeof source === 'object') {
      candidate = source.machineId || source.roomId || source.number;
    } else {
      candidate = source;
    }
    var machineId = Number(candidate);
    return Number.isFinite(machineId) && machineId >= 1
      ? Math.floor(machineId)
      : Number(fallback || 1);
  }

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
    if (event.data.type === 'seth2:audio-sync') {
      syncRunningAudioWhenReady();
    }
    if (event.data.type === 'seth2:audio-unlock') unlockOriginalGameAudio();
    if (event.data.type === 'seth2:shell-capabilities') {
      shellHandlesTableChanges = event.data.tableChangeRemount === true;
    }
    if (event.data.type === 'seth2:dispose') disposeGameForRemount();
  });
  window.addEventListener('storage', function (event) {
    if (event.key === SFX_PREFS_KEY || event.key === BGM_PREFS_KEY) {
      syncRunningAudioWhenReady();
    }
  });
  ['pointerdown', 'touchend', 'mouseup', 'keydown'].forEach(function (eventName) {
    window.addEventListener(eventName, unlockOriginalGameAudio, { capture: true, passive: true });
  });
  window.__YachiyoSeth2UnlockAudio = unlockOriginalGameAudio;
  window.__YachiyoSeth2SourceAdapterTest = {
    LocalSocket: LocalSocket,
    advanceActiveSpinProgress: advanceActiveSpinProgress,
    applyStoredResumeProgress: applyStoredResumeProgress,
    applyAudioPreferences: applyAudioPreferences,
    collectFeatureSequence: collectFeatureSequence,
    prefetchInitialResponse: prefetchInitialResponse,
    publicError: publicError,
    guardEffectsViewClass: guardEffectsViewClass,
    guardBigwinClass: guardBigwinClass,
    wrapFrameworkDispatch: wrapFrameworkDispatch,
    findIntroView: findIntroView,
    findSlotTableView: findSlotTableView,
    bindGameCanvasRecovery: bindGameCanvasRecovery,
    gameCanvasIsReady: gameCanvasIsReady,
    guardGameViewClass: guardGameViewClass,
    isGameEntryTransitionReady: isGameEntryTransitionReady,
    normalizeUpdateSettings: normalizeUpdateSettings,
    machineReferenceStats: machineReferenceStats,
    machineHasSimulatedPlayer: machineHasSimulatedPlayer,
    repairTerminalFemaleGuarantee: repairTerminalFemaleGuarantee,
    simulatedMarqueeMessage: simulatedMarqueeMessage,
    startSimulatedMarquee: startSimulatedMarquee,
    stopSimulatedMarquee: stopSimulatedMarquee,
    readActiveSpin: readActiveSpin,
    rememberNewSpin: rememberNewSpin,
    applyTableReferenceStats: applyTableReferenceStats,
    tableMachineId: tableMachineId,
    patchRotateScreenButtons: patchRotateScreenButtons,
    requestViewMode: requestViewMode,
    scheduleGameEntryObserver: scheduleGameEntryObserver,
    disposeGameForRemount: disposeGameForRemount,
    syncRunningAudioWhenReady: syncRunningAudioWhenReady,
    unlockOriginalGameAudio: unlockOriginalGameAudio,
    resumeCapturedAudioContexts: resumeCapturedAudioContexts,
    watchOriginalGameEntry: watchOriginalGameEntry,
  };

  if (typeof document !== 'undefined') prefetchInitialResponse();
})();
