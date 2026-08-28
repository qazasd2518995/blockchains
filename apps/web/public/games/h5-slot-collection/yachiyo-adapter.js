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
  var slotSettlementInFlight = false;
  var SLOT_SPIN_PAUSE_MS = 650;
  var nextSlotSettlementAt = 0;
  var deferredSlotSpinTimer = 0;
  var deferredSlotSpinSocket = null;
  var deferredSlotSpinPayload = null;
  var slotCooldownRepairTimer = 0;
  var FISH_PATH_COUNT = 43;
  // Counts recovered from the four source scenes.  Fish IDs are zero based;
  // restricting every room to ids 1-12 left most of the original prefabs
  // unused and made the stream look like the same school repeating forever.
  var FISH_TYPE_COUNTS = { 2: 24, 12: 28, 13: 24, 14: 34 };
  // The live source emits roughly one school every 0.3-0.8 seconds.  Keep the
  // same density while retaining a bounded target list below, so movement
  // stays populated without accumulating off-screen objects indefinitely.
  var FISH_STREAM_MIN_INTERVAL_MS = 420;
  var FISH_STREAM_JITTER_MS = 480;
  var pendingLegacyResponses = [];
  var freeSelectionCount = 0;
  var pendingFreeModeBetId = null;
  var pendingFreeModeTrigger = null;
  var freeModeSelectionInFlight = false;
  var pendingCaishenBetId = null;
  var pendingCaishenTrigger = null;
  var caishenFreeCount = 8;
  var caishenFreeMul = 8;
  var caishenDecisionInFlight = false;
  var pendingDeferredFeatureBetId = null;
  var pendingDeferredFeatureTrigger = null;
  var deferredFeatureCompletionInFlight = false;
  var deferredFeatureCompletionAttempts = 0;
  var SFX_PREFS_KEY = 'bg.sfx.prefs';
  var BGM_PREFS_KEY = 'bg.bgm.prefs';
  var audioBridge = null;
  var audioBridgeAttempts = 0;
  var platformAudioPrefs = readPlatformAudioPrefs();
  var activeSockets = [];
  var gameDisposing = false;
  var gameCanvasContextLost = false;
  var renderFailureReported = false;
  var slotStallTimer = 0;
  var lastSpinRequestAt = 0;
  var lastLotteryResponseAt = 0;
  var sourceReadyAt = 0;
  var SOURCE_CONTROL_HEALTH_GRACE_MS = 12000;
  var SOURCE_SCENE_LOAD_GRACE_MS = 45000;

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

    function pruneDirectAudio() {
      if (!engine._id2audio) return;
      Object.keys(directAudio).forEach(function (id) {
        if (!engine._id2audio[id]) delete directAudio[id];
      });
    }

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
          pruneDirectAudio();
          Object.keys(directAudio).forEach(function (id) {
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
        if (Object.keys(directAudio).length >= 64) pruneDirectAudio();
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
    // Once installed, an input gesture only needs to resume the context.
    // Re-applying every active sound's volume on every tap made rapid spin
    // presses progressively more expensive in the legacy clients.
    if (!audioBridge) syncCocosAudio();
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
    var activationEvents =
      typeof window.PointerEvent === 'function'
        ? ['pointerdown', 'keydown']
        : ['touchstart', 'mousedown', 'keydown'];
    activationEvents.forEach(function (eventName) {
      window.addEventListener(eventName, resumeCocosAudio, { capture: true, passive: true });
    });
    scheduleAudioBridge();
  }

  function shouldHideLegacyButtonHandler(handler) {
    return handler === 'onCLick_buyCoin';
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

  function patchLegacyFreeSpinCountdown() {
    var componentName =
      gameCode === '113'
        ? 'JXLWMain'
        : gameCode === '135'
          ? 'DiamondMain'
          : gameCode === '155'
            ? 'YPTMain'
            : gameCode === '160'
              ? 'SGXMLMain'
              : gameCode === '188'
                ? 'Fire88Main'
                : gameCode === '232'
                  ? 'lucky777Main'
                  : '';
    if (!componentName || !window.cc) return false;
    var canvas = window.cc.find('Canvas');
    var game = canvas && canvas.getComponent(componentName);
    if (
      !game ||
      game.__yachiyoFreeSpinCountdownPatched ||
      typeof game.startFreeGame !== 'function'
    ) {
      return false;
    }
    var originalStartFreeGame = game.startFreeGame;
    if (gameCode === '188') {
      game.startFreeGame = function () {
        var main = this;
        // Fire88 schedules its base-win cleanup and free-mode start for the
        // same frame. Finish that cleanup first and pause base autoplay so it
        // cannot issue a second paid request alongside the free respin.
        this.auto = false;
        this.scheduleOnce(function () {
          main.stopFree = false;
          main.freeTimes = 0;
          originalStartFreeGame.call(main);
        }, 0.15);
      };
      game.__yachiyoFreeSpinCountdownPatched = true;
      return true;
    }
    game.startFreeGame = function () {
      // These packaged clients consume one counter before sending the first
      // free request. Diamond consumes it inside startFreeGame; Nine-Line and
      // Yu Pu Tuan consume it immediately before the call. Restore that
      // counter so an advertised award of N produces exactly N backend rounds.
      var recoveringPredecrementedSession =
        (gameCode === '135' || gameCode === '160') && !this.bIsFreeGame;
      this.freeTimes += recoveringPredecrementedSession ? 2 : 1;
      return originalStartFreeGame.apply(this, arguments);
    };
    game.__yachiyoFreeSpinCountdownPatched = true;
    return true;
  }

  function syncDeferredFeatureBalance(balance) {
    if (!Number.isFinite(balance) || !window.cc) return;
    try {
      var componentName =
        gameCode === '278' ? 'caishenwinsMain' : gameCode === '321' ? 'gatesofolympushbMain' : '';
      var canvas = window.cc.find('Canvas');
      var game = canvas && componentName ? canvas.getComponent(componentName) : null;
      if (!game) return;
      game.money = balance;
      if (game.playerInfo) game.playerInfo.playerCoin = balance;
      var label = game.slotCtrl && game.slotCtrl.lblUserCoin;
      if (label) {
        label.string =
          window.Helper && typeof window.Helper.BraziltoThousands === 'function'
            ? window.Helper.BraziltoThousands(balance)
            : balance.toFixed(2);
      }
    } catch (_error) {}
  }

  function completeDeferredFeature() {
    if (!pendingDeferredFeatureBetId || deferredFeatureCompletionInFlight) return Promise.resolve();
    var betId = pendingDeferredFeatureBetId;
    deferredFeatureCompletionInFlight = true;
    deferredFeatureCompletionAttempts += 1;
    return authorizedRequest(
      gameApi + '/complete-feature',
      'POST',
      { gameCode: gameCode, betId: betId },
      false,
    )
      .then(function (result) {
        if (pendingDeferredFeatureBetId === betId) pendingDeferredFeatureBetId = null;
        deferredFeatureCompletionAttempts = 0;
        latestSession = latestSession || {};
        latestSession.balance = Number(result.newBalance || 0);
        syncDeferredFeatureBalance(latestSession.balance);
        notifyParent('h5-slots:balance', {
          balance: latestSession.balance,
          gameCode: gameCode,
          spinId: betId,
        });
      })
      .catch(function (error) {
        if (deferredFeatureCompletionAttempts < 3) {
          window.setTimeout(completeDeferredFeature, 1200);
          return;
        }
        reportSocketError(error);
      })
      .finally(function () {
        deferredFeatureCompletionInFlight = false;
      });
  }

  function patchDeferredFeatureCompletion() {
    var componentName =
      gameCode === '278' ? 'caishenwinsMain' : gameCode === '321' ? 'gatesofolympushbMain' : '';
    if (!componentName || !window.cc) return false;
    var canvas = window.cc.find('Canvas');
    var game = canvas && canvas.getComponent(componentName);
    if (
      !game ||
      game.__yachiyoDeferredFeatureCompletionPatched ||
      typeof game.stopFreeTimes !== 'function'
    ) {
      return false;
    }
    var originalStopFreeTimes = game.stopFreeTimes;
    game.stopFreeTimes = function () {
      var result = originalStopFreeTimes.apply(this, arguments);
      completeDeferredFeature();
      return result;
    };
    game.__yachiyoDeferredFeatureCompletionPatched = true;
    return true;
  }

  function applyCocosScenePolicies() {
    hideUnsupportedLegacyButtons();
    enhanceFishAimControls();
    hideUnusedFishSeats();
    disableLegacyBrandWebViews();
    patchLegacyFreeSpinCountdown();
    patchDeferredFeatureCompletion();
    var main = sourceMainComponent();
    restoreMahjongWaysTileBackgrounds(main);
    repairIdleSlotControls(main);
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
    113: {
      family: 'classic',
      reels: 5,
      rows: 3,
      free: 'view',
      standardSymbols: 14,
      seven: 11,
      jackpotChest: 12,
      freeDiamond: 13,
      bar: 14,
    },
    116: {
      family: 'classic',
      reels: 5,
      rows: 3,
      free: 'view',
      standardSymbols: 9,
      bonusDragon: 9,
    },
    135: {
      family: 'classic',
      reels: 5,
      rows: 3,
      free: 'view',
      standardSymbols: 9,
      seven: 6,
      scatter: 7,
      wild: 8,
      goldenSeven: 9,
    },
    155: {
      family: 'classic',
      reels: 5,
      rows: 4,
      free: 'view',
      standardSymbols: 13,
      wild: 9,
      scatter: 10,
    },
    160: {
      family: 'classic',
      reels: 5,
      rows: 3,
      free: 'view',
      standardSymbols: 11,
      bonus: 9,
      scatter: 10,
      wild: 11,
      featureTrigger: 9,
    },
    161: {
      family: 'classic',
      reels: 3,
      rows: 3,
      free: 'view',
      multiplierWheel: true,
      standardSymbols: 8,
      wild: 8,
    },
    188: {
      family: 'classic',
      reels: 3,
      rows: 3,
      free: 'view',
      standardSymbols: 8,
      wild: 7,
      jackpot88: 8,
    },
    232: {
      family: 'classic',
      reels: 3,
      rows: 3,
      free: 'view',
      standardSymbols: 9,
      wild: 9,
      featureTrigger: 9,
    },
    244: {
      family: 'classic',
      reels: 5,
      rows: 3,
      free: 'view',
      standardSymbols: 11,
      scatter: 9,
      featureTrigger: 9,
      blueWild: 10,
      redWild: 11,
      caishenFaFaFa: true,
    },
    252: {
      family: 'classic',
      reels: 5,
      rows: 3,
      free: 'view',
      standardSymbols: 13,
      wild: 13,
    },
    262: {
      family: 'classic',
      reels: 3,
      rows: 3,
      free: 'view',
      standardSymbols: 9,
      star97: true,
    },
    264: {
      family: 'classic',
      reels: 3,
      rows: 4,
      reelRows: [3, 4, 3],
      rowOffsets: [1, 0, 1],
      blankSymbol: 8,
      wild: 7,
      free: 'view',
    },
    269: {
      family: 'mahjong',
      reels: 5,
      rows: 4,
      free: 'top',
      standardSymbols: 8,
      scatter: 9,
      wild: 10,
    },
    271: {
      family: 'mahjong',
      reels: 5,
      rows: 5,
      reelRows: [4, 5, 5, 5, 4],
      rowOffsets: [0, 0, 0, 0, 0],
      blankSymbol: 12,
      free: 'top',
      standardSymbols: 9,
      scatter: 10,
      wild: 11,
    },
    273: {
      family: 'tumble',
      reels: 5,
      rows: 5,
      order: 'column',
      free: 'none',
      standardSymbols: 8,
      wild: 9,
      collection: true,
    },
    276: {
      family: 'step',
      reels: 5,
      rows: 3,
      free: 'top',
      standardSymbols: 7,
      scatter: 8,
      wild: 9,
    },
    278: {
      family: 'ways',
      reels: 6,
      rows: 5,
      free: 'top',
      standardSymbols: 7,
      wild: 11,
      scatter: 12,
    },
    281: {
      family: 'step',
      reels: 5,
      rows: 3,
      free: 'top',
      standardSymbols: 7,
      scatter: 8,
      wild: 9,
    },
    301: {
      family: 'ways',
      reels: 6,
      rows: 5,
      free: 'top',
      standardSymbols: 10,
      scatter: 11,
      wild: 12,
    },
    302: {
      family: 'classic',
      reels: 3,
      rows: 3,
      free: 'view',
      extraCard: true,
      standardSymbols: 8,
      wild: 8,
    },
    321: {
      family: 'tumble',
      reels: 6,
      rows: 5,
      order: 'column',
      free: 'fs',
      standardSymbols: 9,
      scatter: 10,
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

  function publicRenderError(error) {
    var message = error && error.message ? error.message : String(error || '遊戲畫面中斷');
    if (/webgl|context|getParameter|getExtension/i.test(message)) {
      return '遊戲畫面無法建立，請關閉其他遊戲頁面後重新載入';
    }
    if (/slot-ui-stalled|控制列未恢復/i.test(message)) {
      return '開獎已完成，但遊戲控制列未恢復';
    }
    return message.length > 180 ? message.slice(0, 180) : message;
  }

  function reportFatalRenderFailure(stage, error) {
    if (gameDisposing || renderFailureReported) return false;
    renderFailureReported = true;
    notifyParent('h5-slots:fatal', {
      gameCode: gameCode,
      stage: stage,
      message: publicRenderError(error),
    });
    return true;
  }

  function bindGameCanvasRecovery() {
    if (typeof document === 'undefined') return false;
    var canvas = document.getElementById('GameCanvas');
    if (!canvas || canvas.__yachiyoRecoveryBound) return false;
    canvas.__yachiyoRecoveryBound = true;
    canvas.addEventListener(
      'webglcontextcreationerror',
      function (event) {
        gameCanvasContextLost = true;
        reportFatalRenderFailure(
          'webgl-context-creation',
          new Error((event && event.statusMessage) || '無法建立遊戲畫面'),
        );
      },
      false,
    );
    canvas.addEventListener(
      'webglcontextlost',
      function (event) {
        gameCanvasContextLost = true;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        reportFatalRenderFailure('webgl-context-lost', new Error('遊戲畫面已中斷'));
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

  function sourceMainComponent() {
    var componentByCode = {
      113: 'JXLWMain',
      116: 'SHZMain',
      135: 'DiamondMain',
      155: 'YPTMain',
      160: 'SGXMLMain',
      161: 'AZTKMain',
      188: 'Fire88Main',
      232: 'lucky777Main',
      244: 'caishenfafafaBMain',
      252: 'biyishuangfeiMain',
      262: 'mingxing972023Main',
      264: 'fortuneoxMain',
      269: 'majianghulePGMain',
      271: 'majianghule2PGMain',
      273: 'dragonhatchMain',
      276: 'captainsbountyMain',
      278: 'caishenwinsMain',
      281: 'queenbountyMain',
      301: 'goldenempireMain',
      302: 'fortunegemsMain',
      321: 'gatesofolympushbMain',
    };
    try {
      var canvas = window.cc && window.cc.find && window.cc.find('Canvas');
      var componentName = componentByCode[Number(gameCode)];
      return canvas && componentName && canvas.getComponent(componentName);
    } catch (_error) {
      return null;
    }
  }

  function sourceNodeVisible(node) {
    if (!node || node.active === false || node.activeInHierarchy === false || node.opacity === 0) {
      return false;
    }
    var face = node.children && node.children[0];
    return (
      !face || (face.active !== false && face.activeInHierarchy !== false && face.opacity !== 0)
    );
  }

  function sourceRootNodeVisible(node) {
    return Boolean(
      node && node.active !== false && node.activeInHierarchy !== false && node.opacity !== 0,
    );
  }

  function sourceControlContract(main) {
    if (!main) return null;
    var controls = main.slotCtrl;
    if (controls) {
      var slotNodes = [
        controls.Btn_start,
        controls.Btn_stop,
        controls.Btn_stopAuto,
        controls.Btn_free,
      ].filter(Boolean);
      if (slotNodes.length > 0) {
        return {
          kind: 'slot-ctrl',
          controls: controls,
          primary: controls.Btn_start || slotNodes[0],
          nodes: slotNodes,
        };
      }
    }

    // Four restored source scenes predate the shared slot_Ctrl component.
    // Lucky 777 exposes a Sprite named startBtn; Water Margin, Yu Pu Tuan and
    // Fire 88 expose the Animation attached to their roll button instead.
    var directComponent = main.startBtn || main.rollBtnAnim;
    var directNode = directComponent && (directComponent.node || directComponent);
    if (!directNode) return null;
    return {
      kind: 'direct',
      controls: null,
      primary: directNode,
      nodes: [directNode],
    };
  }

  function sourceControlNodeVisible(contract, node) {
    return contract && contract.kind === 'slot-ctrl'
      ? sourceNodeVisible(node)
      : sourceRootNodeVisible(node);
  }

  function sourceControlContractUsable(contract) {
    return Boolean(
      contract &&
      contract.nodes.some(function (node) {
        return sourceControlNodeVisible(contract, node);
      }),
    );
  }

  function sourceFeatureIsPlaying(main) {
    return Boolean(
      main &&
      (main.bigWinBoo ||
        main.bIsFreeGame ||
        main.isFreeStart ||
        main.isFreeEnd ||
        main.stopFree ||
        Number(main.freeTimes || 0) > 0),
    );
  }

  function reviveSourceSprite(node) {
    if (!node || !node.getComponent || !window.cc) return false;
    try {
      var sprite = node.getComponent(window.cc.Sprite) || node.getComponent('cc.Sprite');
      if (!sprite) return false;
      sprite.enabled = true;
      sprite._vertsDirty = true;
      var frame = sprite.spriteFrame;
      var texture = frame && typeof frame.getTexture === 'function' ? frame.getTexture() : null;
      if (
        texture &&
        texture._image &&
        typeof texture.isLoaded === 'function' &&
        texture.isLoaded() &&
        !texture._texture &&
        typeof texture.handleLoadedTexture === 'function'
      ) {
        texture.handleLoadedTexture();
      }
      return Boolean(frame);
    } catch (_error) {
      return false;
    }
  }

  function restoreMahjongWaysTileBackgrounds(main) {
    if (gameCode !== '269' || !main || !Array.isArray(main.wheelList)) return false;
    var restored = false;
    for (var wheelIndex = 0; wheelIndex < main.wheelList.length; wheelIndex += 1) {
      var wheel = main.wheelList[wheelIndex];
      if (!wheel || !Array.isArray(wheel.rolePbList) || !Array.isArray(wheel.roleIdList)) {
        continue;
      }
      // The centre reel intentionally switches to a gold plate during free games.
      if (main.bIsFreeGame && Number(wheel.wheelId) === 2) continue;
      for (var roleIndex = 0; roleIndex < wheel.rolePbList.length; roleIndex += 1) {
        var roleId = Number(wheel.roleIdList[roleIndex] || 0);
        var role = wheel.rolePbList[roleIndex];
        var whitePlate = role && role.children && role.children[0];
        // IDs 1-8 are the ordinary Mahjong tiles. Scatter/wild and gold IDs
        // use their own authored plates and must not be overwritten.
        if (roleId < 1 || roleId > 8 || !whitePlate) continue;
        var needsRepair = whitePlate.active === false || whitePlate.opacity === 0;
        if (needsRepair) restored = true;
        whitePlate.active = true;
        whitePlate.opacity = 255;
        if (needsRepair || !whitePlate.__yachiyoVisualVerified) {
          reviveSourceSprite(whitePlate);
          whitePlate.__yachiyoVisualVerified = true;
        }
      }
    }
    return restored;
  }

  function sourceButtonComponent(node) {
    if (!node || !node.getComponent) return null;
    try {
      return (
        (window.cc && window.cc.Button && node.getComponent(window.cc.Button)) ||
        node.getComponent('cc.Button')
      );
    } catch (_error) {
      return null;
    }
  }

  function repairIdleSlotControls(main) {
    if (
      !main ||
      slotSettlementInFlight ||
      Date.now() < nextSlotSettlementAt ||
      Number(main.status || 0) !== 0 ||
      sourceFeatureIsPlaying(main)
    ) {
      return false;
    }
    var contract = sourceControlContract(main);
    if (!contract) return false;
    // The older direct-control scenes already own their enabled/disabled
    // timing during result animations. Their visible authored control is a
    // valid health signal; forcing it interactable here would skip animations.
    if (contract.kind === 'direct') return sourceControlContractUsable(contract);
    var controls = contract.controls;
    if (!controls || !controls.Btn_start) return sourceControlContractUsable(contract);
    if (sourceNodeVisible(controls.Btn_start)) {
      var visibleButton = sourceButtonComponent(controls.Btn_start);
      if (!visibleButton || visibleButton.interactable !== false) return true;
    }
    try {
      if (typeof controls.setSpinAnim === 'function') controls.setSpinAnim(0);
      controls.Btn_start.active = true;
      controls.Btn_start.opacity = 255;
      var buttonFace = controls.Btn_start.children && controls.Btn_start.children[0];
      if (buttonFace) {
        buttonFace.active = true;
        buttonFace.opacity = 255;
        reviveSourceSprite(buttonFace);
      }
      var button = sourceButtonComponent(controls.Btn_start);
      if (button) button.interactable = true;
      if (controls.spin_AnimNode) {
        controls.spin_AnimNode.active = true;
        controls.spin_AnimNode.opacity = 255;
        reviveSourceSprite(controls.spin_AnimNode);
      }
      if (controls.spin_AnimNode_turn) {
        controls.spin_AnimNode_turn.active = true;
        controls.spin_AnimNode_turn.opacity = 255;
        reviveSourceSprite(controls.spin_AnimNode_turn);
      }
      return sourceNodeVisible(controls.Btn_start);
    } catch (_error) {
      return false;
    }
  }

  function sourceSlotVisualHealthy() {
    if (gameCanvasContextLost) return false;
    if (isFishGame || !sourceReadyAt) return true;
    var sourceReadyAge = Date.now() - sourceReadyAt;
    if (sourceReadyAge < SOURCE_CONTROL_HEALTH_GRACE_MS) return true;
    var main = sourceMainComponent();
    // Source login completes before Cocos finishes constructing large scenes.
    // Keep the iframe healthy while that authored scene is still loading; the
    // outer shell owns the longer load timeout and remains the final fallback.
    if (!main && sourceReadyAge < SOURCE_SCENE_LOAD_GRACE_MS) return true;
    if (!main) return false;
    restoreMahjongWaysTileBackgrounds(main);
    if (
      slotSettlementInFlight ||
      Date.now() < nextSlotSettlementAt ||
      Number(main.status || 0) !== 0 ||
      sourceFeatureIsPlaying(main)
    ) {
      return true;
    }
    // Unknown source-control layouts must not be treated as a render failure.
    // A watchdog may only remount scenes whose control contract it understands.
    if (!sourceControlContract(main)) return true;
    return repairIdleSlotControls(main);
  }

  function watchForStalledSlotUi() {
    if (gameDisposing) return;
    var main = sourceMainComponent();
    restoreMahjongWaysTileBackgrounds(main);
    repairIdleSlotControls(main);
    if (
      lastSpinRequestAt > 0 &&
      lastLotteryResponseAt > 0 &&
      Date.now() - lastLotteryResponseAt >= 22000 &&
      !slotSettlementInFlight
    ) {
      var controlContract = sourceControlContract(main);
      var hasUsableControl = sourceControlContractUsable(controlContract);
      if (main && controlContract && !hasUsableControl && !sourceFeatureIsPlaying(main)) {
        reportFatalRenderFailure('slot-ui-stalled', new Error('開獎已完成，但遊戲控制列未恢復'));
      }
    }
    slotStallTimer = window.setTimeout(watchForStalledSlotUi, 2000);
  }

  function startSlotStallWatchdog() {
    if (slotStallTimer || gameDisposing) return;
    slotStallTimer = window.setTimeout(watchForStalledSlotUi, 2000);
  }

  function disposeGameForRemount() {
    if (gameDisposing) return false;
    gameDisposing = true;
    if (slotStallTimer) {
      window.clearTimeout(slotStallTimer);
      slotStallTimer = 0;
    }
    if (deferredSlotSpinTimer) {
      window.clearTimeout(deferredSlotSpinTimer);
      deferredSlotSpinTimer = 0;
    }
    if (slotCooldownRepairTimer) {
      window.clearTimeout(slotCooldownRepairTimer);
      slotCooldownRepairTimer = 0;
    }
    deferredSlotSpinSocket = null;
    deferredSlotSpinPayload = null;
    fishStreamToken += 1;
    activeSockets.slice().forEach(function (socket) {
      try {
        socket.disconnect();
        socket.off();
      } catch (_error) {}
    });
    activeSockets = [];
    try {
      if (
        window.cc &&
        window.cc.audioEngine &&
        typeof window.cc.audioEngine.stopAll === 'function'
      ) {
        window.cc.audioEngine.stopAll();
      }
      if (window.cc && window.cc.game && typeof window.cc.game.pause === 'function') {
        window.cc.game.pause();
      }
      if (window.cc && window.cc.director && typeof window.cc.director.pause === 'function') {
        window.cc.director.pause();
      }
    } catch (_error) {}
    try {
      var canvas = typeof document !== 'undefined' && document.getElementById('GameCanvas');
      var context =
        canvas &&
        (canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl'));
      var loseContext = context && context.getExtension('WEBGL_lose_context');
      if (loseContext && typeof loseContext.loseContext === 'function') loseContext.loseContext();
    } catch (_error) {}
    window.setTimeout(function () {
      notifyParent('h5-slots:disposed', { gameCode: gameCode });
    }, 0);
    return true;
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
    return authorizedRequest(
      gameApi + '/session?gameCode=' + encodeURIComponent(gameCode),
      'GET',
      null,
      false,
    ).then(function (payload) {
      latestSession = payload.user;
      if (payload.jackpot) latestSession.jackpot = payload.jackpot;
      if ((gameCode === '281' || gameCode === '232') && payload.pendingFreeMode) {
        pendingFreeModeBetId = payload.pendingFreeMode.betId;
        pendingFreeModeTrigger = payload.pendingFreeMode;
        freeSelectionCount = gameCode === '232' ? 28 : 20;
      }
      if (gameCode === '278' && payload.pendingCaishenFree) {
        pendingCaishenBetId = payload.pendingCaishenFree.betId;
        pendingCaishenTrigger = payload.pendingCaishenFree;
        caishenFreeCount = Number(
          payload.pendingCaishenFree.features &&
            payload.pendingCaishenFree.features.freeSpinsAwarded
            ? payload.pendingCaishenFree.features.freeSpinsAwarded
            : 8,
        );
        caishenFreeMul = Number(
          payload.pendingCaishenFree.features &&
            payload.pendingCaishenFree.features.sourceFreeWinMultiplier
            ? payload.pendingCaishenFree.features.sourceFreeWinMultiplier
            : 8,
        );
      }
      if ((gameCode === '278' || gameCode === '321') && payload.pendingFeature) {
        pendingDeferredFeatureBetId = payload.pendingFeature.betId;
        pendingDeferredFeatureTrigger = payload.pendingFeature;
      }
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
    activeSockets.push(this);
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
        if (event === 'lotteryResult' || event === 'LoginRoomResult') {
          reportFatalRenderFailure('source-event-' + event, error);
        }
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
    } else if (event === 'guessFree') {
      gambleCaishenFree(socket, rawPayload);
    } else if (event === 'LoginfreeCount') {
      window.setTimeout(function () {
        if (pendingDeferredFeatureTrigger) {
          socket._trigger('LoginfreeCountResult', {
            ResultCode: 1,
            freeCount: 0,
            freeMul: Number(
              (pendingDeferredFeatureTrigger.features &&
                pendingDeferredFeatureTrigger.features.sourceFreeWinMultiplier) ||
                1,
            ),
            freeStart: false,
          });
          pendingLegacyResponses = buildLotteryResponses(pendingDeferredFeatureTrigger);
          pendingDeferredFeatureTrigger = null;
          emitQueuedLotteryResponse(socket);
          return;
        }
        if (gameCode === '278' && pendingCaishenTrigger) {
          socket._trigger('LoginfreeCountResult', {
            ResultCode: 1,
            freeCount: 0,
            freeMul: caishenFreeMul,
            freeStart: false,
          });
          pendingLegacyResponses = buildLotteryResponses(pendingCaishenTrigger);
          pendingCaishenTrigger = null;
          emitQueuedLotteryResponse(socket);
          return;
        }
        socket._trigger('LoginfreeCountResult', {
          ResultCode: 1,
          freeCount: pendingFreeModeTrigger ? 0 : freeSelectionCount,
          freeType: pendingFreeModeTrigger ? 0 : freeSelectionCount > 0 ? 1 : 0,
        });
        if (pendingFreeModeTrigger) {
          pendingLegacyResponses = buildLotteryResponses(pendingFreeModeTrigger);
          pendingFreeModeTrigger = null;
          emitQueuedLotteryResponse(socket);
        }
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
      if ((gameCode === '281' || gameCode === '232') && pendingFreeModeBetId) {
        settleBountyFreeModeSelection(socket, freeTypePayload);
      } else {
        window.setTimeout(function () {
          socket._trigger('freeTimeTypeResult', {
            ResultCode: 1,
            ResultData: {
              type: Math.max(1, Number(freeTypePayload.type || 1)),
              freeCount: freeSelectionCount,
            },
          });
        }, 0);
      }
    } else if (event === 'cleanLineOut') {
      // Source scenes emit this while being destroyed. The local bridge has
      // no shared table membership to clean up, but handling it explicitly
      // keeps the source socket contract complete.
    }
    return this;
  };

  function emitGameLogin(socket, session) {
    var visibleJackpot = Number(session.jackpot && session.jackpot.grand);
    if (!Number.isFinite(visibleJackpot)) visibleJackpot = 1000000;
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
        nGamblingWinPool: visibleJackpot,
        score: Number(session.balance || 0),
        bet: fishRoomBet,
        cannonConfig: [],
      },
    });
    if (!isFishGame) emitRoomLogin(socket);
    if (!isFishGame) startSlotStallWatchdog();
    sourceReadyAt = Date.now();
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
    window.setTimeout(spawnFish, 350);
  }

  function mixFishSequence(sequence, salt) {
    var value = Math.imul((Number(sequence) || 0) ^ salt, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return (value ^ (value >>> 16)) >>> 0;
  }

  function buildFishSpawn(sequence) {
    var typeCount = FISH_TYPE_COUNTS[gameCode] || 24;
    var typeRoll = mixFishSequence(sequence, 0x13579bdf);
    var rarityRoll = typeRoll % 100;
    var commonCount = Math.min(10, typeCount);
    var fishType;
    if (rarityRoll < 72) {
      fishType = mixFishSequence(sequence, 0x2468ace0) % commonCount;
    } else if (rarityRoll < 94) {
      fishType =
        commonCount +
        (mixFishSequence(sequence, 0x10203040) % Math.max(1, typeCount - commonCount));
    } else {
      // Surface the large/boss prefabs occasionally instead of starving them
      // completely as the former twelve-type loop did.
      fishType = Math.max(0, typeCount - 1 - (typeRoll % Math.min(4, typeCount)));
    }

    var formationRoll = mixFishSequence(sequence, 0x55aa55aa) % 20;
    var fishLineup = 0;
    var fishCount = 1;
    var canSchool = fishType < Math.min(16, typeCount);
    if (canSchool && formationRoll < 10) {
      if (formationRoll < 5) {
        fishLineup = 0;
        fishCount = 2 + (mixFishSequence(sequence, 0x11223344) % 4);
      } else if (formationRoll < 7) {
        fishLineup = 1;
        fishCount = 2 + (mixFishSequence(sequence, 0x22334455) % 3);
      } else if (formationRoll === 7) {
        fishLineup = 2;
        fishCount = 4;
      } else if (formationRoll === 8) {
        fishLineup = 3;
        fishCount = 3 + (mixFishSequence(sequence, 0x33445566) % 3);
      } else {
        fishLineup = 4;
        fishCount = 6;
      }
    } else if (!canSchool && formationRoll === 0) {
      fishCount = 2;
    }
    var fishIds = Array.from({ length: fishCount }, function (_value, index) {
      return 'yachiyo-fish-' + sequence + '-' + index;
    });
    return {
      fishType: fishType,
      fishPath: mixFishSequence(sequence, 0x7f4a7c15) % FISH_PATH_COUNT,
      fishLineup: fishLineup,
      fishCount: fishCount,
      fishId: fishIds,
      lineup: false,
      propCount: 0,
    };
  }

  function getFishSpawnDelay(sequence) {
    return (
      FISH_STREAM_MIN_INTERVAL_MS + (mixFishSequence(sequence, 0x6c8e9cf5) % FISH_STREAM_JITTER_MS)
    );
  }

  function buildLobbyLogin(session) {
    var visibleJackpot = Number(session.jackpot && session.jackpot.grand);
    if (!Number.isFinite(visibleJackpot)) visibleJackpot = 1000000;
    return {
      resultid: 1,
      win_pool: visibleJackpot,
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
    renderFailureReported = false;
    try {
      payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload || {};
    } catch (_error) {
      payload = {};
    }
    if (pendingLegacyResponses.length > 0) {
      emitQueuedLotteryResponse(socket);
      return;
    }
    if (gameCode === '278' && pendingCaishenBetId) {
      collectCaishenFree(socket);
      return;
    }
    // A few legacy scenes can emit a second `lottery` event before the first
    // authenticated settlement returns. Keep the first request authoritative;
    // its response releases the same source controls without charging twice.
    if (slotSettlementInFlight) return;
    if (Date.now() < nextSlotSettlementAt) {
      // Some archived scenes emit their next paid spin immediately when the
      // prior callback returns. Queue one intent instead of dropping it, while
      // ignoring repeated taps during the same short visual pause.
      if (!deferredSlotSpinTimer) {
        deferredSlotSpinSocket = socket;
        deferredSlotSpinPayload = rawPayload;
        deferredSlotSpinTimer = window.setTimeout(function () {
          var queuedSocket = deferredSlotSpinSocket;
          var queuedPayload = deferredSlotSpinPayload;
          deferredSlotSpinTimer = 0;
          deferredSlotSpinSocket = null;
          deferredSlotSpinPayload = null;
          if (!gameDisposing && queuedSocket) settleSpin(queuedSocket, queuedPayload);
        }, Math.max(1, nextSlotSettlementAt - Date.now()));
      }
      return;
    }
    lastSpinRequestAt = Date.now();
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
    var isEnhancedBet = payload.isBuyFree === 1 && gameCode === '302';
    var spinRequest = {
      gameCode: gameCode,
      amount: amount,
      isBuyFree: isFeaturePurchase,
    };
    if (isEnhancedBet) spinRequest.isEnhancedBet = true;
    slotSettlementInFlight = true;
    authorizedRequest(gameApi + '/spin', 'POST', spinRequest, false)
      .then(function (result) {
        latestSession = latestSession || {};
        latestSession.balance = Number(result.newBalance || 0);
        if (result.jackpot) {
          latestSession.jackpot = result.jackpot;
          socket._trigger('pushGamblingWinPool', {
            ResultCode: 1,
            nGamblingWinPool: Number(result.jackpot.grand || 0),
          });
        }
        pendingLegacyResponses = buildLotteryResponses(result);
        pendingFreeModeBetId = result.requiresFreeModeSelection ? result.betId : null;
        pendingCaishenBetId = result.requiresCaishenFreeDecision ? result.betId : null;
        if (pendingCaishenBetId) {
          caishenFreeCount = Number(
            result.features && result.features.freeSpinsAwarded
              ? result.features.freeSpinsAwarded
              : 8,
          );
          caishenFreeMul = Number(
            result.features && result.features.sourceFreeWinMultiplier
              ? result.features.sourceFreeWinMultiplier
              : 8,
          );
        }
        freeSelectionCount = Number(
          result.features && result.features.freeSpinsAwarded
            ? result.features.freeSpinsAwarded
            : 0,
        );
        nextSlotSettlementAt = Date.now() + SLOT_SPIN_PAUSE_MS;
        if (slotCooldownRepairTimer) window.clearTimeout(slotCooldownRepairTimer);
        slotCooldownRepairTimer = window.setTimeout(function () {
          slotCooldownRepairTimer = 0;
          if (!gameDisposing) repairIdleSlotControls(sourceMainComponent());
        }, SLOT_SPIN_PAUSE_MS);
        // The HTTP settlement is complete before the synchronous source
        // callback runs. Release single-flight now so an immediate auto-spin
        // callback is queued by the visual cooldown instead of being lost.
        slotSettlementInFlight = false;
        emitQueuedLotteryResponse(socket);
        lastLotteryResponseAt = Date.now();
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
      })
      .finally(function () {
        slotSettlementInFlight = false;
      });
  }

  function gambleCaishenFree(socket, rawPayload) {
    if (gameCode !== '278' || !pendingCaishenBetId || caishenDecisionInFlight) return;
    var payload = parseSocketPayload(rawPayload);
    var guessType = Math.trunc(Number(payload.type));
    if (guessType !== 0 && guessType !== 1) return;
    caishenDecisionInFlight = true;
    authorizedRequest(
      gameApi + '/caishen/gamble-free',
      'POST',
      { gameCode: gameCode, betId: pendingCaishenBetId, type: guessType },
      false,
    )
      .then(function (result) {
        caishenFreeCount = Number(result.freeCount || 0);
        caishenFreeMul = Number(result.freeMul || caishenFreeMul);
        if (Number(result.guessResult) === 0) pendingCaishenBetId = null;
        latestSession = latestSession || {};
        latestSession.balance = Number(result.newBalance || latestSession.balance || 0);
        socket._trigger('guessFreeResult', {
          ResultCode: 1,
          guessResult: Number(result.guessResult) === 1 ? 1 : 0,
          freeCount: caishenFreeCount,
          freeMul: caishenFreeMul,
        });
        notifyParent('h5-slots:balance', {
          balance: Number(latestSession.balance || 0),
          gameCode: gameCode,
          spinId: result.settlement && result.settlement.betId,
        });
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '免費遊戲猜獎失敗';
        socket._trigger('guessFreeResult', { ResultCode: -1, msg: message });
        notifyParent('h5-slots:error', { message: message });
      })
      .finally(function () {
        caishenDecisionInFlight = false;
      });
  }

  function collectCaishenFree(socket) {
    if (!pendingCaishenBetId || caishenDecisionInFlight) return;
    var selectedBetId = pendingCaishenBetId;
    caishenDecisionInFlight = true;
    authorizedRequest(
      gameApi + '/caishen/collect-free',
      'POST',
      { gameCode: gameCode, betId: selectedBetId },
      false,
    )
      .then(function (result) {
        latestSession = latestSession || {};
        latestSession.balance = Number(result.newBalance || 0);
        pendingLegacyResponses = buildLotteryResponses(result).filter(function (queued) {
          return queued.startsFreeSpin;
        });
        freeSelectionCount = pendingLegacyResponses.filter(function (queued) {
          return queued.startsFreeSpin;
        }).length;
        pendingCaishenBetId = null;
        emitQueuedLotteryResponse(socket);
        notifyParent('h5-slots:balance', {
          balance: Number(result.newBalance || 0),
          gameCode: gameCode,
          spinId: result.betId,
        });
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '免費遊戲領取失敗';
        emitLotteryError(socket, message, -998);
        notifyParent('h5-slots:error', { message: message });
      })
      .finally(function () {
        caishenDecisionInFlight = false;
      });
  }

  function settleBountyFreeModeSelection(socket, rawPayload) {
    if (freeModeSelectionInFlight || !pendingFreeModeBetId) return;
    var selectedType = Math.max(1, Math.min(3, Math.trunc(Number(rawPayload.type || 1))));
    var selectedBetId = pendingFreeModeBetId;
    freeModeSelectionInFlight = true;
    authorizedRequest(
      gameApi + '/select-free-mode',
      'POST',
      { gameCode: gameCode, betId: selectedBetId, type: selectedType },
      false,
    )
      .then(function (result) {
        latestSession = latestSession || {};
        latestSession.balance = Number(result.newBalance || 0);
        pendingLegacyResponses = buildLotteryResponses(result).filter(function (queued) {
          return queued.startsFreeSpin;
        });
        freeSelectionCount =
          gameCode === '232'
            ? selectedType === 1
              ? 28
              : selectedType === 2
                ? 14
                : 7
            : selectedType === 1
              ? 20
              : selectedType === 2
                ? 10
                : 5;
        pendingFreeModeBetId = null;
        socket._trigger('freeTimeTypeResult', {
          ResultCode: 1,
          ResultData: { type: selectedType, freeCount: freeSelectionCount },
        });
        notifyParent('h5-slots:balance', {
          balance: Number(result.newBalance || 0),
          gameCode: gameCode,
          spinId: result.betId,
        });
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : '免費遊戲模式選擇失敗';
        socket._trigger('freeTimeTypeResult', { ResultCode: -1, msg: message });
        notifyParent('h5-slots:error', { message: message });
      })
      .finally(function () {
        freeModeSelectionInFlight = false;
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
    if (queued.endsStar97FreeSpin && window.cc && typeof window.cc.find === 'function') {
      try {
        var star97Canvas = window.cc.find('Canvas');
        var star97Main =
          star97Canvas && typeof star97Canvas.getComponent === 'function'
            ? star97Canvas.getComponent('mingxing972023Main')
            : null;
        // The packaged source only arms stopFree while a counter greater than
        // zero is being decremented. A legitimate one-spin gift starts at
        // zero after its initial decrement, so explicitly mark the queued
        // final response and let the original stopFreeTimes animation close
        // the free-game background after the reels settle.
        if (star97Main) star97Main.stopFree = true;
      } catch (_error) {}
    }
    window.setTimeout(function () {
      socket._trigger('lotteryResult', queued.response);
    }, 0);
  }

  function buildLotteryResponses(result) {
    var shape = GAME_SHAPES[gameCode] || GAME_SHAPES['161'];
    var totalPayout = Number(result.payout || 0);
    var finalBalance = Number(result.newBalance || 0);
    var payoutDeferred = result.payoutDeferred === true;
    if (payoutDeferred && result.betId) {
      pendingDeferredFeatureBetId = String(result.betId);
    }
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
    var payoutParts = reconcilePayoutParts(totalPayout, [basePayout].concat(freePayouts));
    basePayout = payoutParts[0] || 0;
    freePayouts = payoutParts.slice(1);

    var sequence = [];
    var displayedBalance = payoutDeferred ? finalBalance : finalBalance - totalPayout + basePayout;
    var baseRound = {
      grid: firstVisibleGrid(result),
      finalGrid: result.grid,
      lines: result.lines || [],
      cascades: result.cascades || [],
      multiplier: result.multiplier,
      scatterSymbols: features ? features.scatterSymbols || [] : [],
      sourceFeature: (features && features.sourceMiniGame) || result.sourceFeature || null,
      sourceJackpot: features ? features.sourceJackpot || null : null,
      finalGoldPositions: result.finalGoldPositions || [],
      finalSourceStacks: result.finalSourceStacks || [],
      sourceMultiplierSymbols: features ? features.baseMultiplierSymbols || [] : [],
      sourceAppliedMultiplier: features ? features.baseAppliedMultiplier || 1 : 1,
    };
    var retriggeredFreeSpins = freeRounds.reduce(function (sum, round) {
      return sum + Math.max(0, Number(round.extraFreeSpinsAwarded || 0));
    }, 0);
    var initialFreeSpinsAwarded = Math.max(
      0,
      Number((features && features.freeSpinsAwarded) || 0) - retriggeredFreeSpins,
    );
    var triggerMeta =
      features && Number(features.freeSpinsAwarded || 0) > 0
        ? {
            trigger: true,
            awarded: initialFreeSpinsAwarded,
            remaining: Number(features.freeSpinsAwarded || 0),
            totalWin: roundMoney(totalPayout - basePayout),
            multiplier: Number(
              gameCode === '321'
                ? 1
                : features.sourceFreeWinMultiplier || features.freeSpinMultiplierBank || 1,
            ),
            sourceFreeModeType: Number(features.sourceFreeModeType || 0),
          }
        : null;
    sequence = sequence.concat(
      buildRoundResponses(baseRound, basePayout, displayedBalance, triggerMeta, baseAmount, shape),
    );

    freeRounds.forEach(function (round, index) {
      var payout = freePayouts[index] || 0;
      if (!payoutDeferred) displayedBalance = roundMoney(displayedBalance + payout);
      var remaining = freeRounds.length - index - 1;
      var extraFreeSpinsAwarded = Math.max(0, Number(round.extraFreeSpinsAwarded || 0));
      var freeMeta = {
        trigger: extraFreeSpinsAwarded > 0,
        awarded: Number(features.freeSpinsAwarded || freeRounds.length),
        remaining: remaining,
        nextFreeTime: extraFreeSpinsAwarded > 0 ? remaining : undefined,
        totalWin: roundMoney(totalPayout - basePayout),
        multiplier: Number(
          features.sourceFreeWinMultiplier ||
            round.sourceMultiplierBank ||
            round.appliedMultiplier ||
            features.freeSpinMultiplierBank ||
            1,
        ),
        sourceFreeModeType: Number(features.sourceFreeModeType || 0),
      };
      var responses = buildRoundResponses(
        {
          grid: firstVisibleGrid(round),
          finalGrid: round.finalGrid,
          lines: round.lines || [],
          cascades: round.cascades || [],
          multiplier: round.appliedMultiplier,
          scatterSymbols: round.scatterSymbols || [],
          finalGoldPositions: round.finalGoldPositions || [],
          finalSourceStacks: round.finalSourceStacks || [],
          sourceMultiplierSymbols: round.multiplierSymbols || [],
          sourceAppliedMultiplier: round.appliedMultiplier || 1,
          sourceJackpot: round.sourceJackpot || null,
          sourceFeature: round.sourceFeature || round.sourceMiniGame || null,
        },
        payout,
        displayedBalance,
        freeMeta,
        baseAmount,
        shape,
      );
      if (responses.length > 0) responses[0].startsFreeSpin = true;
      if (gameCode === '262' && index === freeRounds.length - 1 && responses.length > 0) {
        responses[responses.length - 1].endsStar97FreeSpin = true;
      }
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

    var sourceBalance =
      gameCode === '188' ? roundMoney(Number(balance || 0) - Number(payout || 0)) : balance;
    var data = {
      // Fire88Main adds winscore locally after all three reels stop. Supplying
      // the final balance here would credit the same award a second time.
      userscore: sourceBalance,
      winscore: payout,
      freeCount: freeMeta ? freeMeta.remaining + 1 : 0,
      getFreeTime: { bFlag: false, nFreeTime: 0 },
    };
    if (shape.family === 'mahjong' || shape.family === 'step' || shape.family === 'ways') {
      data.viewarray = buildCascadeSteps(round, payout, balance, baseAmount, shape);
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
        round.sourceJackpot || round.sourceFeature,
      );
    }
    applyFreeMeta(data, shape, freeMeta);
    return [{ response: makeLotteryEnvelope(data) }];
  }

  function buildCascadeSteps(round, payout, balance, baseAmount, shape) {
    var cascades = Array.isArray(round.cascades) ? round.cascades : [];
    var steps = cascades.map(function (cascade, index) {
      var stepPayout = roundMoney(baseAmount * Number(cascade.multiplier || 0));
      var symbols = flattenSymbols(
        index === 0 ? applySpecialSymbols(cascade.grid, round.scatterSymbols, shape) : cascade.grid,
        shape,
      );
      return shape.family === 'ways'
        ? buildWaysStep(
            symbols,
            cascade.lines || [],
            stepPayout,
            shape,
            index,
            baseAmount,
            balance,
            cascade.sourceStacks || [],
          )
        : buildStep(
            symbols,
            cascade.lines || [],
            stepPayout,
            shape.family === 'mahjong',
            shape,
            index,
            baseAmount,
            balance,
            cascade.goldPositions || [],
          );
    });
    if (steps.length > 0) {
      var stepPayouts = reconcilePayoutParts(
        payout,
        steps.map(function (step) {
          return Number(step.win || step.winscore || 0);
        }),
      );
      steps.forEach(function (step, index) {
        step.win = stepPayouts[index] || 0;
        step.winscore = step.win;
      });
    }
    var finalSymbols = flattenSymbols(
      applySpecialSymbols(
        round.finalGrid || round.grid,
        cascades.length === 0 ? round.scatterSymbols : [],
        shape,
      ),
      shape,
    );
    steps.push(
      shape.family === 'ways'
        ? buildWaysStep(
            finalSymbols,
            [],
            0,
            shape,
            steps.length,
            baseAmount,
            balance,
            round.finalSourceStacks || [],
          )
        : buildStep(
            finalSymbols,
            [],
            0,
            shape.family === 'mahjong',
            shape,
            steps.length,
            baseAmount,
            balance,
            round.finalGoldPositions || [],
          ),
    );
    return steps;
  }

  function buildTumbleResponses(round, payout, balance, freeMeta, baseAmount, shape) {
    var cascades = Array.isArray(round.cascades) ? round.cascades : [];
    var responses = [];
    var accumulated = 0;
    var collected = 0;
    var stepPayouts = reconcilePayoutParts(
      payout,
      cascades.map(function (cascade) {
        return roundMoney(baseAmount * Number(cascade.multiplier || 0));
      }),
    );
    var sourceMultiplierSymbols =
      gameCode !== '321' && Array.isArray(round.sourceMultiplierSymbols)
        ? round.sourceMultiplierSymbols
        : [];
    var sourceMultiplierStep = sourceMultiplierSymbols.length > 0 ? cascades.length - 1 : -1;
    cascades.forEach(function (cascade, index) {
      var stepPayout = stepPayouts[index] || 0;
      accumulated = roundMoney(accumulated + stepPayout);
      var collectedThisStep = shape.collection
        ? Math.max(
            0,
            Number.isFinite(Number(cascade.collectedThisStep))
              ? Number(cascade.collectedThisStep)
              : uniqueCascadePositionCount(cascade.lines || []),
          )
        : 0;
      collected =
        shape.collection && Number.isFinite(Number(cascade.collectedSymbols))
          ? Math.max(collected, Number(cascade.collectedSymbols))
          : collected + collectedThisStep;
      var data = buildTumbleData(
        cascade.grid,
        cascade.lines || [],
        stepPayout,
        accumulated,
        balance,
        2,
        shape,
        baseAmount,
        Object.assign({}, cascade, {
          sourceMultiplierSymbols: index === sourceMultiplierStep ? sourceMultiplierSymbols : [],
          sourceAppliedMultiplier: Number(
            cascade.sourceAppliedMultiplier || round.sourceAppliedMultiplier || 1,
          ),
        }),
        collected,
        collectedThisStep,
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
      null,
      collected,
      0,
    );
    applyFreeMeta(finalData, shape, freeMeta);
    responses.push({ response: makeLotteryEnvelope(finalData) });
    return responses;
  }

  function uniqueCascadePositionCount(lines) {
    var positions = {};
    (Array.isArray(lines) ? lines : []).forEach(function (line) {
      (Array.isArray(line && line.positions) ? line.positions : []).forEach(function (position) {
        positions[String(position.reel) + ':' + String(position.row)] = true;
      });
    });
    return Object.keys(positions).length;
  }

  function makeLotteryEnvelope(data) {
    return { ResultCode: 1, ResultData: data };
  }

  function applyFreeMeta(data, shape, meta) {
    var sourceCounterOffset = Number(shape.freeCounterOffset || 0);
    var freeTime = {
      bFlag: Boolean(meta && meta.trigger),
      nFreeType: meta ? Number(meta.sourceFreeModeType || 0) : 0,
      nFreeTime: Math.max(
        0,
        (meta && meta.nextFreeTime !== undefined
          ? Number(meta.nextFreeTime)
          : meta
            ? meta.awarded
            : 0) + sourceCounterOffset,
      ),
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
    var triggerSymbol = Number(shape.featureTrigger || shape.scatter || 0);
    if (!triggerSymbol) return cloned;
    (Array.isArray(specialSymbols) ? specialSymbols : []).forEach(function (special) {
      if (cloned[special.reel] && cloned[special.reel][special.row] !== undefined) {
        cloned[special.reel][special.row] = triggerSymbol - 1;
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
          var offset = Array.isArray(shape.rowOffsets)
            ? Number(shape.rowOffsets[reelIndex] || 0)
            : 0;
          var sourceRow = rowIndex - offset;
          var reelRows = Array.isArray(shape.reelRows)
            ? Number(shape.reelRows[reelIndex] || rows)
            : rows;
          if (sourceRow < 0 || sourceRow >= reelRows) {
            source.push(Number(shape.blankSymbol || 1));
          } else {
            source.push(mapSymbol(grid && grid[reelIndex] && grid[reelIndex][sourceRow]));
          }
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
    var rowOffset = Array.isArray(shape.rowOffsets)
      ? Number(shape.rowOffsets[Number(position.reel)] || 0)
      : 0;
    return shape.order === 'column'
      ? Number(position.reel) * shape.rows + Number(position.row)
      : (Number(position.row) + rowOffset) * shape.reels + Number(position.reel);
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
    var winningLines = (Array.isArray(lines) ? lines : [])
      .map(function (line) {
        return { line: line, positions: winLinePositions(line, shape) };
      })
      .filter(function (entry) {
        return entry.positions.length > 0;
      });
    var details = winningLines.map(function (entry) {
      return entry.positions;
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
      nWinLines: winningLines.map(function (entry, index) {
        var explicitIndex = Number(entry.line && entry.line.lineIndex);
        if (Number.isInteger(explicitIndex) && explicitIndex >= 0) return explicitIndex;
        var lineId = String((entry.line && entry.line.lineId) || '');
        var numberedLine = /^line-(\d+)$/.exec(lineId);
        if (numberedLine) return Math.max(0, Number(numberedLine[1]) - 1);
        return index;
      }),
      nWinDetail: winningLines.map(function (entry) {
        return roundMoney(Number(entry.line.payout || 0) * Number(baseAmount || 0));
      }),
    };
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function reconcilePayoutParts(total, values) {
    var targetCents = Math.max(0, Math.round(roundMoney(total) * 100));
    var cents = (Array.isArray(values) ? values : []).map(function (value) {
      return Math.max(0, Math.round(roundMoney(value) * 100));
    });
    if (cents.length === 0) return [];
    var allocated = cents.reduce(function (sum, value) {
      return sum + value;
    }, 0);
    var delta = targetCents - allocated;
    if (delta > 0) {
      cents[cents.length - 1] += delta;
    } else if (delta < 0) {
      var remaining = -delta;
      for (var index = cents.length - 1; index >= 0 && remaining > 0; index -= 1) {
        var deduction = Math.min(cents[index], remaining);
        cents[index] -= deduction;
        remaining -= deduction;
      }
    }
    return cents.map(function (value) {
      return value / 100;
    });
  }

  function falseList(length) {
    return Array.from({ length: length }, function () {
      return false;
    });
  }

  function buildClassicData(
    symbols,
    lines,
    payout,
    multiplier,
    shape,
    balance,
    baseAmount,
    sourceFeature,
  ) {
    var wins = winFields(lines, shape, baseAmount);
    var fortuneOxFeature =
      sourceFeature && sourceFeature.type === 'fortune-ox-respin' ? sourceFeature : null;
    var fortuneGemsFeature =
      sourceFeature && sourceFeature.type === 'fortune-gems-multiplier' ? sourceFeature : null;
    var aztecGemsFeature =
      sourceFeature && sourceFeature.type === 'aztec-gems-multiplier' ? sourceFeature : null;
    var star97Feature =
      sourceFeature && sourceFeature.type === 'star-97-seven-multiplier' ? sourceFeature : null;
    var diamondStrikeJackpot =
      sourceFeature && sourceFeature.type === 'diamond-strike-jackpot' ? sourceFeature : null;
    var fire88Jackpot =
      sourceFeature && sourceFeature.type === 'fire-88-jackpot' ? sourceFeature : null;
    var fruitLittleMaryJackpot =
      sourceFeature && sourceFeature.type === 'fruit-little-mary-jackpot' ? sourceFeature : null;
    var fruitLittleMary =
      sourceFeature && sourceFeature.type === 'fruit-little-mary' ? sourceFeature : null;
    var fruitMiniRounds =
      fruitLittleMary && Array.isArray(fruitLittleMary.rounds) ? fruitLittleMary.rounds : [];
    var caishenAllSame = null;
    if (
      shape.caishenFaFaFa &&
      Array.isArray(symbols) &&
      symbols.length === shape.reels * shape.rows &&
      symbols.every(function (symbol) {
        return Number(symbol) === Number(symbols[0]);
      })
    ) {
      var caishenSymbol = Number(symbols[0]);
      var caishenColor =
        caishenSymbol >= 1 && caishenSymbol <= 8
          ? caishenSymbol - 1
          : caishenSymbol === 10 || caishenSymbol === 11
            ? 9
            : -1;
      if (caishenColor >= 0) caishenAllSame = { bFlag: true, color: caishenColor };
    }
    if (fruitLittleMaryJackpot && Array.isArray(fruitLittleMaryJackpot.positions)) {
      fruitLittleMaryJackpot.positions.forEach(function (position) {
        var index = positionIndex(position, shape);
        if (Number.isInteger(index) && index >= 0 && index < wins.nWinCards.length) {
          wins.nWinCards[index] = true;
        }
      });
    }
    var data = {
      nHandCards: symbols,
      nWinCards: wins.nWinCards,
      nWinLinesDetail: wins.nWinLinesDetail,
      nWinLines: wins.nWinLines,
      nWinDetail: wins.nWinDetail,
      fMultiple:
        shape.multiplierWheel || shape.star97
          ? Math.max(
              1,
              Number(
                (star97Feature && star97Feature.multiplier) ||
                  (aztecGemsFeature && aztecGemsFeature.multiplier) ||
                  multiplier ||
                  1,
              ),
            )
          : 0,
      getFreeTime: { bFlag: false, nFreeTime: 0 },
      getOpenBox: fruitLittleMary
        ? {
            bFlag: true,
            win: roundMoney(
              Number(baseAmount || 0) * Number(fruitLittleMary.payoutMultiplier || 0),
            ),
            user_score: balance,
            cishu: Math.max(0, Math.trunc(Number(fruitLittleMary.attempts || 0))),
            chouma: roundMoney(Number(baseAmount || 0) / 9),
            gameList: fruitMiniRounds.map(function (round) {
              return Array.isArray(round.reelSymbols) ? round.reelSymbols.slice(0, 4) : [];
            }),
            roundList: fruitMiniRounds.map(function (round) {
              return Math.max(0, Math.min(23, Math.trunc(Number(round.stopIndex || 0))));
            }),
            scoreList: fruitMiniRounds.map(function (round) {
              return roundMoney(
                (Number(baseAmount || 0) / 9) * Number(round.lineBetMultiplier || 0),
              );
            }),
          }
        : diamondStrikeJackpot || fire88Jackpot
          ? {
              bFlag: true,
              win_list: Array.isArray((diamondStrikeJackpot || fire88Jackpot).picks)
                ? (diamondStrikeJackpot || fire88Jackpot).picks.slice()
                : [],
              win_card: Number((diamondStrikeJackpot || fire88Jackpot).tierMultiplier || 10),
              win: roundMoney(
                Number(baseAmount || 0) *
                  Number((diamondStrikeJackpot || fire88Jackpot).payoutMultiplier || 0),
              ),
            }
          : { bFlag: false, card: 0 },
      getAllSame: caishenAllSame || { bFlag: false },
      getBigWin: {
        bFlag: Boolean(
          fortuneOxFeature &&
          (fortuneOxFeature.triggered || Number(fortuneOxFeature.fullScreenMultiplier || 1) > 1),
        ),
        isStart: Boolean(fortuneOxFeature),
      },
      exCard: shape.extraCard
        ? Math.max(
            0,
            Math.min(5, Number((fortuneGemsFeature && fortuneGemsFeature.multiplierIndex) || 0)),
          )
        : undefined,
      winEx: Boolean(fortuneGemsFeature && fortuneGemsFeature.winEx),
      user_score: balance,
      winscore: payout,
    };
    return data;
  }

  function buildStep(
    symbols,
    lines,
    payout,
    mahjong,
    shape,
    index,
    baseAmount,
    balance,
    goldPositions,
  ) {
    var wins = winFields(lines, shape, baseAmount);
    var goldCards = (Array.isArray(goldPositions) ? goldPositions : [])
      .map(function (position) {
        return positionIndex(position, shape);
      })
      .filter(function (position, listIndex, list) {
        return (
          Number.isInteger(position) &&
          position >= 0 &&
          position < shape.reels * shape.rows &&
          list.indexOf(position) === listIndex
        );
      });
    return {
      nHandCards: symbols,
      nWinCards: wins.nWinCards,
      nWinLinesDetail: wins.nWinLinesDetail,
      nWinLines: wins.nWinLines,
      nWinDetail: wins.nWinDetail,
      goldCards: mahjong ? goldCards : undefined,
      combo_num: index,
      win: payout,
      winscore: payout,
      user_score: balance,
      getFreeTime: { bFlag: false, nFreeTime: 0 },
    };
  }

  function buildWaysStep(symbols, lines, payout, shape, index, baseAmount, balance, sourceStacks) {
    var wins = winFields(lines, shape, baseAmount);
    if (gameCode === '301') patchGoldenEmpireRuntime();
    var stackMetadata =
      gameCode === '278' || gameCode === '301'
        ? buildSourceStackMetadata(symbols, shape, sourceStacks)
        : null;
    var topReel =
      gameCode === '278' || gameCode === '301'
        ? [1, 2, 3, 4].map(function (reel) {
            var value = Number(symbols[reel]);
            return Number.isFinite(value) && value > 0 ? value : 1;
          })
        : [1, 2, 3, 4];
    return {
      nHandCards: symbols,
      nWinCards: wins.nWinCards,
      nWinCards_top: falseList(4),
      nWinLinesDetail: wins.nWinLinesDetail,
      nWinLines: wins.nWinLines,
      nWinDetail: wins.nWinDetail,
      trl: topReel,
      sr: stackMetadata ? stackMetadata.sr : [],
      srd: stackMetadata ? stackMetadata.srd : [],
      combo_num: index,
      win: payout,
      winscore: payout,
      user_score: balance,
    };
  }

  function buildSourceStackMetadata(symbols, shape, sourceStacks) {
    var sr = [];
    var srd = [];
    if (Array.isArray(sourceStacks) && sourceStacks.length > 0) {
      sourceStacks.forEach(function (stack) {
        var id = Math.max(0, Math.trunc(Number(stack.id || 0)));
        var positions = (Array.isArray(stack.positions) ? stack.positions : [])
          .map(function (position) {
            return Number(position.row) * shape.reels + Number(position.reel);
          })
          .filter(function (position) {
            return (
              Number.isInteger(position) && position >= 0 && position < shape.reels * shape.rows
            );
          });
        if (positions.length <= 1 && stack.state === 'ordinary') return;
        sr[id] = positions;
        var sourceSymbol = mapSymbol(stack.symbol);
        if (stack.state === 'gold') {
          srd[id] = { bt: 1, ls: 2, r: sourceSymbol };
        } else if (stack.state === 'wild') {
          srd[id] = {
            bt: 1,
            ls: 3,
            r: Number(shape.wild || sourceSymbol),
            times: Math.max(1, Math.trunc(Number(stack.remaining || positions.length || 1))),
          };
        } else {
          srd[id] = { bt: 0, ls: 0, r: sourceSymbol };
        }
      });
      return { sr: sr, srd: srd };
    }
    for (var reel = 0; reel < shape.reels; reel += 1) {
      if (gameCode === '301' && (reel < 1 || reel > 4)) continue;
      var visualIndexes = [];
      for (var visualRow = 0; visualRow < shape.rows; visualRow += 1) {
        visualIndexes.push((shape.rows - 1 - visualRow) * shape.reels + reel);
      }
      for (var start = 0; start < visualIndexes.length; ) {
        var firstIndex = visualIndexes[start];
        var symbol = Number(symbols[firstIndex]);
        var group = [firstIndex];
        var next = start + 1;
        while (
          next < visualIndexes.length &&
          Number(symbols[visualIndexes[next]]) === symbol &&
          group.length < 4
        ) {
          group.push(visualIndexes[next]);
          next += 1;
        }
        if (group.length > 1) {
          sr.push(group);
          // bt=0/ls=0 is an ordinary large symbol. The original scene uses
          // the same sr shape for silver/gold framed transitions later.
          srd.push({ bt: 0, ls: 0, r: symbol });
        }
        start = next;
      }
    }
    return { sr: sr, srd: srd };
  }

  function patchGoldenEmpireRuntime() {
    var game = window.gameJs;
    if (!game || game.__yachiyoGoldenEmpirePatched || typeof game.getWheelInfos !== 'function') {
      return;
    }
    var original = game.getWheelInfos;
    game.getWheelInfos = function (reel, stepIndex) {
      var infos = original.call(this, reel, stepIndex);
      if (Number(reel) >= 6 || !Array.isArray(infos)) return infos;
      var steps = this.lotteryRes && this.lotteryRes.viewarray;
      var step = Array.isArray(steps) ? steps[stepIndex] : null;
      if (!step || !step.sr || !step.srd) return infos;
      var infoIndex = 0;
      for (var visualRow = 0; visualRow < 5 && infoIndex < infos.length; ) {
        var position = 6 * (4 - visualRow) + Number(reel);
        var groupId = -1;
        for (var id in step.sr) {
          if (Array.isArray(step.sr[id]) && step.sr[id].indexOf(position) !== -1) {
            groupId = id;
            break;
          }
        }
        var groupSize = groupId !== -1 ? step.sr[groupId].length : 1;
        var detail = groupId !== -1 ? step.srd[groupId] : null;
        if (detail && Number(detail.ls) === 3) {
          infos[infoIndex].times = Math.max(1, Math.trunc(Number(detail.times || groupSize)));
        }
        visualRow += Math.max(1, groupSize);
        infoIndex += 1;
      }
      return infos;
    };
    if (typeof game.onCLick === 'function') {
      var originalClick = game.onCLick;
      game.onCLick = function (event, action) {
        var result = originalClick.call(this, event, action);
        if (action === 'help' && this.helpUI) {
          try {
            var webViewNode = this.helpUI.getChildByName('webView');
            var webView = webViewNode && webViewNode.getComponent(cc.WebView);
            if (webView && typeof webView.url === 'string') {
              webView.url = webView.url.replace('name=SuperAce', 'name=GoldenEmpire');
            }
          } catch (_error) {}
        }
        return result;
      };
    }
    game.__yachiyoGoldenEmpirePatched = true;
  }

  if (gameCode === '301' && window.document) {
    [0, 250, 1000, 2500].forEach(function (delay) {
      window.setTimeout(patchGoldenEmpireRuntime, delay);
    });
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
    cascadeMeta,
    collectedSymbols,
    collectedThisStep,
  ) {
    var symbols = flattenSymbols(
      cascadeMeta && Array.isArray(cascadeMeta.sourceGrid) ? cascadeMeta.sourceGrid : grid,
      shape,
    );
    var resultSymbols = flattenSymbols(grid, shape);
    var wins = winFields(lines, shape, baseAmount);
    var ways = {};
    wins.nWinLinesDetail.forEach(function (positions, index) {
      ways[String(index)] = positions;
    });
    var sourceAction = cascadeMeta && cascadeMeta.sourceAction;
    var sourceMultiplierSymbols =
      cascadeMeta && Array.isArray(cascadeMeta.sourceMultiplierSymbols)
        ? cascadeMeta.sourceMultiplierSymbols
        : [];
    var sourceAppliedMultiplier = Math.max(
      1,
      Number((cascadeMeta && cascadeMeta.sourceAppliedMultiplier) || 1),
    );
    var dragonActionType = {
      'dragon-earth': 3,
      'dragon-water': 2,
      'dragon-fire': 1,
      'dragon-queen': 0,
    };
    var dragonFeature =
      shape.collection && sourceAction && dragonActionType[sourceAction.type] !== undefined
        ? [
            {
              idh: true,
              p: (Array.isArray(sourceAction.positions) ? sourceAction.positions : [])
                .map(function (position) {
                  return positionIndex(position, shape);
                })
                .filter(function (position, index, list) {
                  return (
                    Number.isInteger(position) &&
                    position >= 0 &&
                    position < shape.reels * shape.rows &&
                    list.indexOf(position) === index
                  );
                }),
              dt: dragonActionType[sourceAction.type],
            },
          ]
        : [];
    if (gameCode === '321' && sourceMultiplierSymbols.length === 0 && sourceAppliedMultiplier > 1) {
      var thorPositions = (
        Array.isArray(cascadeMeta && cascadeMeta.removed) ? cascadeMeta.removed : []
      )
        .map(function (position) {
          return positionIndex(position, shape);
        })
        .filter(function (position, index, list) {
          return (
            Number.isInteger(position) &&
            position >= 0 &&
            position < shape.reels * shape.rows &&
            list.indexOf(position) === index
          );
        });
      if (thorPositions.length > 0) {
        dragonFeature = [
          {
            idh: true,
            p: thorPositions,
            dt: Math.min(3, Math.max(0, sourceAppliedMultiplier - 2)),
            multiplier: sourceAppliedMultiplier,
          },
        ];
      }
    }
    var sourceResultSymbols = resultSymbols.slice();
    if (sourceAction && sourceAction.type === 'dragon-earth') {
      dragonFeature[0].p.forEach(function (position) {
        sourceResultSymbols[position] = 0;
      });
    }
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
        cb: shape.collection
          ? Math.max(0, Number(collectedSymbols || 0))
          : wins.nWinLinesDetail.reduce(function (sum, positions) {
              return sum + positions.length;
            }, 0),
        cbc: shape.collection ? Math.max(0, Number(collectedThisStep || 0)) : 0,
        orl: symbols,
        rl: sourceResultSymbols,
        wp: ways,
        gm: gameCode === '321' ? sourceAppliedMultiplier : 1,
        fs: null,
        ts: null,
        df: dragonFeature,
        nHandCards: resultSymbols,
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

  bindGameCanvasRecovery();
  function addWindowListener(type, listener) {
    if (typeof window.addEventListener === 'function') window.addEventListener(type, listener);
  }
  addWindowListener('error', function (event) {
    var error = event && (event.error || event.message);
    var stack = error && error.stack ? String(error.stack) : '';
    var message = publicRenderError(error);
    if (
      /h5-slot-collection|cocos2d-js/i.test(stack) &&
      /webgl|context|getParameter|getExtension|Cannot read|undefined is not an object/i.test(
        message,
      )
    ) {
      reportFatalRenderFailure('source-runtime-error', error);
    }
  });
  addWindowListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var stack = reason && reason.stack ? String(reason.stack) : '';
    if (/h5-slot-collection|cocos2d-js/i.test(stack)) {
      reportFatalRenderFailure('source-runtime-rejection', reason);
    }
  });
  addWindowListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== window.parent || !event.data)
      return;
    if (event.data.type === 'h5-slots:dispose') disposeGameForRemount();
    if (event.data.type === 'h5-slots:health-check' && !gameDisposing) {
      notifyParent('h5-slots:health', {
        gameCode: gameCode,
        healthy: sourceSlotVisualHealthy(),
      });
    }
  });
  addWindowListener('pagehide', disposeGameForRemount);

  function fakeIo() {
    return new FakeSocket();
  }
  fakeIo.connect = fakeIo;
  fakeIo.io = fakeIo;

  window.__YachiyoH5AdapterTest = {
    gameCode: gameCode,
    shape: GAME_SHAPES[gameCode],
    buildLotteryResponses: buildLotteryResponses,
    reconcilePayoutParts: reconcilePayoutParts,
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
    bindGameCanvasRecovery: bindGameCanvasRecovery,
    disposeGameForRemount: disposeGameForRemount,
    sourceMainComponent: sourceMainComponent,
    sourceNodeVisible: sourceNodeVisible,
    sourceRootNodeVisible: sourceRootNodeVisible,
    sourceControlContract: sourceControlContract,
    sourceControlContractUsable: sourceControlContractUsable,
    sourceFeatureIsPlaying: sourceFeatureIsPlaying,
    repairIdleSlotControls: repairIdleSlotControls,
    restoreMahjongWaysTileBackgrounds: restoreMahjongWaysTileBackgrounds,
    sourceSlotVisualHealthy: sourceSlotVisualHealthy,
    watchForStalledSlotUi: watchForStalledSlotUi,
    completeDeferredFeature: completeDeferredFeature,
    patchDeferredFeatureCompletion: patchDeferredFeatureCompletion,
    getPendingDeferredFeatureBetId: function () {
      return pendingDeferredFeatureBetId;
    },
    createFakeSocket: function () {
      return new FakeSocket();
    },
  };
  window.__YachiyoUnlockAudio = resumeCocosAudio;
  window.__YachiyoDisposeH5Game = disposeGameForRemount;
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
