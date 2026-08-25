var gameCommonPath = getGameCommonPath(); // { return "@Slot_CDN_Root/common"; }
var helpPath = getHelpPath();// { return "@Slot_CDN_Root/help/@Model.gameDir"; }
var gameContentPath = getContentPath(); // { return "@Slot_CDN_Root/content/@Model.gameDir"; }
var LoginJSON;
// --- for 漁機用 ---
var FishSettingJSON;
// --- for 漁機用 ---
var dir = "";
var maxNum = 100;
var minNum = 0;
var manifestList = [];
/**
 * User : 舊Server開發的舊30款遊戲
 * SlotUser : 新Server開發的Slot Game
 * CascadingUser : 新Server開發的消除類遊戲
 */
var loginUser = "";
//先取得網址字串，假設此頁網址為「index.aspx?id=U001&name=GQSM」
var Loadingurl = location.href;
//再來用去尋找網址列中是否有資料傳遞(QueryString)
if (Loadingurl.indexOf('?') != -1) {
	//在此直接將各自的參數資料切割放進ary中
	var ary = Loadingurl.split('?')[1].split('&');
	//console.log(ary);
	//下迴圈去搜尋每個資料參數
	dir = ary[0].split('=')[1];
	loginUser = ary[1].split('=')[1];
	/* 	for (i = 0; i <= ary.length - 1; i++) {
			//如果資料名稱為id的話那就把他取出來
			if (ary[i].split('=')[0] = 'dir'){
			dir = ary[i].split('=')[1];
			console.log(ary[i].split('=')[1]);}
			else if (ary[i].split('=')[0] = 'login'){
				login = ary[i].split('=')[1];    
				console.log("a");
			}
		}
	 */
}

function colletparams( name ) {
	name = name.replace(/([\[\]])/g,"\\\$1");
	var regex = new RegExp("[\\?&]"+name+"=([^&#]*)"),
		results = regex.exec( window.location.href );
	return results? results[1]:"";
}

/**
 * 下載js and css 
 * @param {string} filename  檔案位置含名稱
 * @param {string} filetype  js or css
 * @returns {Promise}  resolve(string) ; reject(string)
 */
function loadJsCssFile(filename, filetype) {
	return new Promise(function (resolve, reject) {
		if (filetype == "js") { 
			var fileref = document.createElement('script')
			fileref.setAttribute("type", "text/javascript")
			fileref.setAttribute("src", filename)
		}
		else if (filetype == "css") { 
			var fileref = document.createElement("link")
			fileref.setAttribute("rel", "stylesheet")
			fileref.setAttribute("type", "text/css")
			fileref.setAttribute("href", filename)
		}
		fileref.onload = function () {
			resolve(filename);
		}
		fileref.onerror = function () {
			reject(filename);
		}
		document.getElementsByTagName('head')[0].appendChild(fileref);
	});
}

/**
 * 下載相關的js and css
 * cssArray 和 scriptsArray 會依照順序下載，所以請依優先性自行排序
 * @returns {Promise}
 */
