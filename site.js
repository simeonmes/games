// Counts this page view and keeps a connection open while the page is open, so the
// views page can show who is on right now. It talks to our own Cloudflare Worker
// (see counter/), which ad-block lists don't know about.
(function () {
  var SERVER = 'games-live.YOUR-SUBDOMAIN.workers.dev';
  if (SERVER.indexOf('YOUR-SUBDOMAIN') !== -1) return;

  var path = location.pathname.replace(/index\.html$/, '');
  var vid;
  try {
    vid = localStorage.getItem('site-vid');
    if (!vid) localStorage.setItem('site-vid', vid = newId());
  } catch (e) {
    vid = newId();
  }

  var counted = false, leaving = false, ws = null, pingTimer = 0, retries = 0;

  function newId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // Used only if WebSockets can't connect at all, so the view still counts.
  function countWithoutSocket() {
    if (counted) return;
    counted = true;
    var body = JSON.stringify({ path: path, vid: vid });
    var url = 'https://' + SERVER + '/p';
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, body))) {
      fetch(url, { method: 'POST', body: body, keepalive: true }).catch(function () {});
    }
  }

  function connect() {
    if (ws) return;
    var opened = false;
    try {
      ws = new WebSocket('wss://' + SERVER + '/s?path=' + encodeURIComponent(path) + '&vid=' + vid + (counted ? '' : '&new=1'));
    } catch (e) {
      ws = null;
      return countWithoutSocket();
    }
    ws.onopen = function () {
      opened = counted = true;
      retries = 0;
      pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('ping'); }, 30000);
    };
    ws.onclose = function () {
      clearInterval(pingTimer);
      ws = null;
      if (!opened && !counted) return countWithoutSocket();
      if (counted && !leaving && document.visibilityState === 'visible') {
        setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retries++)));
      }
    };
  }

  // Phones drop sockets in the background; reconnect (without counting a new view) on return.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') connect();
  });
  addEventListener('pageshow', function (e) { leaving = false; if (e.persisted) connect(); });
  addEventListener('pagehide', function () { leaving = true; if (ws) ws.close(); });

  connect();
})();
