/**
 * Modify by gms on 2025.10.07
 *  update isLandScape、isPortrait 檢查優先性
 *   1. window.matchMedia (在 iframe & PWA 中，優先使用 matchMedia 判斷)
 *   2. screen.orientation
 *   3. window.orientation
 *   4. window.innerHeight、window.innerWidth (在部分Android裝置中，取得寬高需要延遲，否則會不正確)
 * 
 * Modify by gms on 2024.11.07
 *  新增加入版本顯示功能 (addShowVersion)
 * 
 * Modify by gms on 2022.06.30
 * 新增支援賓果遊戲滿版及轉向處理
 * 
 * Created by gms on 2021.02.03
 * initGame.js 說明
 * 用於處理遊戲和index相關的js
 * 滿版、轉向...等等
 */

/**
 * 提供給PC版本調整Help Size使用
 * 因為Mobile是滿版呈現
 * PC需要跟隨遊戲主體寬度呈現
 * */
function resetHelpSize() {
    try {
        document.getElementsByClassName('btnCloseHelp')[0].style.width = '40px';
        document.getElementsByClassName('btnCloseHelp')[0].style.height = '40px';
        if (document.getElementById('Help')) {
            document.getElementById('Help').style.width = document.querySelector('canvas').offsetWidth + 'px';
        }
    } catch (error) {
        setTimeout(function () {
            resetHelpSize()
        }, 300);
    }
}

// ----- 處理滿版(全螢幕) -----
/*
    全螢幕步驟:
        1.檢查是否有全螢幕功能 isEnabled
        2.檢查是否為全螢幕狀態 isFullscreen
 
        other : 場景變換監聽
*/
var fingerAnimID = -1;
/**
 * 遊戲版型類型
 * 0:橫版、1:直版、2:直橫版
 */
var gameOriType = 2;
window.addEventListener('orientationchange', updateFingermove, false);

/**
 * 呼叫滿版功能確認
 */
function setFullScreenEnable(enable , gameOriType) {
    this.gameOriType = gameOriType || 0;
    if (!isMobile()) {
        // 2021.02.01 Help改為滿版顯示
        // 處理電腦模式下的Help
        // document.getElementById('Help').style.left = '50%';
        // document.getElementById('Help').style.transform = 'translateX(-50%)';
        // 2020.06.16 需求:PC版的Help寬度要跟隨遊戲主體寬度大小
        // resetHelpSize();
        // window.addEventListener('resize', function (event) { setTimeout(() => resetHelpSize(), isIPad ? 500 : 200); });
        return;
    }

    /*
        2020.08.24 針對全螢幕的例外處理
        iPad允許全螢幕功能,但應用則選擇不使用
        因為ios上的全螢幕手勢進行下拉後,會導致全螢幕狀態被關閉
        導致Help不易操作
    */
   // 確認轉向功能
   checkOrientation();
    // if (isIPad) {
    //     return;
    // }
    // 設定是否要啟用滿版功能
    // 判斷是否為Safari瀏覽器，不是的話，一律不支援滿版功能
    // 2021.10.15 新增ios web applicaton判斷，web application時不啟用滿版
    // 2021.11.15 整合ios os 15
    if (!window.navigator.userAgent.toLowerCase().match(/(version)*^((?!crios|fxios|yabrowser|duckduckgo).)*safari/i)
        || window.navigator.standalone
        || (getIOSVersion() >= 15 && getIOSVersion() < 15.6)
        || isIPad
    ) {
        enable = false;
    }
    if (isIOS || isIPad) {
        iPhoneScreenfull.enableFullScreen(enable);
    } else {
        screenfull.enableFullScreen(enable);
    }
    
    if (screenfull.isEnabled) {
        setDocumentSize();
        if (!enable) {
            // setDocumentSize();
        } else {
            document.addEventListener('touchmove', function (e) {
                e.preventDefault()
            }, { passive: false });
            screenfull.on('change', function () { checkFullScreen() })
            // window.addEventListener('resize', windowResize);
            checkFullScreen();
        }
    } else {
        if (!enable) {
            // windowResize();
            checkiPhoneFullScreen();
            iPhoneScreenfull.onChange(function () {
                // windowResize();
                checkOrientation();
                checkiPhoneFullScreen();

                setTimeout(function () {
                    if (document.documentElement.scrollTop > 0) {
                        // console.log('document.documentElement.scrollTop : '+document.documentElement.scrollTop );
                        document.documentElement.scrollTop = 0;
                    }
                    if (document.body.scrollTop > 0) {
                        // console.log('document.body.scrollTop : '+document.body.scrollTop );
                        document.body.scrollTop = 0;
                    }
                    // egret.updateAllScreens();
                }, isIOS || isIPad ? 20 : 300)
            });
            return;
        } else {
            iPhoneScreenfull.onChange(function () {
                // console.log("trigger resize event ...");
                // --- 監聽到尺寸變換 ---
                // windowResize();
                checkOrientation();
                checkiPhoneFullScreen();

                setTimeout(function () {
                    if (document.documentElement.scrollTop > 0) {
                        // console.log('document.documentElement.scrollTop : '+document.documentElement.scrollTop );
                        document.documentElement.scrollTop = 0;
                    }
                    if (document.body.scrollTop > 0) {
                        // console.log('document.body.scrollTop : '+document.body.scrollTop );
                        document.body.scrollTop = 0;
                    }
                    // egret.updateAllScreens();
                }, isIOS || isIPad ? 20 : 300)
            });
        }
        updateFingermove();
    }

}

