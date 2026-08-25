const isMobileDevice = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
const isIOSDevice = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
const isWebView = () => {
  var useragent = navigator.userAgent
  var rules = ['WebView', '(iPhone|iPod|iPad)(?!.*Safari\/)', 'Android.*(wv|\.0\.0\.0)']
  var regex = new RegExp(`(${rules.join('|')})`, 'ig')
  return Boolean(useragent.match(regex))
}
var screenDirection=null;
//某家代理專用
const isLiGu = () =>{
  let customAgent=navigator.userAgent;
  // console.error("userAgent:::::::::",customAgent);
  let isLiGu=/closeSwipe/i.test(navigator.userAgent);
  // console.error("isCloseSwipe:::::::::",isLiGu);
  return isLiGu;
}

const isPWA = () => {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  if (window.navigator.standalone) {
    return true;
  }
  return false;
}

var isFirstResize = true;

const isWap = () => {
  return isMobileDevice() && !isWebView() && !isPWA()
}

const isIframe = () => {
  return window.top !== window.self;
}

const getViewMode = () => {
  let currentURL = new URL(window.location.href)
  let urlParams = currentURL.searchParams
  let requestedViewMode = urlParams.get("view_mode");
  let key = urlParams.get("gn") + "_" + "view_mode";
  let localViewMode = localStorage.getItem(key);
  // The parent shell owns orientation changes.  A query value belongs to the
  // current iframe generation and must win over stale standalone/PWA storage;
  // otherwise the engine can load the portrait scene with landscape sizing.
  let view_mode = requestedViewMode === "portrait" || requestedViewMode === "landscape"
    ? requestedViewMode
    : localViewMode === "portrait" || localViewMode === "landscape"
      ? localViewMode
      : "landscape";
  window.viewMode = view_mode;
  if (localViewMode !== view_mode) localStorage.setItem(key, view_mode);
  return view_mode;
}


const detectOrientation = () => {
  const portraitQuery = window.matchMedia("(orientation: portrait)")
  const landscapeQuery = window.matchMedia("(orientation: landscape)")

  const isPortrait = window.innerWidth < window.innerHeight

  if (portraitQuery.matches || isPortrait) {
    if(screenDirection!=="portrait"){
      screenDirection="portrait";
      let orientationEvent=new Event('orientationchange');
      window.dispatchEvent(orientationEvent);
    }
    return 0
  } else if (landscapeQuery.matches) {
    if(screenDirection!=="landscape"){
      screenDirection="landscape";
      let orientationEvent=new Event('orientationchange');
      window.dispatchEvent(orientationEvent);
    }
    return 1
  } else {
    return null
  }
}


const currentURL = new URL(window.location.href)
const urlParams = currentURL.searchParams

const onload = () => {
  const logoContainer = document.getElementById('logo')

  const setLogo = () => {
    logoContainer.style.display = 'none'
    const logo = urlParams.get('p')
    const defaultUrl = './public/atg.png'
    if (!logo) {
      showLogo(defaultUrl)
      return
    }
    const remoteUrl = `${window.location.origin}/images/logos/${logo}.png`

    const imageLoader = new Image()

    imageLoader.onload = () => {
      showLogo(remoteUrl)
    }

    imageLoader.onerror = () => {
      showLogo(defaultUrl)
    }

    imageLoader.src = remoteUrl
  }

  const showLogo = (url) => {
    logoContainer.children[0].src = url
    logoContainer.style.display = 'block'
    logoContainer.children[0].style.width = '10%'
    if (isMobileDevice()) {
      if (detectOrientation()) {
        logoContainer.children[0].style.width = '10%'
      } else {
        logoContainer.children[0].style.width = '20%'
      }
    }
  }
  setLogo()
}

