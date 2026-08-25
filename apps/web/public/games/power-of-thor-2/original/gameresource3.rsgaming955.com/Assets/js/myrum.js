var CF_Trace="";
var SizeLog="";
var NetLog="";

function sendRUM(type){
    var wsStatus=-1;
    try{
        wsStatus=Factory.ClassFactory.webSocket.sock.socket.socket.readyState;
    }catch(e){
        wsStatus=-2;
    }
    var jsStatus="";
    try{
        jsStatus=encodeURIComponent(utils.LogUtils.getLog());
    }catch(e){
        jsStatus="";
    }
    var xmlhttp = new XMLHttpRequest();
    var url = "/Telemetry/RUM?t=" + type + "&k="+sessionStorage.getItem("GameWebSession2");

    xmlhttp.onreadystatechange = function() {
        if(xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            console.log(xmlhttp.responseText);
        }
    }
    xmlhttp.open("POST",url);
    xmlhttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xmlhttp.send("rt="+encodeURIComponent(JSON.stringify(BOOMR.plugins.ResourceTiming.getCompressedResourceTiming().restiming))+
        "&cf="+encodeURIComponent(btoa(CF_Trace))+"&size="+encodeURIComponent(JSON.stringify(SizeLog))+"&ws="+wsStatus+"&js="+jsStatus+"&net="+encodeURIComponent(NetLog));
}
const unloadRUM=function (){sendRUM("unload")};
window.setTimeout(function (){sendRUM("timer")},1000*90);
window.addEventListener("beforeunload",unloadRUM);
window.setTimeout(function (){window.removeEventListener("beforeunload",unloadRUM)},1000*120);

var logNetCount=0;
function logNet(){
    logNetCount++;
    if(logNetCount>10){
        clearInterval(logNetTimer)
    }
    try {
        var tmp = {
            "dl": navigator.connection.downlink,
            "dlm": navigator.connection.downlinkMax,
            "ef": navigator.connection.effectiveType,
            "rtt": navigator.connection.rtt,
            "save": navigator.connection.saveData,
            "t": navigator.connection.type
        }
        NetLog = NetLog + JSON.stringify(tmp) + "|"
    }catch (e){}
}
var logNetTimer = window.setInterval(function (){logNet()},1000*10);
logNet();

function sendWSmeter(){
    if(typeof(durationLog)==="undefined"){
        return;
    }
    if(durationLog.length==0){
        return;
    }

    var MeterData=durationLog;
    durationLog="";
    var xmlhttp = new XMLHttpRequest();
    var url = "/Telemetry/WSMeter?k="+sessionStorage.getItem("GameWebSession2");

    xmlhttp.onreadystatechange = function() {
        if(xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            console.log(xmlhttp.responseText);
        }
    }
    xmlhttp.open("POST",url);
    xmlhttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xmlhttp.send("rt="+encodeURIComponent(MeterData));
}
window.setInterval(function (){sendWSmeter()},1000*30);


function getCFInfo(){
    var xmlhttp = new XMLHttpRequest();
    var url = "/cdn-cgi/trace";

    xmlhttp.onreadystatechange = function() {
        if(xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            CF_Trace=xmlhttp.responseText;
            //console.log(xmlhttp.responseText);
        }
    }
    xmlhttp.open("GET",url);
    xmlhttp.send();
}

function SendFrontLog(){
    if(typeof(localStorage)==="undefined"){
        return;
    }
    var lastLog = localStorage.getItem("ClientWsClsLog");
    var imageLog = localStorage.getItem("ClientPicLog");
    if(null != lastLog && lastLog.length>0){
        var xmlhttp = new XMLHttpRequest();
        var url = "/Telemetry/FrontLog";
        xmlhttp.onreadystatechange = function() {
            if(xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                localStorage.removeItem("ClientWsClsLog");
                localStorage.removeItem("ClientPicLog");
            }
        }

        var postImage="";
        if(null != imageLog && imageLog.length>0){
            postImage="&clsImg="+encodeURIComponent(imageLog);
        }

        xmlhttp.open("POST",url);
        xmlhttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xmlhttp.send("clsLog="+encodeURIComponent(lastLog)+postImage);
    }
}

window.setTimeout(function (){getCFInfo();GetSizeLog();},1000*3);

function GetSizeLog() {
    var contentWidth = [...document.body.children].reduce(
            function(a, el) { return Math.max(a, el.getBoundingClientRect().right) }, 0)
        - document.body.getBoundingClientRect().x;

    SizeLog = {
        windowWidth:  document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
        pageWidth:    Math.min(document.body.scrollWidth, contentWidth),
        pageHeight:   document.body.scrollHeight,
        screenWidth:  window.screen.width,
        screenHeight: window.screen.height,
        pageX:        document.body.getBoundingClientRect().x,
        pageY:        document.body.getBoundingClientRect().y,
        screenX:     -window.screenX,
        screenY:     -window.screenY - (window.outerHeight-window.innerHeight),
        outerHeight: window.outerHeight,
        innerHeight: window.innerHeight,
    }
}

function writeLogRecord(gameLog){
    var xmlhttp = new XMLHttpRequest();
    var url = "/Telemetry/GameLog";
    xmlhttp.onreadystatechange = function() {
        if(xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            console.log("sendlog")
        }
    }

    var token="k="+sessionStorage.getItem("GameWebSession2");

    xmlhttp.open("POST",url);
    xmlhttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xmlhttp.send(token+"&gameLog="+encodeURIComponent(gameLog));
}