var loadScriptsPromise = function () {
	return new Promise(function (resolve, reject) {

		var cssArray = [
			'ui/styles/global.css'
		];
		var scriptsArray = [
			, 'ui/js/orientation.js'
			, 'ui/js/initGame-cocos.js'
		];
		var initGameJs = ''//gameCommonPath + '/' + 'ui/js/initGame.js';
		var gameScriptsArray = [];

		var loadCount = scriptsArray.length + cssArray.length + gameScriptsArray.length + manifestList.length;
		// 下載失敗清單
		var loadFailArray = [];

		// 整理資源路徑
		cssArray.forEach(function (item, index) {
			cssArray[index] = gameCommonPath + '/' + item;
		})
		scriptsArray.forEach(function (item, index) {
			scriptsArray[index] = gameCommonPath + '/' + item;
		})
		gameScriptsArray.forEach(function (item, index) {
			gameScriptsArray[index] = gameContentPath + '/' + item;
		})
		manifestList.forEach(function (item, index) {
			manifestList[index] = gameContentPath + '/' + item;
		})

		// sequence download js and css file  
		var scriptsPromise = Promise.resolve();
		// var loadArray = cssArray.concat(scriptsArray).concat(gameScriptsArray).concat(manifestList);
		var loadArray = manifestList.concat(cssArray).concat(scriptsArray).concat(gameScriptsArray);
		loadArray.forEach(function (fileName , index) {
			scriptsPromise = scriptsPromise
				.then(function () {
					if (index == 0) {
						return loadJsCssFile(fileName, fileName.slice(fileName.lastIndexOf('.') + 1))
							.then(function (successFileName) {
								// console.log('loadScriptsPromise : fileName:' + successFileName);
								checkLoadFinish();
							}, function (errorFileName) {
								loadFailArray.push(errorFileName);
								checkLoadFinish();
							});
					} else {
						loadJsCssFile(fileName, fileName.slice(fileName.lastIndexOf('.') + 1))
							.then(function (successFileName) {
								// console.log('loadScriptsPromise : fileName:' + successFileName);
								checkLoadFinish();
							}, function (errorFileName) {
								loadFailArray.push(errorFileName);
								checkLoadFinish();
							});
					}
				});
		});

		// 檢查是否全部下載完畢
		function checkLoadFinish() {
			loadCount--;
			if (loadCount == 0 && (loadFailArray.length > 0)) {
				// 輸出所有下載失敗的檔案
				reject(Array.from(loadFailArray, function (value, k) { return value += (value + "\n"); }).toString()); 
			} else if (loadCount == 0) {
				// resolve(true);
				loadJsCssFile(initGameJs, initGameJs.slice(initGameJs.lastIndexOf('.') + 1))
					.then(function (successFileName) {
						resolve(true);
					}, function (errorFileName) { 
						console.log('initGameJs download fail.')
					});
			}
		}
	});
}

/**
 * 顯示PreView
 */
function showPreView() {
	if (document.querySelector('.preview'))
		document.querySelector('.preview').style.display = 'flex';
}

/**
 * 關閉PreView
 */
function hidePreView() {
	if (document.querySelector('.preview'))
		document.querySelector('.preview').style.display = 'none';
}


/**
 * interface UserInfo 
        online: string;
        account: string;
        webid: string;
        lang: string;
        server: string;
        port: string;
        dir: string;
        Extra: Extra;
        
        自訂參數
        連線GameServer使用(socket 連線位置)
        因為在外部jsStart會額外處理遊戲連線位置
        ex : ws://192.168.30.222:7777/SlotUser
        gameServer : string ;
*/
// var LoginJSON;
/**
 * 取得登入者資訊
 * @param {function} callback - callback data is UserInfo , fail data is null
 * @param {} gameid game id
 */