var screenfullClickCount = -1 ;
function checkFullScreen() {
    // if(window.orientation == 180 || window.orientation == 0){
    //     return;
    // }
    // windowResize();
    if (screenfull.isEnabled) {
        if (!screenfull.isFullscreen) {
            screenfullClickCount = -1;
            var isShowRotateTip = checkOrientationTip(this.gameOriType);
            if (!isShowRotateTip) {
                showFingerTip();
            }
            var finger = document.querySelector(".callFull");

            finger.onclick = function (e) {
                screenfull.request()
                    .then(function () {
                        hideFingerTip();
                        finger.onclick = null;
                        screenfullClickCount = -1;
                    }, function () {
                        // alert('Full Screen Fail');
                        console.log('Full Screen Fail');
                    })
                screenfullClickCount++;
                if (screenfullClickCount == 1) {
                    hideFingerTip();
                    finger.onclick = null;
                    screenfullClickCount = -1;
                    screenfull.enableFullScreen(false);
                }
            }
        }
    } else {
        // alert('not use screen full api');
        console.log('not use screen full api');
    }
}


/** iPhone直版滿版提示timer id */
var iPhonePortraitFullTipID = -1;
/**
 * 檢查滿版
 */
function checkiPhoneFullScreen() {
    if (!iPhoneScreenfull.getEnableFullScreen()) {
        // 非滿版情況
        if (!isPWA() && (getIOSVersion() == 15 || (getIOSVersion() == 26))) {
            document.documentElement.style.height = "calc(var(--vh, 1vh) * 100)";
            document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px');
            setFullScreen();
        } else {
            setFullScreen();
            document.documentElement.style.height = "calc(var(--vh, 1vh) * 100)";
            document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px');
        }
    } else {
        
        // --- 處理預設尺寸 ---
        // if (isPortrait()) {
        if (getIOSVersion() == 15) {

        } else {
            // ios 13直版的滿版模式預設高度尺寸，需要這樣才能觸發滿版手指
            document.documentElement.style.height = "100vh";
            document.documentElement.style.removeProperty('--vh');
            document.body.style.height = "100vh";
            document.body.style.removeProperty('--vh');
        }
        // }

        if (!iPhoneScreenfull.isFullscreen) {
            var isShowRotateTip = checkOrientationTip(this.gameOriType);
            if (!isShowRotateTip) {
                showFingerTip();
            }
            document.getElementsByTagName('body')[0].style.touchAction = "auto";//ios 13
            document.getElementsByTagName('html')[0].style.touchAction = "auto";//ios 13

            if (isPortrait() && (this.gameOriType == 1 || this.gameOriType == 2)) {
                if (iPhoneScreenfull.isFullscreen) {
                    // 滿版狀態
                    setFullScreen();
                } else {
                    // 非滿版狀態
                    setFullScreenPercent();
                    clearTimeout(iPhonePortraitFullTipID);
                    if (isPortrait()) {
                        // 直版
                        iPhonePortraitFullTipID = setTimeout(function () {
                            iPhonePortraitFullTipID = -1;
                            // --- 自動取消滿版 ---
                            if (getIOSVersion() < 13) {
                                // ios 12 以下滑動相容性
                                if (document.getElementById('Help')) {
                                    var iframe = document.getElementById('Help');
                                    iframe.style.webkitOverflowScrolling = 'touch';
                                }
                            }
                            document.documentElement.style.height = "100%";
                            document.documentElement.style.removeProperty('--vh');
                            setFullScreenPercent();
                            hideFingerTip();
                            clearTimeout(iPhonePortraitFullTipID);
                        }, 10000, this);
                    }
                }

            } else if (isLandScape() && (this.gameOriType == 0 || this.gameOriType == 2)) {
                // setFullScreen();
                setFullScreenVH();
            }

            window.scrollTo(0, 0);
            if (getIOSVersion() < 13) {
                // ios 12 以下滑動相容性
                if (document.getElementById('Help')) {
                    var iframe = document.getElementById('Help');
                    iframe.style.webkitOverflowScrolling = 'unset';
                }
            }

        } else {
            if (getIOSVersion() < 13) {
                // ios 12 以下滑動相容性
                if (document.getElementById('Help')) {
                    var iframe = document.getElementById('Help');
                    iframe.style.webkitOverflowScrolling = 'touch';
                }
            }
            hideFingerTip();
            setFullScreen();
        }
    }
}

