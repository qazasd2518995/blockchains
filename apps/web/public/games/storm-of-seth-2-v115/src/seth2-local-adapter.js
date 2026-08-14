(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || window.location.origin + '/api').replace(/\/$/, '');
  var sourceUrl = apiBase + '/games/seth2/source';
  var requestTimeoutMs = 20000;
  var refreshInFlight = null;
  var selectedMachineId = 1;
  var SFX_PREFS_KEY = 'bg.sfx.prefs';
  var BGM_PREFS_KEY = 'bg.bgm.prefs';
  var UPDATE_TOTAL_WINNINGS = 'SlotFrameworkEvent:UPDATE_TOTAL_WINNINGS';

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
      // Standalone mode has no parent store to update.
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
      /prisma\.|query execution|prismaclient|postgres(?:ql)?|connectorerror/i.test(String(message || ''))
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

    var remaining = Number(states[states.length - 1].freeGameCount);
    var collectedGames = 0;
    var nextData = Object.assign({}, socket.lastStakeData, eventData, {
      action: 'spin',
      machineId: selectedMachineId,
    });
    delete nextData.featureIndex;
    delete nextData.spinId;

    function collectNext() {
      if (remaining <= 0) return Promise.resolve(normalizeFeatureSequence(response, states));
      if (collectedGames >= 100) {
        return Promise.reject(new Error('免費遊戲局數超過安全上限'));
      }
      collectedGames += 1;
      return authorizedPost({ event: 'spin', data: nextData }, false).then(function (nextResponse) {
        var nextStates = gameStates(nextResponse);
        var finalState = nextStates[nextStates.length - 1];
        if (!finalState || finalState.action !== 'freeSpin') {
          throw new Error('免費遊戲序列不完整，請稍後重試');
        }
        nextStates.forEach(function (state) {
          state.startFreeGame = false;
          states.push(state);
        });
        remaining = Number(finalState.freeGameCount);
        if (!Number.isFinite(remaining) || remaining < 0) {
          throw new Error('免費遊戲剩餘局數無效');
        }
        if (nextResponse.platform) response.platform = nextResponse.platform;
        if (nextResponse.engine && nextResponse.engine.spinId) {
          response.engine.spinId = nextResponse.engine.spinId;
        }
        return collectNext();
      });
    }

    return collectNext();
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
    var sounds = response && response.platform && response.platform.player &&
      response.platform.player.settings && response.platform.player.settings.advancedSettings &&
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
    if (event === 'updateSlotTable' && eventData.table) {
      selectedMachineId = Number(eventData.table.roomId || eventData.table.number || 1);
    }
    if (event === 'spin' || event === 'getSlotTables') {
      eventData.machineId = selectedMachineId;
    }
    if (event === 'spin') {
      ['stakeIndex', 'stakeValue', 'ratioIndex', 'ratioValue'].forEach(function (key) {
        if (eventData[key] !== undefined) socket.lastStakeData[key] = eventData[key];
      });
    }
    var request = { event: event, data: eventData };
    this.queue = this.queue
      .then(function () {
        return authorizedPost(request, false);
      })
      .then(function (response) {
        return collectFeatureSequence(socket, event, eventData, response);
      })
      .then(function (response) {
        if (event === 'initial') {
          applyAudioPreferences(response);
          var balance = Number(response && response.platform && response.platform.player &&
            response.platform.player.balance && response.platform.player.balance.amount);
          notifyParent('seth2:ready', { balance: balance });
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
        if (typeof callback === 'function') callback({ status: 500, code: 'LOCAL_BRIDGE', message: message });
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
      get: function () { return localIo; },
      set: captureOriginalIo,
    });
  } catch (_error) {
    window.io = localIo;
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== window.parent || !event.data) return;
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
    publicError: publicError,
    wrapFrameworkDispatch: wrapFrameworkDispatch,
  };
})();