function getUserInfo(callback , gameid) {
	ui_hidden = false;
	var maxNum = 100;
	var minNum = 0;
	var n = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
	var request = new XMLHttpRequest();
	// GameID
	var gameIdParam = "";
	if (gameid != undefined) {
		gameIdParam = "&gameid=" + gameid;
	} else {
		gameIdParam = "";
	}

	// ----- download userinfo -----
	var sessionKey = sessionStorage.getItem("GameWebSession2");
	request.open("GET", "SessionInfo?t=2&k=" + sessionKey + "&r=" + Math.random() + gameIdParam);


	request.send();
	request.onreadystatechange = function () {
		// 伺服器請求完成
		if (request.readyState === 4) {
			// 伺服器回應成功
			if (request.status === 200) {

				/*
					old use : type.indexOf("application/json") === 0 , 判斷回應類型(JSON)
					var type = request.getResponseHeader("Content-Type"); // 取得回應類型
					new use : 拿內容做解析
				*/
				try {
					LoginJSON = JSON.parse(request.responseText);
					if (!!LoginJSON['error']) {
						// 收到session異常
						if (callback) {
							callback(LoginJSON);
						}
						return;
					}
					// LoginJSON.dir參數是Server轉址用，有值時帶/
					var server = ''
					if (LoginJSON.port == '80') {
						server = 'ws://' + LoginJSON.server + LoginJSON.dir;
					} else if (LoginJSON.port == '443') {
						server = 'wss://' + LoginJSON.server + LoginJSON.dir;
					} else {
						server = 'ws://' + LoginJSON.server + ':' + LoginJSON.port + LoginJSON.dir;
					}

					loginUser = colletparams('wspath');
					server = server + '/' + loginUser;
					LoginJSON.gameServer = server;

					// 提供給後台使用 - 後台會針對SystemCode或Company做例外功能處理
					// setCompanySubSystem function 實現於index.html
					if (typeof setCompanySubSystem != 'undefined' && typeof setCompanySubSystem == 'function') {
						setCompanySubSystem(LoginJSON.Extra.Company, LoginJSON.Extra.SystemCode);
					}
					// gameWebSiteUrl 參數 定義於index.html，用於處理轉址功能
					if (typeof gameWebSiteUrl != 'undefined' && typeof (LoginJSON.Extra.ExitAction) == 'string') {
						gameWebSiteUrl = LoginJSON.Extra.ExitAction;
					}

					if(LoginJSON.Extra.Mode==4){
						isHistoryEnabled = true;
					}

					if (callback) {
						callback(LoginJSON);
					}
				} catch (e) {
					console.error(e)
				}
				// resolve(LoginJSON);
			} else {
				// alert("HttpRequest unknow error : " + request.status);
				// -101 : 資料取得異常
				if (callback)
					callback({ "error": "-101" });

			}
		}
	};
}


/**
 * 取得漁機設定
 * {"FishDenom":"[[0.1,1.0],[1.0,10.0],[10.0,100.0]]","CurrencyName":"NT","ExitAction":"http://192.168.30.242:168/QAlogin","PlayerName":"1903029201","Language":"zh-TW","Mode":4,"HomeIsEnabled":true,"GameNameTitle":"福娃捕魚 - ","FullScreenIsEnabled":true,"EnableEventSystem":false,"EnableHistoryButton":true,"ShowHistoryType":0}
 * @param {*} callback 
 */
function getFishSetting(callback) {
	ui_hidden = false;
	var maxNum = 100;
	var minNum = 0;
	var n = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
	var request = new XMLHttpRequest();

	// ----- download userinfo -----
	var sessionKey = sessionStorage.getItem("GameWebSession2");
	request.open("GET", "SessionInfo?t=1004&k=" + sessionKey + "&r=" + Math.random());


	request.send();
	request.onreadystatechange = function () {
		// 伺服器請求完成
		if (request.readyState === 4) {
			// 伺服器回應成功
			if (request.status === 200) {

				/*
					old use : type.indexOf("application/json") === 0 , 判斷回應類型(JSON)
					var type = request.getResponseHeader("Content-Type"); // 取得回應類型
					new use : 拿內容做解析
				*/
				try {
					FishSettingJSON = JSON.parse(request.responseText);
					if (!!FishSettingJSON['error']) {
						// 收到session異常
						if (callback) {
							callback(FishSettingJSON);
						}
						return;
					}

					// gameWebSiteUrl 參數 定義於index.html，用於處理轉址功能 <保留>
					if (typeof gameWebSiteUrl != 'undefined' && typeof (FishSettingJSON.ExitAction) == 'string') {
						gameWebSiteUrl = FishSettingJSON.ExitAction;
					}

					// if(FishSettingJSON.Extra.Mode==4){
					// 	isHistoryEnabled = true;
					// }

					if (callback) {
						callback(FishSettingJSON);
					}
				} catch (e) {
					console.error(e)
				}
			} else {
				// alert("HttpRequest unknow error : " + request.status);
				// -101 : 資料取得異常
				if (callback)
					callback({ "error": "-101" });
			}
		}
	};
}

