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
            // The source build ships with Cocos' conservative default of six
            // downloads.  Its startup graph contains hundreds of small files,
            // so allow HTTP/2 to fetch more of them in parallel without
            // changing texture resolution, audio, or rendering quality.
            if (cc.assetManager && cc.assetManager.downloader) {
              var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
              var concurrency = isMobile ? 12 : 16;
              cc.assetManager.downloader.maxConcurrency = concurrency;
              cc.assetManager.downloader.maxRequestsPerFrame = concurrency;
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
            let view_mode = urlParams.get("view_mode");
            let key = urlParams.get("gn") + "_" + "view_mode";
            let localViewMode = localStorage.getItem(key);
            if (localViewMode != null) {
              view_mode = localViewMode
            }
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
              return cc.game.run();
            });
          }
        }]);

        return Application;
      }());
    }
  };
});
