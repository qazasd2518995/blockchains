// Warm the original first-screen artwork while Cocos is starting. The source
// build contains hundreds of small dependency requests, so waiting for the
// scene graph to discover every large texture creates several serial network
// waves on mobile. Fetching a small, orientation-specific hot set at low
// priority keeps the exact original files and lets Cocos reuse the HTTP cache.
const SETH2_BOOT_ASSET_ROOT = './assets/g1005/native/'
const SETH2_BOOT_ASSETS = {
  shared: [
    'f3/f312d335-f0f6-4041-a253-c15d2f12d777.png',
    '41/41353c8f-fd75-4c86-8fa1-f87567f3d3e5.png',
    'e0/e0fbe345-00c7-4fb7-af63-cbd3f28c2e6a.png',
    '34/3492fc7a-c5cf-4e62-9479-52142e05b838.png',
    '22/22520ae6-a95a-41f7-a813-f635b33d4427.png',
    'c4/c46d3524-b1b6-4d9d-a9a7-b2186d1622b1.png',
    'a8/a8a07507-a5d6-46ad-9bb2-e0a2bf0e47b0.png',
  ],
  portrait: [
    '89/892f4204-be10-4993-af1a-5652f3f5ba79.png',
    'e9/e9ec2734-64ac-41f6-a74f-91996a24fa1e.png',
    '62/629ec8d2-4bd6-49e6-bc1b-393a01ee2b5e.png',
    '40/4001ca46-5bf4-495a-a129-b460a79f2ebb.png',
    '20/2094f048-7895-44d7-a32d-89c9f63baef1.astc',
    'ae/aee673d7-6210-4fc7-8307-7b71b275c7b0.astc',
    'c7/c7d3635e-e242-4819-bf70-d7f835c908e6.png',
    '97/974d1347-ef12-4d9e-b4a3-5f69893d008b.png',
    '75/7525bb22-5c34-4ba9-b969-4f0ddf889d79.png',
    '8f/8f86dfae-8402-45bc-ae83-a6e024ebf55e.png',
    '3b/3bed4d74-13cb-4a2f-aa90-fa75bf162d1d.png',
    '6a/6ab67b38-82b9-4926-8a4f-abd73663e113.png',
    '2f/2f568a3b-f53b-40c4-8769-122ebcb70515.astc',
    'a0/a0fc5a3b-0c70-4e46-8661-d90908456f71.jpg',
    '5c/5c8504b6-5005-4bd1-9be7-013cbce699ae.png',
    '66/6698c8b7-ad6d-49a9-9f3d-53daece944fe.png',
  ],
  landscape: [
    '01/019f9c0d-392a-49c0-8c23-8b50d16b782c.png',
    'ab/abdb53b8-9191-4c17-ba24-446fab598ecc.jpg',
    'c8/c84889a3-9809-46ee-aaa2-55ec956b222a.jpg',
    'd3/d37ffe56-2fe6-4b40-81fb-7b823081746d.astc',
    '88/8827bb1d-38d4-4a7a-a053-c144880ec36d.astc',
    'e2/e2ea8be3-ad45-40dc-8fe2-fba27edc3309.astc',
    'ed/edc0377c-377e-47f3-afce-3bc5c0d637f2.mp3',
    'e9/e9e5fccd-29da-4c94-9c07-dd8f53e0290a.mp3',
    '54/547a76a4-1eb4-4b10-bc4c-bab567fdc75e.jpg',
    'b6/b621d350-971f-48eb-b688-e5af118a831c.astc',
    'e2/e263ef56-e4c1-4b79-aa38-e9f5f1cd28fa.mp3',
    'f5/f5a7cf05-4ca0-4721-86f7-8af304e364a3.mp3',
    'e4/e465019f-b53c-4505-93c7-1b3f3a053f2c.mp3',
    'e6/e6f24f08-d1a4-4ccc-ad02-a831fd5a5bab.mp3',
    'c4/c4880b43-e65e-4755-aeda-2313b34d33e8.png',
    '9e/9e350aad-88f6-4a3c-8ab2-d7dd5a601093.png',
    '51/51329bfb-b80c-49e4-a516-398c73d6fa3d.png',
    '6e/6ebe9268-ac6c-4348-bdd2-6674b4a98fce.png',
    '54/548e4d1f-4890-47fc-a4ef-83a16bef771c.png',
    'e7/e7067062-8191-4a2b-ab32-6918f43c56c5.mp3',
    'c3/c3c61c1d-ecc6-41cc-913e-6e1de146b7ed.mp3',
  ],
}

let seth2BootWarmupStarted = false
const warmSeth2BootAssets = () => {
  if (seth2BootWarmupStarted) return
  seth2BootWarmupStarted = true

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  const effectiveType = connection && connection.effectiveType ? connection.effectiveType : ''
  if ((connection && connection.saveData) || effectiveType === 'slow-2g' || effectiveType === '2g') {
    return
  }

  const params = new URL(window.location.href).searchParams
  const requestedMode = params.get('view_mode')
  const storageMode = localStorage.getItem(`${params.get('gn')}_view_mode`)
  const viewMode = requestedMode === 'portrait' || requestedMode === 'landscape'
    ? requestedMode
    : storageMode === 'portrait' || storageMode === 'landscape'
      ? storageMode
      : window.innerWidth < window.innerHeight ? 'portrait' : 'landscape'
  const assets = SETH2_BOOT_ASSETS.shared.concat(SETH2_BOOT_ASSETS[viewMode])
  const hardwareConcurrency = navigator.hardwareConcurrency || 4
  const workerCount = effectiveType === '3g' || hardwareConcurrency <= 4 ? 2 : 3
  let cursor = 0

  const worker = async () => {
    while (cursor < assets.length) {
      const asset = assets[cursor]
      cursor += 1
      try {
        await fetch(SETH2_BOOT_ASSET_ROOT + asset, {
          cache: 'force-cache',
          credentials: 'same-origin',
          priority: 'low',
        })
      } catch (_error) {
        // Cocos owns retries and user-facing recovery; warmup is best effort.
      }
    }
  }

  Promise.all(Array.from({ length: workerCount }, worker)).catch(() => undefined)
}

window.setTimeout(warmSeth2BootAssets, 250)

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