/**
* 1.調整 callFull(fingermove) size
* 2.刷新ios iframe size
*/
function updateFingermove() {
    clearTimeout(iPhonePortraitFullTipID);
    if (!isMobile())
        return;
    
    if (isIOS) { 
        setTimeout(function () {
            if (document.getElementById('help_iframe')) {
                if (getIOSVersion() < 13) {
                    // ios 12 以下,高度異常時強制刷新,使用變更Size方式XD
                    var iframe = document.getElementById('help_iframe').contentWindow;
                    iframe.postMessage({ tag: 'slot', type: 'Get' }, '*');
                } else {
                    // refer : https://stackoverflow.com/questions/1192228/scrolling-an-iframe-with-javascript
                    // ios 13以上,高度異常時強制刷新,直接滾到頂
                    var iframe = document.getElementById('help_iframe').contentWindow;
                    iframe.postMessage({ tag: 'slot', type: 'Get' }, '*');
                }
            }
            if (document.getElementById('eventIframe')) {
                if (getIOSVersion() < 13) {
                    // ios 12 以下,高度異常時強制刷新,使用變更Size方式XD
                    var iframe = document.getElementById('eventIframe').contentWindow;
                    iframe.postMessage({ tag: 'slot', type: 'Get' }, '*');
                } else {
                    // refer : https://stackoverflow.com/questions/1192228/scrolling-an-iframe-with-javascript
                    // ios 13以上,高度異常時強制刷新,直接滾到頂
                    var iframe = document.getElementById('eventIframe').contentWindow;
                    iframe.postMessage({ tag: 'slot', type: 'Get' }, '*');
                }
            }
            checkOrientation();
            checkiPhoneFullScreen();
        }, 100);
    } else {
        // Other Device，ex:Android
        checkOrientation();
    }
}
// ----- 處理滿版(全螢幕) -----

// ----- 處理轉向 -----
// orientationSlot.onChange(function () {
//     checkOrientation();
//     if (isIOS && !iPhoneScreenfull.getEnableFullScreen()
//         || !isIOS && !screenfull.isEnableFullScreen)
//         windowResize();
// })

