System.register([], function (_export, _context) {
  "use strict";

  var cc, Application;


  let currentURL = new URL(window.location.href)
  let urlParams = currentURL.searchParams

  function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

  function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

  function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

  return {
    setters: [],
    execute: function () {
      _export("Application", Application = /*#__PURE__*/function () {
        function Application() {
          _classCallCheck(this, Application);

          this.settingsPath = 'src/settings.json';
          this.showFPS = false;
        }

        _createClass(Application, [{
          key: "init",
          value: function init(engine) {
            cc = engine;
            // Keep the original full-quality files while adapting discovery
            // throughput to the device. Powerful Android devices can overlap
            // more of the source build's many small requests; low-memory/iOS
            // devices retain the conservative path that avoids decoder stalls.
            if (cc.assetManager && cc.assetManager.downloader) {
              var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
              var isAndroid = /Android/i.test(navigator.userAgent);
              var hardwareConcurrency = navigator.hardwareConcurrency || 4;
              var deviceMemory = navigator.deviceMemory;
              var isLowEndDevice = hardwareConcurrency <= 4
                || typeof deviceMemory === "number" && deviceMemory <= 4;
              var concurrency = isIOS
                ? isLowEndDevice ? 6 : 8
                : isAndroid
                  ? isLowEndDevice ? 10 : 14
                  : 18;
              var requestsPerFrame = isIOS
                ? Math.min(concurrency, 6)
                : isAndroid
                  ? Math.min(concurrency, 10)
                  : 12;
              cc.assetManager.downloader.maxConcurrency = concurrency;
              cc.assetManager.downloader.maxRequestsPerFrame = requestsPerFrame;
            }
            cc.game.onPostBaseInitDelegate.add(this.onPostInitBase.bind(this));
            cc.game.onPostSubsystemInitDelegate.add(this.onPostSystemInit.bind(this));
          }
        }, {
          key: "onPostInitBase",
          value: function onPostInitBase() {// cc.settings.overrideSettings('assets', 'server', '');
            // do custom logic
          }
        }, {
          key: "onPostSystemInit",
          value: function onPostSystemInit() {// do custom logic
          }
        }, {
          key: "start",
          value: function start() {
            let requestedViewMode = urlParams.get("view_mode");
            let key = urlParams.get("gn") + "_" + "view_mode";
            let localViewMode = localStorage.getItem(key);
            // Keep the scene, design resolution and the parent iframe URL on
            // one authoritative orientation.  Standalone Safari persists a
            // separate localStorage value which may otherwise override a new
            // iframe generation and boot the wrong scene into a black canvas.
            let view_mode = requestedViewMode == "portrait" || requestedViewMode == "landscape"
              ? requestedViewMode
              : localViewMode == "portrait" || localViewMode == "landscape"
                ? localViewMode
                : "landscape";
            window.viewMode = view_mode;
            if (localViewMode !== view_mode) localStorage.setItem(key, view_mode);
            let launchScene = view_mode == "portrait" ? "mainPortrait" : "main";
            let designWidth = view_mode == "portrait" ? 720 : 1280;
            let designHeight = view_mode == "portrait" ? 1280 : 720;
            return cc.game.init({
              debugMode: cc.DebugMode.ERROR,
              settingsPath: this.settingsPath,
              overrideSettings: {
                launch: {
                  launchScene: launchScene
                },
                screen: {
                  designResolution: {
                    width: designWidth,
                    height: designHeight,
                    policy: 2
                  },
                  exactFitScreen: true,
                  frameRate: 60,
                  orientation: view_mode
                },
                // assets: {
                //      preloadBundles: [{ bundle: 'main', version: 'xxx' }],
                // }
                profiling: {
                  showFPS: this.showFPS
                }
              }
            }).then(function () {
              window.appStart(cc)
              var afterLaunch = cc.Director && cc.Director.EVENT_AFTER_SCENE_LAUNCH;
              if (afterLaunch && cc.director) {
                cc.director.once(afterLaunch, function () {
                  window.parent.postMessage({ type: 'seth2:visual-ready' }, window.location.origin);
                });
              }
              return cc.game.run();
            });
          }
        }]);

        return Application;
      }());
    }
  };
});
