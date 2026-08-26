(function bootstrapThor2RuntimeCompat(global) {
  'use strict';

  function detectIOSVersion(userAgent, isIPadDevice) {
    var source = String(userAgent || '');
    var isIOSDevice = /iPhone|iPod|iPad/i.test(source) || Boolean(isIPadDevice);

    // The archived fullscreen helper calls getIOSVersion() for every mobile
    // browser, including Android. A high neutral value keeps Android out of
    // every iOS-only version workaround.
    if (!isIOSDevice) return Number.POSITIVE_INFINITY;

    var match = source.match(/(?:CPU(?: iPhone)? OS|iPhone OS|OS) (\d+)(?:[_.](\d+))?/i);
    if (!match) match = source.match(/Version\/(\d+)(?:\.(\d+))?/i);
    if (!match) return Number.POSITIVE_INFINITY;

    var major = Number(match[1]);
    var minorText = match[2] || '0';
    var minor = Number(minorText) / Math.pow(10, minorText.length);
    return Number.isFinite(major) ? major + minor : Number.POSITIVE_INFINITY;
  }

  if (typeof global.getIOSVersion !== 'function') {
    global.getIOSVersion = function getIOSVersion() {
      return detectIOSVersion(
        global.navigator && global.navigator.userAgent,
        global.isIPad,
      );
    };
  }

  global.__QmoneyThor2RuntimeCompatTest = {
    detectIOSVersion: detectIOSVersion,
  };
})(window);