function checkOrientation() {

    var isShowRotateTip = checkOrientationTip(this.gameOriType);
    if (isShowRotateTip) {
        showOrientationTip();
    } else {
        hideOrientationTip();
    }
    // if (isPortrait()) {
    //     // 設定高度
    //     document.querySelector(".egret-player").style.height = '100%';
    //     document.body.style.height = '100%';
    // } else if (isLandScape()) {
    //     // 設定高度
    //     if (iPhoneScreenfull.getEnableFullScreen())
    //         setFullScreen();
    //     else
    //         setFullScreenPercent();
    // }
}
// ----- 處理轉向 -----

// ----- 處理兩指以上的手勢(禁用) for IOS -----
var lastTouchEnd = 0;

var is_touch_ing = false;
var last_known_scroll_position = 0;
var ticking = false;
var is_scroll = false;
document.addEventListener('scroll', function (e) { 
    last_known_scroll_position = window.scrollY;
    if (!ticking) {
        window.requestAnimationFrame(function () {
            doSomething(last_known_scroll_position , is_touch_ing);
            ticking = false;
        });
        ticking = true;
    }
    is_scroll = true;
})
function doSomething(scroll_pos, touch_ing) {
    if (!touch_ing) {
        if (last_known_scroll_position == scroll_pos && last_known_scroll_position != 0) {
            document.scrollingElement.scrollTop = 0;  
        }
        if(is_scroll){
            // egret.updateAllScreens();
            is_scroll = false;
        }
    }
}
document.addEventListener('touchstart', function (event) {
    is_touch_ing = true;
});
document.addEventListener('touchend', function (event) {
    setTimeout(function(){
        is_touch_ing = false;
        doSomething(last_known_scroll_position , is_touch_ing);
    },200)
});

