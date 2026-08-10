(function () {
  'use strict';

  var NativeXHR = window.XMLHttpRequest;
  var params = new URLSearchParams(window.location.search);
  var apiBase = (params.get('apiBase') || window.location.origin + '/api').replace(/\/$/, '');
  var gameApi = apiBase + '/games/h5-slots';
  var gameCode = params.get('gameId') || '161';
  // The original Cocos scenes recover their spin controls after 45 seconds.
  // Finish the authenticated request (or report an error) before that guard,
  // while allowing for the server's transaction queue under concurrent tests.
  var requestTimeoutMs = 40000;
  var refreshInFlight = null;
  var latestSession = null;
  var ROOM_BET_AMOUNTS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  var FISH_GAME_CODES = ['2', '12', '13', '14'];
  var isFishGame = FISH_GAME_CODES.indexOf(gameCode) !== -1;
  var fishRoomBet = 10;
  var fishBullets = {};
  var fishExplosionSettlements = {};
  var fishSequence = 0;
  var fishTargets = [];
  var fishStreamToken = 0;
  var fishFrozenUntil = 0;
  var fishSkillInFlight = false;
  var FISH_PATH_COUNT = 43;
  var FISH_STREAM_MIN_INTERVAL_MS = 900;
  var FISH_STREAM_JITTER_MS = 650;
  var pendingLegacyResponses = [];
  var freeSelectionCount = 0;
  var SFX_PREFS_KEY = 'bg.sfx.prefs';
  var BGM_PREFS_KEY = 'bg.bgm.prefs';
  var audioBridge = null;
  var audioBridgeAttempts = 0;
  var platformAudioPrefs = readPlatformAudioPrefs();

  var MISSING_SOURCE_FONT_FALLBACKS = {
    'FZY4JW--GB1-0.ttf':
      'local("PingFang TC"), local("Microsoft JhengHei"), local("Arial Unicode MS"), local("Arial")',
    'BRLNSDB.ttf': 'local("Arial Black"), local("Arial Bold"), local("Arial")',
    'arialbd_0.ttf': 'local("Arial Bold"), local("Arial")',
    'TTF_BasicFont_Bold.ttf': 'local("Arial Bold"), local("Arial")',
    'TTF_BasicFont_Normal.ttf': 'local("Arial"), local("Helvetica")',
  };

  function sourceFontFallback(source) {
    var sourceText = String(source || '');
    var names = Object.keys(MISSING_SOURCE_FONT_FALLBACKS);
    for (var index = 0; index < names.length; index += 1) {
      if (sourceText.indexOf(names[index]) !== -1) {
        return MISSING_SOURCE_FONT_FALLBACKS[names[index]];
      }
    }
    return null;
  }

  function isLegacyBrandWebViewUrl(value) {
    return /(?:^|\/)pglogo\/indexlogo\.html(?:[?#]|$)/i.test(String(value || ''));
  }

  function installLegacyBrandWebViewBlocker() {
    var FrameClass = window.HTMLIFrameElement;
    if (!FrameClass || !FrameClass.prototype) return false;
    var prototype = FrameClass.prototype;
    if (prototype.__yachiyoLegacyBrandBlocked) return true;
    var descriptor = Object.getOwnPropertyDescriptor(prototype, 'src');
    if (!descriptor || typeof descriptor.set !== 'function' || !descriptor.configurable) {
      return false;
    }
    try {
      Object.defineProperty(prototype, 'src', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set: function (value) {
          if (isLegacyBrandWebViewUrl(value)) {
            this.style.display = 'none';
            descriptor.set.call(this, 'about:blank');
            return;
          }
          descriptor.set.call(this, value);
        },
      });
      Object.defineProperty(prototype, '__yachiyoLegacyBrandBlocked', { value: true });
      return true;
    } catch (_error) {
      return false;
    }
  }

  function installMissingSourceFontFallbacks() {
    var NativeFontFace = window.FontFace;
    if (typeof NativeFontFace !== 'function' || NativeFontFace.__yachiyoFontFallbackBridge) {
      return false;
    }
    function YachiyoFontFace(family, source, descriptors) {
      return new NativeFontFace(family, sourceFontFallback(source) || source, descriptors);
    }
    YachiyoFontFace.prototype = NativeFontFace.prototype;
    try {
      Object.setPrototypeOf(YachiyoFontFace, NativeFontFace);
      Object.defineProperty(YachiyoFontFace, '__yachiyoFontFallbackBridge', {
        value: true,
      });
    } catch (_error) {
      YachiyoFontFace.__yachiyoFontFallbackBridge = true;
    }
    window.FontFace = YachiyoFontFace;
    var NodeClass = window.Node;
    if (NodeClass && NodeClass.prototype && !NodeClass.prototype.__yachiyoAppendChild) {
      var nativeAppendChild = NodeClass.prototype.appendChild;
      NodeClass.prototype.appendChild = function (child) {
        if (child && String(child.tagName || '').toUpperCase() === 'STYLE') {
          child.textContent = rewriteMissingSourceFontStyle(child.textContent);
        }
        return nativeAppendChild.call(this, child);
      };
      try {
        Object.defineProperty(NodeClass.prototype, '__yachiyoAppendChild', { value: true });
      } catch (_error) {
        NodeClass.prototype.__yachiyoAppendChild = true;
      }
    }
    return true;
  }

  function rewriteMissingSourceFontStyle(styleText) {
    var fallback = sourceFontFallback(styleText);
    if (!fallback) return styleText;
    return String(styleText).replace(/src\s*:\s*url\([^;]+\);?/i, 'src:' + fallback + ';');
  }

  installLegacyBrandWebViewBlocker();
  installMissingSourceFontFallbacks();

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
    if (engine.__yachiyoAudioBridge) return engine.__yachiyoAudioBridge;

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
        var master =
          entry.kind === 'music' ? currentPrefs.musicVolume : currentPrefs.effectsVolume;
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
          requestedMusicVolume: requestedMusicVolume,
          requestedEffectsVolume: requestedEffectsVolume,
          directAudioCount: Object.keys(directAudio).length,
        };
      },
    };
    try {
      Object.defineProperty(engine, '__yachiyoAudioBridge', {
        configurable: true,
        value: bridge,
      });
    } catch (_error) {
      engine.__yachiyoAudioBridge = bridge;
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
    if (typeof window.addEventListener !== 'function' || typeof document === 'undefined') return;
    window.addEventListener('storage', function (event) {
      if (event.key === SFX_PREFS_KEY || event.key === BGM_PREFS_KEY) {
        updatePlatformAudioPrefs();
      }
    });
    window.addEventListener('message', function (event) {
      if (event.origin !== window.location.origin || !event.data) return;
      if (event.data.type === 'h5-slots:audio-sync') updatePlatformAudioPrefs();
      if (event.data.type === 'h5-slots:audio-unlock') resumeCocosAudio();
    });
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (eventName) {
      window.addEventListener(eventName, resumeCocosAudio, { capture: true, passive: true });
    });
    scheduleAudioBridge();
  }

  function shouldHideLegacyButtonHandler(handler) {
    if (handler === 'onCLick_buyCoin') return true;
    // Caishen Wins settles every awarded free round atomically on the server.
    // Its source gamble changes the number/multiplier of those already-settled
    // rounds, so exposing it would make the animation disagree with the ledger.
    return gameCode === '278' && handler === 'onBtnGuess';
  }

  function hideUnsupportedLegacyButtons() {
    if (!window.cc || !window.cc.director || !window.cc.Button) return 0;
    var scene = window.cc.director.getScene();
    if (!scene) return 0;
    var hiddenCount = 0;

    function visit(node) {
      if (!node) return;
      var button = typeof node.getComponent === 'function' && node.getComponent(window.cc.Button);
      var clickEvents = button && (button.clickEvents || button._clickEvents);
      if (
        Array.isArray(clickEvents) &&
        clickEvents.some(function (clickEvent) {
          return clickEvent && shouldHideLegacyButtonHandler(clickEvent.handler);
        })
      ) {
        node.active = false;
        hiddenCount += 1;
        return;
      }
      (node.children || []).slice().forEach(visit);
    }

    visit(scene);
    return hiddenCount;
  }

  function calculateCannonAimAngle(cannonPosition, targetPosition, seatId) {
    if (!cannonPosition || !targetPosition) return null;
    var cannonX = Number(cannonPosition.x);
    var cannonY = Number(cannonPosition.y);
    var targetX = Number(targetPosition.x);
    var targetY = Number(targetPosition.y);
    if (![cannonX, cannonY, targetX, targetY].every(Number.isFinite)) return null;
    var forward = Number(seatId) > 1 ? cannonY - targetY : targetY - cannonY;
    if (forward <= 1) return null;
    var angle = (-Math.atan2(targetX - cannonX, forward) * 180) / Math.PI;
    if (angle === 0) return 0;
    return Math.max(-88, Math.min(88, angle));
  }

  function findFishMainComponent() {
    if (!isFishGame || !window.cc || !window.cc.director) return null;
    var canvas = window.cc.find('Canvas');
    var scene = window.cc.director.getScene();
    var main = canvas && scene && canvas.getComponent(scene.name);
    if (!main && canvas && typeof canvas.getComponents === 'function') {
      var components = canvas.getComponents(window.cc.Component) || [];
      main = components.find(function (component) {
        return component && component.fishNet && component.fishBg && component.cannonList;
      });
    }
    return main || null;
  }

  function enhanceFishAimControls() {
    if (!isFishGame || !window.cc || !window.cc.director) return false;
    try {
      var main = findFishMainComponent();
      if (!main || !main.touchLayer || main.__yachiyoAimEnhanced) return false;

      var updateAim = function (event) {
        var seatId = main.fishNet ? Number(main.fishNet.seatId || 0) : 0;
        var cannon = main.cannonList && main.cannonList[seatId];
        var target = event && typeof event.getLocation === 'function' ? event.getLocation() : null;
        var angle = cannon && calculateCannonAimAngle(cannon.cannonPos, target, seatId);
        var cannonNode =
          cannon && cannon.cannonAnim && (cannon.cannonAnim.node || cannon.cannonAnim);
        if (cannonNode && Number.isFinite(angle)) cannonNode.angle = angle;
      };
      main.touchLayer.on('touchstart', updateAim, main);
      main.touchLayer.on('touchmove', updateAim, main);
      main.__yachiyoAimEnhanced = true;
      return true;
    } catch (_error) {
      return false;
    }
  }

  function shouldHideFishSeatNode(nodeName) {
    return /^noPlayer[1-3]$/.test(String(nodeName || ''));
  }

  function hideUnusedFishSeats() {
    if (!isFishGame || !window.cc) return 0;
    var controlGround = window.cc.find('Canvas/GameNode/ControlGround');
    if (!controlGround) return 0;
    var hiddenCount = 0;
    (controlGround.children || []).forEach(function (node) {
      if (!node || !shouldHideFishSeatNode(node.name)) return;
      node.active = false;
      hiddenCount += 1;
    });
    return hiddenCount;
  }

  function disableLegacyBrandWebViews() {
    if (!window.cc || !window.cc.director) return 0;
    var scene = window.cc.director.getScene && window.cc.director.getScene();
    if (!scene) return 0;
    var disabledCount = 0;
    var pending = [scene];
    while (pending.length) {
      var node = pending.pop();
      if (!node) continue;
      var component =
        window.cc.WebView && typeof node.getComponent === 'function'
          ? node.getComponent(window.cc.WebView)
          : null;
      var componentUrl = component && (component.url || component._url);
      if (
        component &&
        (isLegacyBrandWebViewUrl(componentUrl) || String(node.name || '') === 'New WebView')
      ) {
        node.active = false;
        disabledCount += 1;
      }
      (node.children || []).forEach(function (child) {
        pending.push(child);
      });
    }
    return disabledCount;
  }

  function applyCocosScenePolicies() {
    hideUnsupportedLegacyButtons();
    enhanceFishAimControls();
    hideUnusedFishSeats();
    disableLegacyBrandWebViews();
  }

  function installCocosScenePolicies() {
    if (typeof document === 'undefined') return;
    var attempts = 0;
    function install() {
      if (!window.cc || !window.cc.director) {
        attempts += 1;
        if (attempts < 600) window.setTimeout(install, 100);
        return;
      }
      var afterLaunch = window.cc.Director && window.cc.Director.EVENT_AFTER_SCENE_LAUNCH;
      if (afterLaunch) window.cc.director.on(afterLaunch, applyCocosScenePolicies);
      applyCocosScenePolicies();
      [250, 1000, 2500].forEach(function (delay) {
        window.setTimeout(applyCocosScenePolicies, delay);
      });
    }
    install();
  }

  function installAudioDecodeFallback() {
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !AudioContextClass.prototype.decodeAudioData) return;
    var originalDecodeAudioData = AudioContextClass.prototype.decodeAudioData;
    AudioContextClass.prototype.decodeAudioData = function (audioData, onSuccess, onError) {
      var context = this;
      function silentBuffer(error) {
        console.warn(
          '[Yachiyo H5 Slots] replaced an unreadable source audio asset with silence',
          error,
        );
        return context.createBuffer(1, 1, context.sampleRate || 44100);
      }
      if (typeof onSuccess === 'function') {
        var callbackDecode = originalDecodeAudioData.call(
          context,
          audioData,
          onSuccess,
          function (error) {
            onSuccess(silentBuffer(error));
          },
        );
        return callbackDecode && typeof callbackDecode.catch === 'function'
          ? callbackDecode.catch(function () {})
          : callbackDecode;
      }
      var decoded = originalDecodeAudioData.call(context, audioData);
      return decoded && typeof decoded.catch === 'function'
        ? decoded.catch(function (error) {
            return silentBuffer(error);
          })
        : decoded;
    };
  }

  installAudioDecodeFallback();
  installPlatformAudioBridge();
  installCocosScenePolicies();

  var GAME_SHAPES = {
    113: { family: 'classic', reels: 5, rows: 3, free: 'view' },
    116: { family: 'classic', reels: 5, rows: 3, free: 'view' },
    135: { family: 'classic', reels: 5, rows: 3, free: 'view' },
    155: { family: 'classic', reels: 5, rows: 4, free: 'view' },
    160: { family: 'classic', reels: 5, rows: 3, free: 'view' },
    161: {
      family: 'classic',
      reels: 3,
      rows: 3,
      free: 'view',
      multiplierWheel: true,
    },
    188: { family: 'classic', reels: 3, rows: 3, free: 'view' },
    232: { family: 'classic', reels: 3, rows: 3, free: 'view' },
    244: { family: 'classic', reels: 5, rows: 3, free: 'view' },
    252: { family: 'classic', reels: 5, rows: 3, free: 'view' },
    262: { family: 'classic', reels: 3, rows: 3, free: 'view' },
    264: { family: 'classic', reels: 3, rows: 4, free: 'view' },
    269: { family: 'mahjong', reels: 5, rows: 4, free: 'top', scatter: 10 },
    271: { family: 'mahjong', reels: 5, rows: 5, free: 'top', scatter: 11 },
    273: { family: 'tumble', reels: 6, rows: 5, order: 'column', free: 'none' },
    276: { family: 'step', reels: 5, rows: 3, free: 'top', scatter: 8 },
    278: { family: 'ways', reels: 6, rows: 5, free: 'top', scatter: 12 },
    281: { family: 'step', reels: 5, rows: 3, free: 'top', scatter: 8 },
    301: { family: 'ways', reels: 6, rows: 5, free: 'top', scatter: 11 },
    302: {
      family: 'classic',
      reels: 3,
      rows: 3,
      free: 'view',
      extraCard: true,
    },
    321: {
      family: 'tumble',
      reels: 6,
      rows: 5,
      order: 'column',
      free: 'fs',
      scatter: 9,
    },
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
      window.parent.postMessage(
        Object.assign({ type: type }, payload || {}),
        window.location.origin,
      );
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
    })
      .then(function (response) {
        if (response.status === 401 && !retried) {
          return refreshAccessToken().then(function () {
            return authorizedRequest(url, method, body, true);
          });
        }
        return response.json().then(function (payload) {
          if (!response.ok)
            throw new Error(payload.message || payload.error || '遊戲伺服器拒絕請求');
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
      return this._complete({
        code: 0,
        status: 0,
        message: 'External service disabled by Yachiyo',
      });
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
        'yachiyo-local',
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
    return this._native
      ? this._native.getResponseHeader(name)
      : name.toLowerCase() === 'content-type'
        ? 'application/json'
        : null;
  };
  BridgeXHR.prototype.getAllResponseHeaders = function () {
    return this._native
      ? this._native.getAllResponseHeaders()
      : 'content-type: application/json\r\n';
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
    readyState: {
      get: function () {
        return nativeOr(this, 'readyState', '_readyState');
      },
    },
    status: {
      get: function () {
        return nativeOr(this, 'status', '_status');
      },
    },
    statusText: {
      get: function () {
        return nativeOr(this, 'statusText', '_statusText');
      },
    },
    responseText: {
      get: function () {
        return nativeOr(this, 'responseText', '_responseText');
      },
    },
    response: {
      get: function () {
        return nativeOr(this, 'response', '_response');
      },
    },
    responseURL: {
      get: function () {
        return this._native ? this._native.responseURL : '';
      },
    },
    responseXML: {
      get: function () {
        return this._native ? this._native.responseXML : null;
      },
    },
    responseType: {
      get: function () {
        return this._native ? this._native.responseType : this._responseType;
      },
      set: function (value) {
        this._responseType = value;
        if (this._native) this._native.responseType = value;
      },
    },
    timeout: {
      get: function () {
        return this._native ? this._native.timeout : this._timeout;
      },
      set: function (value) {
        this._timeout = value;
        if (this._native) this._native.timeout = value;
      },
    },
    withCredentials: {
      get: function () {
        return this._native ? this._native.withCredentials : this._withCredentials;
      },
      set: function (value) {
        this._withCredentials = value;
        if (this._native) this._native.withCredentials = value;
      },
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
    if (
      this.connected &&
      this._connectAnnounced &&
      (event === 'connected' || event === 'connect')
    ) {
      window.setTimeout(function () {
        handler(true);
      }, 0);
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
    else
      this.$events[event] = (this.$events[event] || []).filter(function (candidate) {
        return candidate !== handler;
      });
    return this;
  };
  FakeSocket.prototype.removeListener = FakeSocket.prototype.off;
  FakeSocket.prototype.removeListen = FakeSocket.prototype.off;
  FakeSocket.prototype.removeAllListeners = function (event) {
    return this.off(event);
  };
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
    if (isFishGame) fishStreamToken += 1;
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
      localSession()
        .then(function (session) {
          socket._trigger('loginResult', buildLobbyLogin(session));
        })
        .catch(reportSocketError);
    } else if (event === 'LoginGame') {
      if (latestSession) {
        window.setTimeout(function () {
          emitGameLogin(socket, latestSession);
        }, 0);
        return this;
      }
      localSession()
        .then(function (session) {
          emitGameLogin(socket, session);
        })
        .catch(reportSocketError);
    } else if (event === 'LoginRoom') {
      emitRoomLogin(socket);
    } else if (event === 'fishShoot') {
      handleFishShoot(socket, rawPayload);
    } else if (event === 'fishHit') {
      handleFishCollision(socket, rawPayload);
    } else if (event === 'boomFishHit') {
      handleFishExplosion(socket, rawPayload);
    } else if (event === 'changePower') {
      socket._trigger('changePowerResult', parseSocketPayload(rawPayload));
    } else if (event === 'changeCannon') {
      socket._trigger('changeCannonResult', parseSocketPayload(rawPayload));
    } else if (event === 'useSKill') {
      handleFishSkill(socket, rawPayload);
    } else if (event === 'LoginfreeCount') {
      window.setTimeout(function () {
        socket._trigger('LoginfreeCountResult', {
          ResultCode: 1,
          freeCount: freeSelectionCount,
          freeType: freeSelectionCount > 0 ? 1 : 0,
        });
      }, 0);
    } else if (event === 'history') {
      authorizedRequest(
        gameApi + '/history?gameCode=' + encodeURIComponent(gameCode),
        'GET',
        null,
        false,
      )
        .then(function (payload) {
          socket._trigger('historyResult', payload);
        })
        .catch(reportSocketError);
    } else if (event === 'lottery') {
      settleSpin(socket, rawPayload);
    } else if (event === 'freeTimeType') {
      var freeTypePayload = parseSocketPayload(rawPayload);
      window.setTimeout(function () {
        socket._trigger('freeTimeTypeResult', {
          ResultCode: 1,
          ResultData: {
            type: Math.max(1, Number(freeTypePayload.type || 1)),
            freeCount: freeSelectionCount,
          },
        });
      }, 0);
    } else if (event === 'cleanLineOut') {
      // Source scenes emit this while being destroyed. The local bridge has
      // no shared table membership to clean up, but handling it explicitly
      // keeps the source socket contract complete.
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
          userList: [
            {
              seatId: 0,
              nickname: session.nickname || session.username || 'testplayer',
              score: Number(session.balance || 0),
              diamond: 0,
              userId: session.id,
              headimgurl: '',
            },
          ],
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
      return typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload || {};
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
    authorizedRequest(
      gameApi + '/spin',
      'POST',
      {
        gameCode: gameCode,
        amount: amount,
        isBuyFree: false,
      },
      false,
    )
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
        if (latestSession) syncFishBalance(Number(latestSession.balance || 0));
        reportSocketError(error);
      });
  }

  function handleFishSkill(socket, rawPayload) {
    var skill = parseSocketPayload(rawPayload);
    var skillId = Number(skill.sid || 0);
    if (!isFishGame || skillId !== 1) {
      reportSocketError(new Error('此捕魚技能目前無法使用'));
      return;
    }
    if (fishSkillInFlight || Date.now() < fishFrozenUntil) return;
    fishSkillInFlight = true;
    authorizedRequest(
      gameApi + '/fish/skill',
      'POST',
      {
        gameCode: gameCode,
        skillId: skillId,
      },
      false,
    )
      .then(function (result) {
        latestSession = latestSession || {};
        latestSession.balance = Number(result.balance || 0);
        fishFrozenUntil = Date.now() + Number(result.durationMs || 5000);
        socket._trigger('useSkillResult', {
          ResultCode: 1,
          uid: result.userId || skill.uid || (latestSession && latestSession.id),
          sid: skillId,
          cost: Number(result.cost || 0),
        });
        syncFishBalance(Number(result.balance || 0));
        notifyParent('h5-slots:balance', {
          balance: Number(result.balance || 0),
          gameCode: gameCode,
        });
      })
      .catch(reportSocketError)
      .finally(function () {
        fishSkillInFlight = false;
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
    if (!isFishHitReady(bullet)) return;
    var payout = Number(bullet.result.payout || 0);
    var targetFishId = bullet.hit.fishId;
    fishTargets = fishTargets.filter(function (fishId) {
      return fishId !== targetFishId;
    });
    if (payout > 0) {
      var userId = (latestSession && latestSession.id) || (bullet.hit && bullet.hit.uid);
      fishExplosionSettlements[String(targetFishId)] = {
        hitSocre: payout / fishRoomBet,
        userId: userId,
      };
      socket._trigger('HitResult', {
        ResultCode: 1,
        ResultData: {
          fishId: targetFishId,
          userId: userId,
          hitSocre: payout / fishRoomBet,
        },
      });
      window.setTimeout(function () {
        delete fishExplosionSettlements[String(targetFishId)];
      }, 2500);
    }
    syncFishBalance(Number(bullet.result.newBalance || 0));
    delete fishBullets[bulletId];
  }

  function buildFishExplosionResult(payload, settlement, activeTargets) {
    var source = Array.isArray(payload && payload.fishIdList) ? payload.fishIdList : [];
    var bombFishId = String((payload && payload.fishId) || '');
    var active = new Set((Array.isArray(activeTargets) ? activeTargets : []).map(String));
    var seen = new Set();
    var fishList = source
      .map(String)
      .filter(function (fishId) {
        if (!fishId || fishId === bombFishId || seen.has(fishId) || !active.has(fishId)) {
          return false;
        }
        seen.add(fishId);
        return true;
      })
      .slice(0, 8);
    return {
      ResultCode: 1,
      ResultData: {
        userId: settlement && settlement.userId,
        fishList: fishList,
        hitSocre: Math.max(0, Number((settlement && settlement.hitSocre) || 0)),
      },
    };
  }

  function handleFishExplosion(socket, rawPayload) {
    var payload = parseSocketPayload(rawPayload);
    var bombFishId = String(payload.fishId || '');
    var settlement = fishExplosionSettlements[bombFishId];
    var result = buildFishExplosionResult(payload, settlement, fishTargets);
    fishTargets = fishTargets.filter(function (fishId) {
      return result.ResultData.fishList.indexOf(String(fishId)) === -1;
    });
    delete fishExplosionSettlements[bombFishId];
    window.setTimeout(function () {
      socket._trigger('boomFishHitResult', result);
    }, 0);
  }

  function isFishHitReady(bullet) {
    return Boolean(bullet && bullet.result && bullet.hit);
  }

  function syncFishBalance(balance) {
    if (!window.cc || !Number.isFinite(balance)) return;
    function applyBalance() {
      try {
        var main = findFishMainComponent();
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
    fishStreamToken += 1;
    var streamToken = fishStreamToken;
    function spawnFish() {
      if (!socket.connected || streamToken !== fishStreamToken) return;
      if (latestSession) syncFishBalance(Number(latestSession.balance || 0));
      enhanceFishAimControls();
      hideUnusedFishSeats();
      if (Date.now() < fishFrozenUntil) {
        window.setTimeout(spawnFish, 500);
        return;
      }
      fishSequence += 1;
      var spawn = buildFishSpawn(fishSequence);
      fishTargets = fishTargets.concat(spawn.fishId);
      if (fishTargets.length > 96) fishTargets = fishTargets.slice(-96);
      socket._trigger('FishOut', spawn);
      window.setTimeout(spawnFish, getFishSpawnDelay(fishSequence));
    }
    window.setTimeout(spawnFish, 600);
  }

  function buildFishSpawn(sequence) {
    var fishType = 1 + ((sequence * 7) % 12);
    var generation = Math.floor(sequence / 12);
    var isSmallFish = fishType <= 4;
    var shouldSchool = isSmallFish && (generation + fishType) % 2 === 0;
    var fishCount = shouldSchool ? 2 + ((generation + fishType) % 4 === 0 ? 1 : 0) : 1;
    var fishIds = Array.from({ length: fishCount }, function (_value, index) {
      return 'yachiyo-fish-' + sequence + '-' + index;
    });
    return {
      fishType: fishType,
      fishPath: (sequence * 17 + Math.floor(sequence / 6) * 11) % FISH_PATH_COUNT,
      fishLineup: shouldSchool ? 1 : 0,
      fishCount: fishCount,
      fishId: fishIds,
    };
  }

  function getFishSpawnDelay(sequence) {
    return FISH_STREAM_MIN_INTERVAL_MS + ((sequence * 137) % FISH_STREAM_JITTER_MS);
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
      payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload || {};
    } catch (_error) {
      payload = {};
    }
    if (pendingLegacyResponses.length > 0) {
      emitQueuedLotteryResponse(socket);
      return;
    }
    var requestedAmount = Number(payload.nBetList && payload.nBetList[0]);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      emitLotteryError(socket, '投注金額不正確', -2);
      return;
    }
    if (requestedAmount < ROOM_BET_AMOUNTS[0]) {
      emitLotteryError(socket, '最低下注為 10，請調整下注金額', -2);
      return;
    }
    var amount = requestedAmount;
    var isFeaturePurchase = payload.isBuyFree === 1 && (gameCode === '278' || gameCode === '321');
    authorizedRequest(
      gameApi + '/spin',
      'POST',
      {
        gameCode: gameCode,
        amount: amount,
        isBuyFree: isFeaturePurchase,
      },
      false,
    )
      .then(function (result) {
        latestSession = latestSession || {};
        latestSession.balance = Number(result.newBalance || 0);
        pendingLegacyResponses = buildLotteryResponses(result);
        freeSelectionCount = Number(
          result.features && result.features.freeSpinsAwarded
            ? result.features.freeSpinsAwarded
            : 0,
        );
        emitQueuedLotteryResponse(socket);
        notifyParent('h5-slots:balance', {
          balance: Number(result.newBalance || 0),
          gameCode: gameCode,
          spinId: result.betId,
        });
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '遊戲伺服器連線失敗';
        emitLotteryError(socket, message, /餘額|限紅|下注|balance|fund/i.test(message) ? -2 : -998);
        notifyParent('h5-slots:error', { message: message });
      });
  }

  function emitLotteryError(socket, message, resultCode) {
    socket._trigger('lotteryResult', {
      ResultCode: resultCode,
      msg: message,
      error: message,
      userscore: Number((latestSession && latestSession.balance) || 0),
    });
  }

  function emitQueuedLotteryResponse(socket) {
    var queued = pendingLegacyResponses.shift();
    if (!queued) return;
    if (queued.startsFreeSpin) {
      freeSelectionCount = Math.max(0, freeSelectionCount - 1);
    }
    window.setTimeout(function () {
      socket._trigger('lotteryResult', queued.response);
    }, 0);
  }

  function buildLotteryResponses(result) {
    var shape = GAME_SHAPES[gameCode] || GAME_SHAPES['161'];
    var totalPayout = Number(result.payout || 0);
    var finalBalance = Number(result.newBalance || 0);
    var baseAmount = Number(result.baseAmount || result.amount || 0);
    var features = result.features || null;
    var freeRounds =
      features && Array.isArray(features.freeSpinRounds) ? features.freeSpinRounds : [];
    var basePayout = features
      ? roundMoney(baseAmount * Number(features.baseTotalMultiplier || 0))
      : totalPayout;
    basePayout = Math.max(0, Math.min(totalPayout, basePayout));
    var freePayouts = freeRounds.map(function (round) {
      return roundMoney(baseAmount * Number(round.totalMultiplier || 0));
    });
    var allocatedPayout =
      basePayout +
      freePayouts.reduce(function (sum, value) {
        return sum + value;
      }, 0);
    if (freePayouts.length > 0) {
      freePayouts[freePayouts.length - 1] = roundMoney(
        Math.max(0, freePayouts[freePayouts.length - 1] + totalPayout - allocatedPayout),
      );
    } else {
      basePayout = totalPayout;
    }

    var sequence = [];
    var displayedBalance = finalBalance - totalPayout + basePayout;
    var baseRound = {
      grid: firstVisibleGrid(result),
      finalGrid: result.grid,
      lines: result.lines || [],
      cascades: result.cascades || [],
      multiplier: result.multiplier,
      scatterSymbols: features ? features.scatterSymbols || [] : [],
    };
    var triggerMeta =
      features && Number(features.freeSpinsAwarded || 0) > 0
        ? {
            trigger: true,
            awarded: Number(features.freeSpinsAwarded || 0),
            remaining: Number(features.freeSpinsAwarded || 0),
            totalWin: roundMoney(totalPayout - basePayout),
            multiplier: Number(features.freeSpinMultiplierBank || 1),
          }
        : null;
    sequence = sequence.concat(
      buildRoundResponses(baseRound, basePayout, displayedBalance, triggerMeta, baseAmount, shape),
    );

    freeRounds.forEach(function (round, index) {
      var payout = freePayouts[index] || 0;
      displayedBalance = roundMoney(displayedBalance + payout);
      var remaining = freeRounds.length - index - 1;
      var freeMeta = {
        trigger: false,
        awarded: Number(features.freeSpinsAwarded || freeRounds.length),
        remaining: remaining,
        totalWin: roundMoney(totalPayout - basePayout),
        multiplier: Number(round.appliedMultiplier || features.freeSpinMultiplierBank || 1),
      };
      var responses = buildRoundResponses(
        {
          grid: firstVisibleGrid(round),
          finalGrid: round.finalGrid,
          lines: round.lines || [],
          cascades: round.cascades || [],
          multiplier: round.appliedMultiplier,
          scatterSymbols: round.scatterSymbols || [],
        },
        payout,
        displayedBalance,
        freeMeta,
        baseAmount,
        shape,
      );
      if (responses.length > 0) responses[0].startsFreeSpin = true;
      sequence = sequence.concat(responses);
    });

    if (sequence.length === 0) {
      sequence.push({
        response: makeLotteryEnvelope({
          userscore: finalBalance,
          winscore: 0,
          freeCount: 0,
          getFreeTime: { bFlag: false, nFreeTime: 0 },
          viewarray: buildClassicData([], [], 0, 0, shape, finalBalance, baseAmount),
        }),
      });
    }
    return sequence;
  }

  function firstVisibleGrid(round) {
    return round && Array.isArray(round.cascades) && round.cascades[0]
      ? round.cascades[0].grid
      : round && (round.initialGrid || round.grid);
  }

  function buildRoundResponses(round, payout, balance, freeMeta, baseAmount, shape) {
    if (shape.family === 'tumble') {
      return buildTumbleResponses(round, payout, balance, freeMeta, baseAmount, shape);
    }

    var data = {
      userscore: balance,
      winscore: payout,
      freeCount: freeMeta ? freeMeta.remaining + 1 : 0,
      getFreeTime: { bFlag: false, nFreeTime: 0 },
    };
    if (shape.family === 'mahjong' || shape.family === 'step' || shape.family === 'ways') {
      data.viewarray = buildCascadeSteps(round, payout, baseAmount, shape);
    } else {
      var symbols = flattenSymbols(
        applySpecialSymbols(round.grid, round.scatterSymbols, shape),
        shape,
      );
      data.viewarray = buildClassicData(
        symbols,
        round.lines || [],
        payout,
        round.multiplier,
        shape,
        balance,
        baseAmount,
      );
    }
    applyFreeMeta(data, shape, freeMeta);
    return [{ response: makeLotteryEnvelope(data) }];
  }

  function buildCascadeSteps(round, payout, baseAmount, shape) {
    var cascades = Array.isArray(round.cascades) ? round.cascades : [];
    var steps = cascades.map(function (cascade, index) {
      var stepPayout = roundMoney(baseAmount * Number(cascade.multiplier || 0));
      var symbols = flattenSymbols(cascade.grid, shape);
      return shape.family === 'ways'
        ? buildWaysStep(symbols, cascade.lines || [], stepPayout, shape, index, baseAmount)
        : buildStep(
            symbols,
            cascade.lines || [],
            stepPayout,
            shape.family === 'mahjong',
            shape,
            index,
            baseAmount,
          );
    });
    if (steps.length > 0) {
      var allocated = steps.reduce(function (sum, step) {
        return sum + Number(step.win || step.winscore || 0);
      }, 0);
      var delta = roundMoney(payout - allocated);
      steps[steps.length - 1].win = roundMoney(Number(steps[steps.length - 1].win || 0) + delta);
      steps[steps.length - 1].winscore = steps[steps.length - 1].win;
    }
    var finalSymbols = flattenSymbols(
      applySpecialSymbols(round.finalGrid || round.grid, round.scatterSymbols, shape),
      shape,
    );
    steps.push(
      shape.family === 'ways'
        ? buildWaysStep(finalSymbols, [], 0, shape, steps.length, baseAmount)
        : buildStep(
            finalSymbols,
            [],
            0,
            shape.family === 'mahjong',
            shape,
            steps.length,
            baseAmount,
          ),
    );
    return steps;
  }

  function buildTumbleResponses(round, payout, balance, freeMeta, baseAmount, shape) {
    var cascades = Array.isArray(round.cascades) ? round.cascades : [];
    var responses = [];
    var accumulated = 0;
    cascades.forEach(function (cascade, index) {
      var stepPayout = roundMoney(baseAmount * Number(cascade.multiplier || 0));
      if (index === cascades.length - 1) {
        stepPayout = roundMoney(stepPayout + payout - accumulated - stepPayout);
      }
      accumulated = roundMoney(accumulated + stepPayout);
      var data = buildTumbleData(
        cascade.grid,
        cascade.lines || [],
        stepPayout,
        accumulated,
        balance,
        2,
        shape,
        baseAmount,
      );
      // Gates of Olympus reads fs.s while every tumble step is settling, not
      // only after the final drop. Preserve the free-spin state throughout
      // the whole legacy response sequence.
      applyFreeMeta(data, shape, freeMeta);
      responses.push({ response: makeLotteryEnvelope(data) });
    });
    var finalData = buildTumbleData(
      applySpecialSymbols(round.finalGrid || round.grid, round.scatterSymbols, shape),
      [],
      cascades.length ? 0 : payout,
      payout,
      balance,
      1,
      shape,
      baseAmount,
    );
    applyFreeMeta(finalData, shape, freeMeta);
    responses.push({ response: makeLotteryEnvelope(finalData) });
    return responses;
  }

  function makeLotteryEnvelope(data) {
    return { ResultCode: 1, ResultData: data };
  }

  function applyFreeMeta(data, shape, meta) {
    var freeTime = {
      bFlag: Boolean(meta && meta.trigger),
      nFreeTime: meta ? meta.awarded : 0,
    };
    data.freeCount = meta ? meta.remaining + 1 : 0;
    data.getFreeTime = shape.free === 'top' ? freeTime : { bFlag: false, nFreeTime: 0 };
    if (shape.free === 'view' && data.viewarray && !Array.isArray(data.viewarray)) {
      data.viewarray.getFreeTime = freeTime;
    }
    if (shape.free === 'fs' && data.viewarray && !Array.isArray(data.viewarray) && meta) {
      data.viewarray.fs = {
        ps: 0,
        s: meta.trigger ? meta.awarded : meta.remaining + 1,
        ts: meta.awarded,
        aw: meta.totalWin,
        tgm: Math.max(1, Number(meta.multiplier || 1)),
      };
      data.viewarray.ts = meta.awarded;
    }
  }

  function applySpecialSymbols(grid, specialSymbols, shape) {
    var cloned = (Array.isArray(grid) ? grid : []).map(function (column) {
      return Array.isArray(column) ? column.slice() : [];
    });
    if (!shape.scatter) return cloned;
    (Array.isArray(specialSymbols) ? specialSymbols : []).forEach(function (special) {
      if (cloned[special.reel] && cloned[special.reel][special.row] !== undefined) {
        cloned[special.reel][special.row] = shape.scatter - 1;
      }
    });
    return cloned;
  }

  function flattenSymbols(grid, shape) {
    var source = [];
    var reels = shape.reels;
    var rows = shape.rows;
    if (shape.order === 'column') {
      for (var reel = 0; reel < reels; reel += 1) {
        for (var row = 0; row < rows; row += 1) {
          source.push(mapSymbol(grid && grid[reel] && grid[reel][row]));
        }
      }
    } else {
      for (var rowIndex = 0; rowIndex < rows; rowIndex += 1) {
        for (var reelIndex = 0; reelIndex < reels; reelIndex += 1) {
          source.push(mapSymbol(grid && grid[reelIndex] && grid[reelIndex][rowIndex]));
        }
      }
    }
    return source;
  }

  function mapSymbol(symbol) {
    var numeric = Number(symbol);
    return Number.isFinite(numeric) ? Math.abs(Math.trunc(numeric)) + 1 : 1;
  }

  function positionIndex(position, shape) {
    return shape.order === 'column'
      ? Number(position.reel) * shape.rows + Number(position.row)
      : Number(position.row) * shape.reels + Number(position.reel);
  }

  function winLinePositions(line, shape) {
    var positions = Array.isArray(line && line.positions) ? line.positions : [];
    if (positions.length === 0 && line && Array.isArray(line.path)) {
      var start = Number(line.startReel || 0);
      var count = Number(line.count || line.path.length);
      for (var offset = 0; offset < count; offset += 1) {
        var reel = start + offset;
        if (line.direction === 'rtl') reel = start + count - 1 - offset;
        if (line.path[reel] !== undefined) positions.push({ reel: reel, row: line.path[reel] });
      }
    }
    return positions
      .map(function (position) {
        return positionIndex(position, shape);
      })
      .filter(function (index) {
        return Number.isInteger(index) && index >= 0 && index < shape.reels * shape.rows;
      });
  }

  function winFields(lines, shape, baseAmount) {
    var details = (Array.isArray(lines) ? lines : [])
      .map(function (line) {
        return winLinePositions(line, shape);
      })
      .filter(function (positions) {
        return positions.length > 0;
      });
    var cards = falseList(shape.reels * shape.rows);
    details.forEach(function (positions) {
      positions.forEach(function (index) {
        cards[index] = true;
      });
    });
    return {
      nWinCards: cards,
      nWinLinesDetail: details,
      nWinLines: details.map(function (_positions, index) {
        return index;
      }),
      nWinDetail: (Array.isArray(lines) ? lines : []).slice(0, details.length).map(function (line) {
        return roundMoney(Number(line.payout || 0) * Number(baseAmount || 0));
      }),
    };
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function falseList(length) {
    return Array.from({ length: length }, function () {
      return false;
    });
  }

  function buildClassicData(symbols, lines, payout, multiplier, shape, balance, baseAmount) {
    var wins = winFields(lines, shape, baseAmount);
    var data = {
      nHandCards: symbols,
      nWinCards: wins.nWinCards,
      nWinLinesDetail: wins.nWinLinesDetail,
      nWinLines: wins.nWinLines,
      nWinDetail: wins.nWinDetail,
      fMultiple: shape.multiplierWheel ? Math.max(1, Number(multiplier || 1)) : 0,
      getFreeTime: { bFlag: false, nFreeTime: 0 },
      getOpenBox: { bFlag: false, card: 0 },
      getAllSame: { bFlag: false },
      getBigWin: { bFlag: false, isStart: false },
      exCard: shape.extraCard ? 0 : undefined,
      winEx: false,
      user_score: balance,
      winscore: payout,
    };
    return data;
  }

  function buildStep(symbols, lines, payout, mahjong, shape, index, baseAmount) {
    var wins = winFields(lines, shape, baseAmount);
    return {
      nHandCards: symbols,
      nWinCards: wins.nWinCards,
      nWinLinesDetail: wins.nWinLinesDetail,
      nWinLines: wins.nWinLines,
      nWinDetail: wins.nWinDetail,
      goldCards: mahjong ? [] : undefined,
      combo_num: index,
      win: payout,
      winscore: payout,
      user_score: Number((latestSession && latestSession.balance) || 0),
      getFreeTime: { bFlag: false, nFreeTime: 0 },
    };
  }

  function buildWaysStep(symbols, lines, payout, shape, index, baseAmount) {
    var wins = winFields(lines, shape, baseAmount);
    return {
      nHandCards: symbols,
      nWinCards: wins.nWinCards,
      nWinCards_top: falseList(4),
      nWinLinesDetail: wins.nWinLinesDetail,
      nWinLines: wins.nWinLines,
      nWinDetail: wins.nWinDetail,
      trl: [1, 2, 3, 4],
      sr: [],
      srd: [],
      combo_num: index,
      win: payout,
      winscore: payout,
      user_score: Number((latestSession && latestSession.balance) || 0),
    };
  }

  function buildTumbleData(
    grid,
    lines,
    stepPayout,
    accumulatedPayout,
    balance,
    nextState,
    shape,
    baseAmount,
  ) {
    var symbols = flattenSymbols(grid, shape);
    var wins = winFields(lines, shape, baseAmount);
    var ways = {};
    wins.nWinLinesDetail.forEach(function (positions, index) {
      ways[String(index)] = positions;
    });
    return {
      userscore: balance,
      winscore: stepPayout,
      freeCount: 0,
      getFreeTime: { bFlag: false, nFreeTime: 0 },
      viewarray: {
        nst: nextState,
        aw: accumulatedPayout,
        tw: stepPayout,
        ctw: accumulatedPayout,
        cb: wins.nWinLinesDetail.reduce(function (sum, positions) {
          return sum + positions.length;
        }, 0),
        orl: symbols,
        rl: symbols,
        wp: ways,
        gm: 1,
        fs: null,
        ts: null,
        df: [],
        nHandCards: symbols,
        // The tumble scene animates wins from `wp`. Its inherited 5x3 line
        // animator cannot address the 6x5 board and crashes when these legacy
        // fields contain tumble positions.
        nWinCards: falseList(shape.reels * shape.rows),
        nWinLinesDetail: [],
        nWinLines: [],
        nWinDetail: [],
      },
      aw: accumulatedPayout,
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

  window.__YachiyoH5AdapterTest = {
    gameCode: gameCode,
    shape: GAME_SHAPES[gameCode],
    buildLotteryResponses: buildLotteryResponses,
    flattenSymbols: flattenSymbols,
    winFields: winFields,
    installCocosAudioControls: installCocosAudioControls,
    readPlatformAudioPrefs: readPlatformAudioPrefs,
    shouldHideLegacyButtonHandler: shouldHideLegacyButtonHandler,
    shouldHideFishSeatNode: shouldHideFishSeatNode,
    calculateCannonAimAngle: calculateCannonAimAngle,
    buildFishSpawn: buildFishSpawn,
    getFishSpawnDelay: getFishSpawnDelay,
    isFishHitReady: isFishHitReady,
    buildFishExplosionResult: buildFishExplosionResult,
    sourceFontFallback: sourceFontFallback,
    rewriteMissingSourceFontStyle: rewriteMissingSourceFontStyle,
    isLegacyBrandWebViewUrl: isLegacyBrandWebViewUrl,
    createFakeSocket: function () {
      return new FakeSocket();
    },
  };
  window.__YachiyoUnlockAudio = resumeCocosAudio;
  window.__YachiyoFakeIo = fakeIo;
  window.XMLHttpRequest = BridgeXHR;
  try {
    Object.defineProperty(window, 'io', {
      configurable: true,
      get: function () {
        return fakeIo;
      },
      set: function () {
        /* Keep all legacy socket traffic local. */
      },
    });
  } catch (_error) {
    window.io = fakeIo;
  }
  window.SocketIO = fakeIo;
  console.info('[Yachiyo H5 Slots] authenticated local bridge enabled for game', gameCode);
})();
