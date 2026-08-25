/**
 * Modify by gms on 2021.02.03
 * 新增enableFullScreen參數，用來確認是否要啟用滿版判定
 * enableFullScreen = false , 取得isFullscreen時一律為true
 * 
 * Created by gms on 2020.06.01
 * 滿版功能 for iphone 
 * 
 * refer : https://developer.mozilla.org/zh-CN/docs/Web/API/Window/resize_event
 */
var iPhoneScreenfull = (function () {

    var _callbacks = [], running = false, _enableFullScreen = false;

    // fired on resize event
    function resize() {
        if (!running) {
            running = true;
            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(runCallbacks);
            } else {
                setTimeout(runCallbacks, 66);
            }
        }
    }

    // run the actual callbacks
    function runCallbacks() {
        _callbacks.forEach(function (callback) {
            callback();
        });
        running = false;
    }

    // adds callback to loop
    function addCallback(callback) {
        if (callback) {
            _callbacks.push(callback);
        }
    }
    

    function touchMoveListener(params) {
        if(this.isFullscreen){
            e.preventDefault();
        }
    }


    // public
    return {
        // /**
        //  * 是否為全螢幕
        //  * @returns {boolean}
        //  */
        // isFullscreen: function () {
        //     return window.innerHeight >= document.body.clientHeight;
        // },
        onChange: function (callback) {
            if (!_callbacks.length) {
                window.addEventListener('resize', resize);
            }
            addCallback(callback);
        }
        , enableFullScreen: function (enable) {
            _enableFullScreen = enable;
        }
        , getEnableFullScreen:function(){
            return _enableFullScreen;
        }
    }

}());

Object.defineProperties(iPhoneScreenfull, {
    /**
     * 是否為全螢幕
     * @returns {boolean}
     */
    isFullscreen: {
        get: function () {
            if (iPhoneScreenfull.getEnableFullScreen()) {
                // if (window.innerHeight > window.innerWidth)
                //     return true;
                return window.innerHeight >= document.body.clientHeight;
            } else {
                return true;
            }
        }
    }
});