/**
 * 取得漁機登入者資訊
 * @param {function} callback - fail data is null , if not callback data is
 * 	{"online":"1","account":"1903029201","webid":"GMS2","lang":"zh-TW","server":"192.168.30.242","port":"20300","dir":"","Extra":{"SystemCode":"H1","Company":"Royal","Device":"web","GameTokenId":"8c655033baad46d09c1d6d119f3611a41719820080248","Mode":4,"SingleCredit":"true","HomeIsEnabled":true,"ShowAmountType":0}}
 * @param {} gameid game id
 * @param {*} level	選擇房間等級 1 ~ 3
 */
function getUserInfoForFish(callback , gameid , level) {
	ui_hidden = false;
	var maxNum = 100;
	var minNum = 0;
	var n = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
	var request = new XMLHttpRequest();
	// GameID
	var gameIdParam = "";
	if (gameid != undefined) {
		gameIdParam = "&gid=" + gameid;
	} else {
		gameIdParam = "";
	}

	// ----- download userinfo -----
	var sessionKey = sessionStorage.getItem("GameWebSession2");
	request.open("GET", "SessionInfo?t=4&k=" + sessionKey + "&level=" + level + "&r=" + Math.random() + gameIdParam);


	request.send();
	request.onreadystatechange = function () {
		// 伺服器請求完成
		if (request.readyState === 4) {
			// 伺服器回應成功
			if (request.status === 200) {

				/*
					old use : type.indexOf("application/json") === 0 , 判斷回應類型(JSON)
					var type = request.getResponseHeader("Content-Type"); // 取得回應類型
					new use : 拿內容做解析
				*/
				try {
					LoginJSON = JSON.parse(request.responseText);
					if (!!LoginJSON['error']) {
						// 收到session異常
						if (callback) {
							callback(LoginJSON);
						}
						return;
					}
					// LoginJSON.dir參數是Server轉址用，有值時帶/
					var server = ''
					if (LoginJSON.port == '80') {
						server = 'ws://' + LoginJSON.server + ':' + LoginJSON.port + LoginJSON.dir;
					} else if (LoginJSON.port == '443') {
						server = 'wss://' + LoginJSON.server + LoginJSON.dir;
					} else {
						server = 'ws://' + LoginJSON.server + ':' + LoginJSON.port + LoginJSON.dir;
					}

					loginUser = colletparams('wspath');
					server = server + '/' + loginUser;
					LoginJSON.gameServer = server;


					if(LoginJSON.Extra.Mode==4){
						isHistoryEnabled = true;
					}

					if (callback) {
						callback(LoginJSON);
					}
				} catch (e) {
					console.error(e)
				}


				// resolve(LoginJSON);
			} else {
				// alert("HttpRequest unknow error : " + request.status);
				// -101 : 資料取得異常
				if (callback)
					callback({ "error": "-101" });
			}
		}
	};
}


// 5PK Session
/**
 * Get 5PK Session info using XMLHttpRequest for older environment compatibility.
 * This function supports two modes:
 *  - async call (default): returns a Promise that resolves to the session object,
 *  - sync call (pass true to second param): returns the object directly (synchronous), for legacy behavior.
 *
 * @param {boolean} [sync=true] If true, perform a synchronous XHR and return the object directly (default true).
 * @returns {Promise<Object>|Object} Resolves to a session object (or { error: '-101' }) when called without sync, otherwise returns object directly.
 */