const start = (cc) => {
  const styles = [
    'background: linear-gradient(169deg, rgba(57, 57, 57, 0.95) 0%, #171717 65%);', 'color: white', 'line-height: 2em', 'padding: 0 12px'
  ].join(';')
  const date = 10271538
  console.warn(`%c 🐽🐽🐽 Version: ${date} 🐽🐽🐽 `, styles)
  const logoEle = document.getElementById('logo')
  logoEle.addEventListener('touchend',(e)=>{e.preventDefault()},{passive:false});
  const GameWrapper = document.getElementById('GameWrapper')
  const GameDiv = document.getElementById('GameDiv')
  const swipeEle = document.getElementById('swipe')
  const loadingMsg = document.getElementById('loadingMsg')
  // const version = document.getElementById('version')
  const orientationEle = document.getElementById('orientation')
  orientationEle.addEventListener('touchend',(e)=>{e.preventDefault()},{passive:false});
  // const debugEle = document.getElementById('debug')
  let showSwipeTimeId = null
  let cocosHasTakenOver = false
  let bootTimeoutId = null
  let bootProgressTimerId = null
  let bootRecoveryTimerId = null
  let bootRecoveryReported = false
  let lastResourceCount = typeof performance !== 'undefined' && performance.getEntriesByType
    ? performance.getEntriesByType('resource').length
    : 0
  let lastResourceProgressAt = Date.now()

  const setLoadingMessage = (message) => {
    if (cocosHasTakenOver) return
    loadingMsg.replaceChildren(document.createTextNode(message))
    loadingMsg.style.display = 'block'
  }

  const showLoadingRetry = () => {
    if (cocosHasTakenOver) return

    const message = document.createElement('span')
    message.textContent = '載入時間較長，請檢查網路後再試一次。'
    const retryButton = document.createElement('button')
    retryButton.type = 'button'
    retryButton.className = 'loading-retry-button'
    retryButton.textContent = '重新載入'
    retryButton.addEventListener('click', () => window.location.reload())
    loadingMsg.replaceChildren(message, retryButton)
    loadingMsg.style.display = 'block'
  }

  const resourceCount = () => (
    typeof performance !== 'undefined' && performance.getEntriesByType
      ? performance.getEntriesByType('resource').length
      : lastResourceCount
  )

  const observeBootProgress = () => {
    if (cocosHasTakenOver) return
    const nextResourceCount = resourceCount()
    if (nextResourceCount > lastResourceCount) {
      lastResourceCount = nextResourceCount
      lastResourceProgressAt = Date.now()
    }
  }

  const reportBootstrapStall = () => {
    if (cocosHasTakenOver || bootRecoveryReported) return
    observeBootProgress()
    // Slow connections are allowed to keep loading. Recovery is requested
    // only after the resource graph has stopped advancing for 30 seconds.
    if (Date.now() - lastResourceProgressAt < 30000) {
      bootRecoveryTimerId = setTimeout(reportBootstrapStall, 15000)
      return
    }
    bootRecoveryReported = true
    if (isIframe() && window.parent) {
      window.parent.postMessage({
        type: 'seth2:recovery-request',
        stage: 'bootstrap-stalled',
        message: '遊戲素材載入暫停，正在重新建立畫面',
      }, window.location.origin)
    }
  }

  setLoadingMessage('遊戲載入中…')
  bootTimeoutId = setTimeout(showLoadingRetry, 45000)
  bootProgressTimerId = setInterval(observeBootProgress, 5000)
  bootRecoveryTimerId = setTimeout(reportBootstrapStall, 75000)

  // version.textContent = `${date}`

  // swipe
  const showSwipe = () => {
    swipeEle.style.display = 'block'
    swipeEle.style.zIndex = '1000'
    swipeEle.style.height = '200%'
    document.scrollingElement.scrollTop = -100
    GameWrapper.style.zIndex = '10'
    document.addEventListener('scroll', _scroll)
    document.body.removeEventListener('touchmove', _preventDefault, { passive: false })
    document.body.style.overscrollBehaviorY = 'auto';
    document.body.style.touchAction = 'auto'
  }

  const hideSwipe = () => {
    swipeEle.style.zIndex = '-1'
    GameWrapper.style.display = 'block'
    document.removeEventListener('scroll', _scroll)
    document.body.addEventListener('touchmove', _preventDefault, { passive: false })
    document.body.style.overscrollBehaviorY = 'none';
    document.body.style.touchAction = 'none'
  }

  const _preventDefault = (e) => {
    e.preventDefault()
  }

  const _scroll = (e) => {
    console.log('onscroll', e.target.scrollingElement.scrollTop)
    if (e.target.scrollingElement.scrollTop > 50) {
      hideSwipe()
    }
  }

  if (isMobileDevice()) {
    GameWrapper.classList.add('mobile')
  } else {
    const viewMode = getViewMode();
    if (viewMode == "landscape") {
      GameWrapper.classList.add('desktop');
    } else if (viewMode == "portrait") {
      //   GameDiv.classList.add('gameDivP'); // 視情況增加 目前設定在 game.css 裡面
      GameWrapper.classList.add('desktopP');
      cc.view.setDesignResolutionSize(720, 1280, cc.ResolutionPolicy.SHOW_ALL);
    } else {
      GameWrapper.classList.add('desktop');
    }
  }
  if (isMobileDevice() && (!isIframe())&& (!isLiGu())) showSwipeTimeId = setTimeout(showSwipe, 10);

  const hideLogo = () => {
    if (cocosHasTakenOver) return
    cocosHasTakenOver = true
    bootTimeoutId && clearTimeout(bootTimeoutId)
    bootProgressTimerId && clearInterval(bootProgressTimerId)
    bootRecoveryTimerId && clearTimeout(bootRecoveryTimerId)

    const finishHandoff = () => {
      logoEle.style.display = 'none'
      loadingMsg.style.display = 'none'
    }

    // GameLoading calls this only after its Cocos loading view is ready. Waiting
    // for two paint frames prevents a black frame between the DOM splash and canvas.
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(finishHandoff))
    } else {
      setTimeout(finishHandoff, 50)
    }
  }
  window.hideLogo = hideLogo;

  const updatingLoadingMsg = (msg) => {
    const source = String(msg || '')
    if (source.includes('slotFramework')) {
      setLoadingMessage('正在準備遊戲介面…')
    } else if (source.includes('g1005') || source.includes('load bundle') || source.includes('assets/')) {
      setLoadingMessage('正在載入完整遊戲素材…')
    } else {
      setLoadingMessage('遊戲載入中…')
    }
  }
  window.updatingLoadingMsg = updatingLoadingMsg;

  const verifyOrientation = () => {
    const viewMode = getViewMode();

    const getShowViewMode = () => (
      (detectOrientation() && viewMode === 'portrait') ||
      (!detectOrientation() && viewMode === 'landscape')
    ) ? viewMode : null

    let orientationType = null
    let hasResize = false
    const updateOrientationUI = () => {
      const { os, platform, browserType } = cc.sys
      let debugMsg = ''
      // console.log("isMobile Device:::::::::::::::",isMobileDevice());
      // console.log("isWap :::::::::::::::",isWap());
      // console.log("isSafari :::::::::::::::",browserType === 'safari');
      // console.log("getShowViewMode :::::::::::::::",getShowViewMode());
      // console.log("detectOrientation ::::::::::::::",detectOrientation());
      console.log("updateOrientationUI")
      const aspectRatio = window.innerHeight / window.innerWidth
      if (isMobileDevice()) {
        if (!hasResize) {
          const event = new Event('resize');
          window.dispatchEvent(event)
          hasResize = true
          console.log('re resize');
          return
        }
        hasResize = false;

        if (detectOrientation()) {
          logoEle.children[0].style.width = '10%';
          if (aspectRatio < 9 / 16) {
          } else {
          }

        } else {
          logoEle.children[0].style.width = '20%'
          if (aspectRatio < 16 / 9) {
          } else {
          }
        }
      } else {
        let divOffsetTop = (window.innerHeight - GameWrapper.clientHeight) / -2;
        let divOffsetLeft = (window.innerWidth - GameWrapper.clientWidth) / -2;
        divOffsetLeft = divOffsetLeft > 0 ? 0 : divOffsetLeft;
        GameDiv.style.top = `${divOffsetTop}px`;
        GameDiv.style.left = `${divOffsetLeft}px`;

        let landScapeScale = 1;
        if (viewMode == "portrait") {
          /** 直式 先不另外設定 先吃系統預設的  */

          // cc.view.setDesignResolutionSize(720, 1280, cc.ResolutionPolicy.SHOW_ALL);
        } else {
          if (aspectRatio < 9 / 16) {
            landScapeScale = window.innerHeight / 720
          } else {
            landScapeScale = window.innerWidth / 1280
          }
          if (landScapeScale < 1) landScapeScale = 1;
          // cc.view.setDesignResolutionSize(1280 * landScapeScale, 720 * landScapeScale, cc.ResolutionPolicy.SHOW_ALL);
        }

      }


      // debugEle.textContent = debugMsg

      const orientation = (screen.orientation || {}).type || screen.mozOrientation || screen.msOrientation || window.orientation
      if (orientation === undefined) return
      if (orientationType === orientation) return
      orientationType = orientation


      if (isWap()) {
        // if (browserType === 'safari') {
        //   showSwipeTimeId && clearTimeout(showSwipeTimeId)
        //   showSwipeTimeId = setTimeout(showSwipe, 100);
        //   swipeContainer.style.height = '0%'
        // }
      }
    }

    let updateUITimeId = setTimeout(updateOrientationUI, 100)

    const setUpdateUITime = (content) => {
      if (isMobileDevice()) {
        // The Yachiyo shell embeds the game and owns the requested layout.  Its
        // fullscreen/PWA viewport may stay physically portrait while Cocos
        // renders the selected landscape scene, so the source black rotation
        // curtain must never cover an embedded game.
        orientationEle.style.display = !isIframe() && getShowViewMode() ? 'block' : 'none'
      }

      updateUITimeId && clearTimeout(updateUITimeId)
      updateUITimeId = setTimeout(updateOrientationUI, 500)
      if (!cocosHasTakenOver) {
        logoEle.style.display = 'block'
        loadingMsg.style.display = 'block'
      }

    }

    window.addEventListener('resize', setUpdateUITime)
    document.addEventListener('touchstart', function (e) { // 禁用多點觸控
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    });
    document.addEventListener('gesturestart', function (e) {
      e.preventDefault();
    });
  }

  verifyOrientation()
}

onload()
window.appStart = start
