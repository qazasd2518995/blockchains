window.boot = function () {
    var settings = window._CCSettings;
    window._CCSettings = undefined;
    var onProgress = null;
    
    var RESOURCES = cc.AssetManager.BuiltinBundleName.RESOURCES;
    var INTERNAL = cc.AssetManager.BuiltinBundleName.INTERNAL;
    var MAIN = cc.AssetManager.BuiltinBundleName.MAIN;
    function getForegroundLoadOptions () {
        var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        var effectiveType = String(connection && connection.effectiveType || '');
        var cores = Number(navigator.hardwareConcurrency || 4);
        var maxConcurrency = 10;
        if ((connection && connection.saveData) || /(^|-)2g$/.test(effectiveType)) {
            maxConcurrency = 2;
        }
        else if (cores <= 2) {
            maxConcurrency = 2;
        }
        else if (cc.sys.os === cc.sys.OS_IOS) {
            maxConcurrency = cores >= 6 ? 6 : 4;
        }
        else if (cc.sys.os === cc.sys.OS_ANDROID) {
            maxConcurrency = cores >= 8 ? 8 : 5;
        }
        return {
            priority: 2,
            maxConcurrency: maxConcurrency,
            maxRequestsPerFrame: Math.min(maxConcurrency, 6)
        };
    }
    function setLoadingDisplay () {
        // Loading splash scene
        var splash = document.getElementById('splash');
        var progressBar = splash.querySelector('.progress-bar span');
        onProgress = function (finish, total) {
            var percent = 100 * finish / total;
            if (progressBar) {
                progressBar.style.width = percent.toFixed(2) + '%';
            }
        };
        splash.style.display = 'block';
        progressBar.style.width = '0%';

        cc.director.once(cc.Director.EVENT_AFTER_SCENE_LAUNCH, function () {
            splash.style.display = 'none';
        });
    }

    var onStart = function () {
        // Keep the original Retina presentation without asking high-DPR
        // phones to render the legacy Cocos scene at the engine's DPR 2 cap.
        // DPR 1.5 retains crisp labels and reduces per-frame fill work by 44%.
        if (cc.sys.isMobile) {
            cc.view._maxPixelRatio = Math.min(1.5, window.devicePixelRatio || 1);
        }
        cc.view.enableRetina(true);
        // Keep the decoded source image on iOS so a restored WebGL context can
        // recreate the fruit board and control textures instead of going blank.
        cc.macro.CLEANUP_IMAGE_CACHE = false;
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute(
                'data-cocos-render-quality',
                cc.sys.isMobile ? 'mobile-balanced-retina' : 'retina'
            );
        }
        cc.view.resizeWithBrowserSize(true);

        if (cc.sys.isBrowser) {
            setLoadingDisplay();
        }

        if (cc.sys.isMobile) {
            if (settings.orientation === 'landscape') {
                cc.view.setOrientation(cc.macro.ORIENTATION_LANDSCAPE);
            }
            else if (settings.orientation === 'portrait') {
                cc.view.setOrientation(cc.macro.ORIENTATION_PORTRAIT);
            }
            cc.view.enableAutoFullScreen([
                cc.sys.BROWSER_TYPE_BAIDU,
                cc.sys.BROWSER_TYPE_BAIDU_APP,
                cc.sys.BROWSER_TYPE_WECHAT,
                cc.sys.BROWSER_TYPE_MOBILE_QQ,
                cc.sys.BROWSER_TYPE_MIUI,
                cc.sys.BROWSER_TYPE_HUAWEI,
                cc.sys.BROWSER_TYPE_UC,
            ].indexOf(cc.sys.browserType) < 0);
        }

        var foregroundLoadOptions = getForegroundLoadOptions();
        if (cc.sys.isBrowser) {
            cc.assetManager.downloader.maxConcurrency = foregroundLoadOptions.maxConcurrency;
            cc.assetManager.downloader.maxRequestsPerFrame = foregroundLoadOptions.maxRequestsPerFrame;
        }

        var launchScene = settings.launchScene;
        var bundle = cc.assetManager.bundles.find(function (b) {
            return b.getSceneInfo(launchScene);
        });
        
        bundle.loadScene(launchScene, foregroundLoadOptions, onProgress,
            function (err, scene) {
                if (!err) {
                    cc.director.runSceneImmediate(scene);
                    try {
                        window.parent.postMessage(
                            { type: 'fruit-mary:visual-ready', scene: launchScene },
                            window.location.origin
                        );
                    }
                    catch (_) {}
                    if (cc.sys.isBrowser) {
                        // show canvas
                        var canvas = document.getElementById('GameCanvas');
                        canvas.style.visibility = '';
                        var div = document.getElementById('GameDiv');
                        if (div) {
                            div.style.backgroundImage = '';
                        }
                        console.log('Success to load scene: ' + launchScene);
                    }
                }
            }
        );

    };

    var option = {
        id: 'GameCanvas',
        debugMode: settings.debug ? cc.debug.DebugMode.INFO : cc.debug.DebugMode.ERROR,
        showFPS: settings.debug,
        frameRate: 60,
        groupList: settings.groupList,
        collisionMatrix: settings.collisionMatrix,
    };

    cc.assetManager.init({ 
        bundleVers: settings.bundleVers,
        remoteBundles: settings.remoteBundles,
        server: settings.server
    });
    
    var bundleRoot = [INTERNAL];
    settings.hasResourcesBundle && bundleRoot.push(RESOURCES);

    var count = 0;
    function cb (err) {
        if (err) return console.error(err.message, err.stack);
        count++;
        if (count === bundleRoot.length + 1) {
            cc.assetManager.loadBundle(MAIN, function (err) {
                if (!err) cc.game.run(option, onStart);
            });
        }
    }

    cc.assetManager.loadScript(settings.jsList.map(function (x) { return 'src/' + x;}), cb);

    for (var i = 0; i < bundleRoot.length; i++) {
        cc.assetManager.loadBundle(bundleRoot[i], cb);
    }
};

if (window.jsb) {
    var isRuntime = (typeof loadRuntime === 'function');
    if (isRuntime) {
        require('src/settings.e124f.js');
        require('src/cocos2d-runtime.js');
        if (CC_PHYSICS_BUILTIN || CC_PHYSICS_CANNON) {
            require('src/physics.js');
        }
        require('jsb-adapter/engine/index.js');
    }
    else {
        require('src/settings.e124f.js');
        require('src/cocos2d-jsb.js');
        if (CC_PHYSICS_BUILTIN || CC_PHYSICS_CANNON) {
            require('src/physics.js');
        }
        require('jsb-adapter/jsb-engine.js');
    }

    cc.macro.CLEANUP_IMAGE_CACHE = false;
    window.boot();
}