function GetSessionInfoFor5PK(sync) {
	if (typeof sync === 'undefined') sync = true; // default to sync for legacy behavior
	var session = sessionStorage.getItem("GameWebSession2");
	var sessionObj = {};
	var wsServer = "";
	var url = "/Web/Sessioninfo?t=2&k=" + session;

	// Synchronous path (legacy behavior) -> WARNING: synchronous XHR on main thread is deprecated in many environments
	if (sync === true) {
		// if (console && console.warn) {
		// 	console.warn('GetSessionInfoFor5PK: using synchronous XHR (sync=true). This is deprecated and may block the UI. Consider switching to async usage: GetSessionInfoFor5PK(false).');
		// }
		try {
			var xhr = new XMLHttpRequest();
			xhr.open('GET', url, false); // synchronous
			xhr.send(null);

			if (xhr.status === 200) {
				try {
					var data = JSON.parse(xhr.responseText);
					if (data.port == "443")
						wsServer = "wss://" + data.server + wsPath;
					else if (data.port == "80")
						wsServer = "ws://" + data.server + wsPath;
					else
						wsServer = "ws://" + data.server + ":" + data.port + wsPath;

					sessionObj.language = data.lang;
					sessionObj.userToken = (data.Extra && data.Extra.GameTokenId) ? data.Extra.GameTokenId : undefined;
					sessionObj.serverAddress = wsServer;
					return sessionObj;
				} catch (e) {
					console.log('JSON parse error:', e);
					return { "error": "-101" };
				}
			} else {
				if (xhr.status === 500) {
					console.log("Internal Server Error: " + xhr.responseText);
				} else if (xhr.status === 404) {
					console.log("Not Found: " + xhr.responseText);
				} else {
					console.log("XHR Error: " + xhr.status + " " + xhr.statusText);
				}
				return { "error": "-101" };
			}
		} catch (e) {
			console.log('XHR Error:', e);
			return { "error": "-101" };
		}
	}

	// Async path -> returns a Promise
	return new Promise(function (resolve) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.onreadystatechange = function () {
			if (xhr.readyState !== 4) return;
			if (xhr.status === 200) {
				try {
					var data = JSON.parse(xhr.responseText);
					if (data.port == "443")
						wsServer = "wss://" + data.server + wsPath;
					else if (data.port == "80")
						wsServer = "ws://" + data.server + wsPath;
					else
						wsServer = "ws://" + data.server + ":" + data.port + wsPath;

					sessionObj.language = data.lang;
					sessionObj.userToken = (data.Extra && data.Extra.GameTokenId) ? data.Extra.GameTokenId : undefined;
					sessionObj.serverAddress = wsServer;
					resolve(sessionObj);
				} catch (e) {
					console.log('JSON parse error:', e);
					resolve({ "error": "-101" });
				}
			} else {
				if (xhr.status === 500) {
					console.log("Internal Server Error: " + xhr.responseText);
				} else if (xhr.status === 404) {
					console.log("Not Found: " + xhr.responseText);
				} else {
					console.log("XHR Error: " + xhr.status + " " + xhr.statusText);
				}
				resolve({ "error": "-101" });
			}
		};
		xhr.onerror = function (err) {
			console.log('XHR network error:', err);
			resolve({ "error": "-101" });
		};
		xhr.send(null);
	});
}

// 開始下載
loadScriptsPromise();

/**
 * 顯示版本號
 */
function showVersion() {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', gameCommonPath+'/version.json', true);
	xhr.addEventListener("load", function () {
		var versionObj = { version: 'n', sha: 'n' };
		try {
			versionObj = JSON.parse(xhr.response);
		} catch (error) {

		} finally {
			console.log('WebUI3 version : ' + versionObj.version);
			console.log('WebUI3 sha : ' + versionObj.sha);
		}
	});
	xhr.send(null);
} // showVersion
showVersion();

function getMeasurementID() {
	return 'G-50N57PPD9J';
}
function getSecretKey() {
	return 'TLl2bM7KT_eIvOzP9Y-6Gg';
}

window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', getMeasurementID());
window.addEventListener('load', function () {
    var script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id='+getMeasurementID();
    document.body.appendChild(script);
});