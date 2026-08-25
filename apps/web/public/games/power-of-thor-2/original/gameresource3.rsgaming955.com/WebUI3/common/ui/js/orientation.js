/**
 * Created by gms on 2021.02.03
 * 轉向功能偵測
 */
var orientationSlot = (function () {

    var callbacks = [], running = false;
    

    function orientationchange() {
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
        callbacks.forEach(function (callback) {
            callback();
        });
        running = false;
    }

    // adds callback to loop
    function addCallback(callback) {
        if (callback) {
            callbacks.push(callback);
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
            if (!callbacks.length) {
                window.addEventListener('orientationchange', orientationchange);
            }
            addCallback(callback);
        }
    }

}());