System.register([], function (_export, _context) {
  "use strict";

  var cc, Application;
  function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
  function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
  function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
  function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
  function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
  function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
  return {
    setters: [],
    execute: function () {
      _export("Application", Application = /*#__PURE__*/function () {
        function Application() {
          _classCallCheck(this, Application);
          this.settingsPath = 'src/settings.json'; // settings.json 文件路径，通常由编辑器构建时传入，你也可以指定自己的路径
          this.showFPS = false; // 是否打开 profiler, 通常由编辑器构建时传入，你也可以指定你需要的值
        }
        _createClass(Application, [{
          key: "init",
          value: function init(engine) {
            cc = engine;
            cc.game.onPostBaseInitDelegate.add(this.onPostInitBase.bind(this)); // 监听引擎启动流程事件 onPostBaseInitDelegate
            cc.game.onPostSubsystemInitDelegate.add(this.onPostSystemInit.bind(this)); // 监听引擎启动流程事件 onPostSubsystemInitDelegate
          }
        }, {
          key: "onPostInitBase",
          value: function onPostInitBase() {
            // cc.settings.overrideSettings('assets', 'server', '');
            // 实现一些自定义的逻辑
          }
        }, {
          key: "onPostSystemInit",
          value: function onPostSystemInit() {
            // 实现一些自定义的逻辑
          }
        }, {
          key: "start",
          value: function start() {
            return cc.game.init({
              // 以需要的参数运行引擎
              debugMode: false ? cc.DebugMode.INFO : cc.DebugMode.ERROR,
              //settingsPath: this.settingsPath, // 传入 settings.json 路径
              settingsPath: getContentPath() + "/" + this.settingsPath,
              // 传入 settings.json 路径
              overrideSettings: {
                // 对配置文件中的部分数据进行覆盖，第二部分会详细介绍这个字段
                // assets: {
                //      preloadBundles: [{ bundle: 'main', version: 'xxx' }],
                // }
                assets: {
                  //server: 'http://192.168.30.243:10000/WebUI3/content/LuckyDog/',
                  server: getContentPath() + "/"
                },
                profiling: {
                  showFPS: this.showFPS
                }
              }
            }).then(function () {
              return cc.game.run();
            });
          }
        }]);
        return Application;
      }());
    }
  };
});