document.addEventListener('touchmove', function (e) {
    if (iPhoneScreenfull.isFullscreen) {
        if (fingerAnimID != -1)
            checkiPhoneFullScreen();
        e.preventDefault();
    }
    // 新增禁止手勢
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// setInterval(function () {
//     if (isLandScape()) {
//         checkiPhoneFullScreen();
//     }
// }, 500);
// ----- 處理兩指以上的手勢(禁用) for IOS -----

// ----- 處理IOS版型 -----
function windowResize() {
    setTimeout(function () {
        // We execute the same script as before
        var vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', vh + 'px');
        if (document.documentElement.scrollTop > 0) {
            // console.log('document.documentElement.scrollTop : '+document.documentElement.scrollTop );
            document.documentElement.scrollTop = 0;
        }
        if (document.body.scrollTop > 0) {
            // console.log('document.body.scrollTop : '+document.body.scrollTop );
            document.body.scrollTop = 0;
        }
        // egret.updateAllScreens();
    }, isIOS || isIPad ? 20 : 300)
}

// ----- 處理IOS版型 ----- 

// ----- 處理小尺寸iPhone的Help異常 -----
if (isIOS && screen.width == 375 && screen.height == 667) {
    if (document.getElementById('help_iframe')) {
        document.getElementById('help_iframe').style.height = '150%';
        var minScreenValus = "";
        setInterval(function () {
            if (document.getElementById('Help').style.visibility != minScreenValus) {
                var random = Math.floor(Math.random() * 100);
                document.getElementById('help_iframe').style.height = 100 + random + "%";
                minScreenValus = document.getElementById('Help').style.visibility;
            }
        }, 1000)
    }

    if (document.getElementById('eventIframe')) {
        document.getElementById('eventIframe').style.height = '100%';
        var minScreenValus2 = "";
        setInterval(function () {
            if (document.getElementById('gameActivites').style.visibility != minScreenValus2) {
                var random = Math.floor(Math.random() * 100);
                document.getElementById('eventIframe').style.height = 100 + random + "%";
                minScreenValus2 = document.getElementById('gameActivites').style.visibility;
            }
        }, 1000)
    }
}
// ----- 處理小尺寸iPhone的Help異常 -----


/**
 * 目前裝置是否為橫版
 * @returns {boolean}
 */
function isLandScape() {

    // 如果在 iframe 中，優先使用 matchMedia 判斷（反映當前 document viewport）
    var inIframe = (typeof window !== 'undefined' && window.self !== window.top);
    if (inIframe || isPWA()) {
        try {
            if (typeof window.matchMedia === 'function') {
                var mql = window.matchMedia('(orientation: landscape)');
                if (mql) {
                    return mql.matches;
                }
            }
        } catch (e) {
            // matchMedia 在某些極端環境可能拋錯，繼續使用下方 fallback
        }
    }

    // 優先使用 Screen Orientation API
    if (screen && screen.orientation) {
        try {
            return screen.orientation.type.includes('landscape');
        } catch (e) {
            // 權限錯誤，繼續 fallback
        }
    }
    // fallback 到 window.orientation
    if (typeof window.orientation !== 'undefined') {
        return Math.abs(window.orientation) === 90;
    }
    // 最終 fallback 到視窗尺寸
    return window.innerWidth > window.innerHeight;
}

/**
 * 目前裝置是否為直版
 * @returns {boolean}
 */
function isPortrait() {

    // 如果在 iframe 中，優先使用 matchMedia 判斷（反映當前 document viewport）
    var inIframe = (typeof window !== 'undefined' && window.self !== window.top);
    if (inIframe || isPWA()) {
        try {
            if (typeof window.matchMedia === 'function') {
                var mql = window.matchMedia('(orientation: portrait)');
                if (mql) {
                    return mql.matches;
                }
            }
        } catch (e) {
            // matchMedia 在某些極端環境可能拋錯，繼續使用下方 fallback
        }
    }

    // 非 iframe 或 matchMedia 不可用時，保留原先的檢查流程
    // 優先使用 Screen Orientation API
    if (screen && screen.orientation) {
        try {
            return screen.orientation.type.includes('portrait');
        } catch (e) {
            // 權限錯誤，繼續 fallback
        }
    }
    // fallback 到 window.orientation
    if (typeof window.orientation !== 'undefined') {
        return Math.abs(window.orientation) === 0 || Math.abs(window.orientation) === 180;
    }
    // 最終 fallback 到視窗尺寸
    return window.innerHeight > window.innerWidth;
}


/**
 * 檢查轉向類型提示
 * @param {number} oriType  遊戲版面類型
 * @returns {boolean}      是否顯示轉向提示
 */
function checkOrientationTip(oriType) {
    var isShowTip = true;
    if (oriType == 0 && isPortrait()) {
        // showOrientationTip();
    } else if (oriType == 1 && isLandScape()) {
        // showOrientationTip();
    } else {
        // hideOrientationTip();
        isShowTip = false;
    }
    return isShowTip;
}
/**
 * 顯示轉向提示
 */
function showOrientationTip() {
    //  顯示時重新將轉向提示圖片加到最上層
    var rotationTips = document.querySelector(".rotationTips");
    if (!rotationTips.contains(imgRotateTip)) {
        rotationTips.appendChild(imgRotateTip);
        // 0:橫版、1:直版、2:直橫版
        if (this.gameOriType == 0) {
            imgRotateTip.classList.add("imgRotationTips");
        } else if (this.gameOriType == 1) {
            imgRotateTip.classList.add("imgRotationVTips");
        }
    }
    // document.appendChild(rotationTips);
    rotationTips.style.display = "block";
    hideFingerTip();
}
/**
 * 隱藏轉向提示
 */
function hideOrientationTip() {
    document.querySelector(".rotationTips").style.display = "none";
    if (screenfull.isEnabled && screenfull.isEnableFullScreen) {
        checkFullScreen();
    } else if (isIOS) {
        checkiPhoneFullScreen()
    }
}

// 滿版手指關閉按鈕 - for 直版
var fingerCloseBtn = document.createElement("div");
var fingerBtn = document.createElement("img");
var imgRotateTip = document.createElement("img");

/**
 * 顯示手指滑動提示
 */
function showFingerTip(){
    var finger = document.querySelector(".callFull");

    if (!finger.contains(fingerBtn)) {
        finger.appendChild(fingerBtn);
        if (isIOS)
            fingerBtn.classList.add("callFullFinger_ios")
        else
            fingerBtn.classList.add("callFullFinger")
    }

    if (!finger.contains(fingerCloseBtn) && isIOS) {
        finger.appendChild(fingerCloseBtn);
        fingerCloseBtn.classList.add("callFullClose")
        fingerCloseBtn.addEventListener("click", function (e) {
            // --- 自動取消滿版 ---
            if (getIOSVersion() < 13) {
                // ios 12 以下滑動相容性
                if (document.getElementById('Help')) {
                    var iframe = document.getElementById('Help');
                    iframe.style.webkitOverflowScrolling = 'touch';
                }
                if (document.getElementById('gameActivites')) {
                    var iframe = document.getElementById('gameActivites');
                    iframe.style.webkitOverflowScrolling = 'touch';
                }
            }
            document.documentElement.style.height = "100%";
            document.documentElement.style.removeProperty('--vh');
            setFullScreenPercent();
            hideFingerTip();
            clearTimeout(iPhonePortraitFullTipID);
            iPhonePortraitFullTipID = -1;
        })
    }

    finger.style.height = "120vh";
    finger.style.display = "block";
    if (isPortrait()) {
        fingerCloseBtn.classList.remove("callFullCloseH")
        finger.style.backgroundSize = "20%";
        fingerCloseBtn.style.display = "block";
    } else if (isLandScape()) {
        fingerCloseBtn.classList.add("callFullCloseH")
        finger.style.backgroundSize = "12%";
        fingerCloseBtn.style.display = "block";
    }
}
/**
 * 隱藏手指滑動提示
 */
function hideFingerTip(){
    clearTimeout(iPhonePortraitFullTipID);
    document.querySelector(".callFull").style.display = "none";
    clearInterval(fingerAnimID);
    fingerAnimID = -1;
}

function setDocumentSize(){
    // --- 符合目前尺寸大小 ---
    // document.documentElement.style.height = "calc(var(--vh, 1vh) * 100)";
    // document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px');

    // --- 符合尺寸大小 ---
    document.documentElement.style.height = "100%";
    document.documentElement.style.removeProperty('--vh');
    document.body.style.height = "100%";
    document.body.style.removeProperty('--vh');
    // document.querySelector(".egret-player").style.height = "100%";
    // document.querySelector(".egret-player").style.removeProperty('--vh');
    // 沒設定到100％原因:100%在Help滑到底時，會被跟著往上拉
    if (document.getElementById('Help')) {
        document.getElementById('Help').style.height = "99%";
        document.getElementById('Help').style.removeProperty('--vh');
    }
    if (document.getElementById('gameActivites')) {
        document.getElementById('gameActivites').style.height = "99%";
        document.getElementById('gameActivites').style.removeProperty('--vh');
    }
    // egret.updateAllScreens();
}


function setPortraitFullScreen(){
    document.documentElement.style.height = "calc(var(--vh, 1vh) * 100)";
    document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px');
    setFullScreen();
}

/**
 * 設定全滿版(vh)
 */
function setFullScreen(){

    // document.documentElement.style.height = "calc(var(--vh, 1vh) * 100)";
    // document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px');

    document.documentElement.style.height = "100vh";
    document.documentElement.style.removeProperty('--vh');

    document.body.style.height = "calc(var(--vh, 1vh) * 100)";
    document.body.style.setProperty('--vh', (window.innerHeight / 100) + 'px');

    // document.querySelector(".pcBackground").style.height = "calc(var(--vh, 1vh) * 100)";
    // document.querySelector(".pcBackground").style.setProperty('--vh', (window.innerHeight / 100) + 'px');
    
    if (isBingoGame()) {
        // document.querySelector(".egret-player").style.height = "calc(var(--vh, 1vh) * 100 - env(safe-area-inset-bottom))";
    } else {
        // document.querySelector(".egret-player").style.height = "calc(var(--vh, 1vh) * 100)";
    }
    // document.querySelector(".egret-player").style.setProperty('--vh', (window.innerHeight / 100) + 'px');

    if (document.getElementById('Help')) {
        document.getElementById('Help').style.height = "calc(var(--vh, 1vh) * 100)";
        document.getElementById('Help').style.setProperty('--vh', (window.innerHeight / 100) + 'px');
    }
    if (document.getElementById('gameActivites')) {
        document.getElementById('gameActivites').style.height = "calc(var(--vh, 1vh) * 100)";
        document.getElementById('gameActivites').style.setProperty('--vh', (window.innerHeight / 100) + 'px');
    }

    // egret.updateAllScreens();
    
}
/**
 * 設定滿版(%)
 */
function setFullScreenPercent(){
    // document.documentElement.style.height = "100%";
    // document.documentElement.style.removeProperty('--vh');
    document.body.style.height = "100%";
    document.body.style.removeProperty('--vh');
    // document.querySelector(".pcBackground").style.height = "100%";
    // document.querySelector(".pcBackground").style.removeProperty('--vh');
    if (isBingoGame()) {
        // document.querySelector(".egret-player").style.height = "calc(100% - env(safe-area-inset-bottom))";
        if (document.getElementById('GameDiv')) {
            document.getElementById('GameDiv').style.height = "calc(100% - env(safe-area-inset-bottom))";
        }
    } else {
        // document.querySelector(".egret-player").style.height = "100%";
        if (document.getElementById('GameDiv')) {
            document.getElementById('GameDiv').style.height = "100%";
        }
    }
    // document.querySelector(".egret-player").style.removeProperty('--vh');

    if (document.getElementById('Help')) {
        document.getElementById('Help').style.height = "100%";
        document.getElementById('Help').style.removeProperty('--vh');
    }
    if (document.getElementById('gameActivites')) {
        document.getElementById('gameActivites').style.height = "100%";
        document.getElementById('gameActivites').style.removeProperty('--vh');
    }

    // egret.updateAllScreens();

}

function setFullScreenVH(){
    document.documentElement.style.height = "100vh";
    document.documentElement.style.removeProperty('--vh');
    document.body.style.height = "100vh";
    document.body.style.removeProperty('--vh');
    // document.querySelector(".pcBackground").style.height = "100vh";
    // document.querySelector(".pcBackground").style.removeProperty('--vh');
    // document.querySelector(".egret-player").style.height = "100vh";
    // document.querySelector(".egret-player").style.removeProperty('--vh');
    if (document.getElementById('Help')) {
        document.getElementById('Help').style.height = "100vh";
        document.getElementById('Help').style.removeProperty('--vh');
    }
    if (document.getElementById('gameActivites')) {
        document.getElementById('gameActivites').style.height = "100vh";
        document.getElementById('gameActivites').style.removeProperty('--vh');
    }
    if (document.getElementById('GameDiv')) {
        document.getElementById('GameDiv').style.height = "100vh";
        document.getElementById('GameDiv').style.removeProperty('--vh');
    }
    // egret.updateAllScreens();
}

function isBingoGame() {
    return location.href.toLowerCase().indexOf("bingogame") > -1;
}

function isSlotGame() {
    return location.href.toLowerCase().indexOf("slotgame") > -1;
}

/**
 * 加入版本顯示
 * @param {f} key       版本Key值
 * @param {*} version   版本號
 */
function addShowVersion(key, version) {
    let groupKey = "rsg_versions";
    let versionGroupDiv = document.getElementById(groupKey);
    if (!versionGroupDiv) {
        versionGroupDiv = document.createElement("div");
        versionGroupDiv.id = groupKey;
        document.body.appendChild(versionGroupDiv);
    }
    key = "rsg_" + key;
    let versionDiv = document.getElementById(key);
    if (versionDiv) {
        versionDiv.innerHTML = version;
    } else {
        versionDiv = document.createElement("div");
        versionDiv.id = key;
        versionDiv.innerHTML = version;
        versionGroupDiv.appendChild(versionDiv);
    }
}

function isPWA() {
    // 方法一：標準的 'display-mode' 媒體查詢
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
    }
    // 方法二：兼容舊版 iOS Safari 的非標準屬性
    if (window.navigator.standalone === true) {
        return true;
    }
    // 如果以上條件都不滿足，則是在分頁中運行
    return false;
}