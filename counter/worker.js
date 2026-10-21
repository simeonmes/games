// View counter for simeonmes.github.io/games, run as a free Cloudflare Worker.
// The site's own script (../site.js) talks to it, so ad-block lists don't know it.
// One Durable Object holds every count, so simultaneous views never overwrite each other.
//
//   GET  /s?path=…&vid=…&new=1   WebSocket. new=1 counts a view; the socket stays open
//                                while the page is open, which is how "on now" is counted.
//   POST /p                      Fallback when WebSockets fail: {"path": …, "vid": …}
//   GET  /summary                JSON: on now, today, all time.

import { DurableObject } from 'cloudflare:workers';

const LIVE_TIMEOUT_MS = 75 * 1000; // site.js pings every 30s; two missed pings = gone
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|node-fetch|go-http/i;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0], 'Vary': 'Origin' };
    const counter = env.COUNTER.get(env.COUNTER.idFromName('site'));

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST' } });
    }
    if (url.pathname === '/summary' && req.method === 'GET') {
      const res = await counter.fetch(req);
      return new Response(res.body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/s' || url.pathname === '/p') {
      // Browsers always send Origin on these, so this keeps other sites from adding views.
      if (!allowed.includes(origin)) return new Response('forbidden', { status: 403 });
      if (BOT_UA.test(req.headers.get('User-Agent') || '')) return new Response(null, { status: 204, headers: cors });
      const res = await counter.fetch(req);
      return res.webSocket ? res : new Response(res.body, { status: res.status, headers: cors });
    }
    return new Response('not found', { status: 404 });
  }
};

function cleanPath(p) {
  p = String(p || '/').split(/[?#]/)[0].replace(/index\.html$/, '');
  return p.startsWith('/') ? p.slice(0, 200) : '/';
}

function cleanVid(v) {
  return /^[a-z0-9]{8,40}$/.test(v || '') ? v : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export class Counter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS views (day TEXT NOT NULL, path TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, path));
      CREATE TABLE IF NOT EXISTS day_visitors (day TEXT NOT NULL, vid TEXT NOT NULL, PRIMARY KEY (day, vid));
      CREATE TABLE IF NOT EXISTS visitors (vid TEXT PRIMARY KEY);
    `);
    // Pings are answered without waking this object; the timestamp shows the page is still there.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  record(path, vid) {
    const day = today();
    this.sql.exec('INSERT INTO views VALUES (?, ?, 1) ON CONFLICT (day, path) DO UPDATE SET n = n + 1', day, path);
    if (vid) {
      this.sql.exec('INSERT OR IGNORE INTO day_visitors VALUES (?, ?)', day, vid);
      this.sql.exec('INSERT OR IGNORE INTO visitors VALUES (?)', vid);
    }
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/s') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const path = cleanPath(url.searchParams.get('path'));
      if (url.searchParams.get('new') === '1') this.record(path, cleanVid(url.searchParams.get('vid')));
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ path, since: Date.now() });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/p') {
      let body = {};
      try { body = JSON.parse(await req.text()); } catch (e) {}
      this.record(cleanPath(body.path), cleanVid(body.vid));
      return new Response('ok');
    }

    return Response.json(this.summary());
  }

  summary() {
    const now = Date.now();
    const live = {};
    let liveTotal = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const { path, since } = ws.deserializeAttachment() || {};
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      const lastSeen = Math.max(since || 0, pinged ? pinged.getTime() : 0);
      if (ws.readyState !== WebSocket.OPEN || now - lastSeen > LIVE_TIMEOUT_MS) continue;
      live[path] = (live[path] || 0) + 1;
      liveTotal++;
    }

    const day = today();
    const rows = (sql, ...args) => this.sql.exec(sql, ...args).toArray();
    const byPath = list => Object.fromEntries(list.map(r => [r.path, r.n]));
    const one = (sql, ...args) => rows(sql, ...args)[0].n || 0;

    return {
      live: { total: liveTotal, pages: live },
      today: {
        date: day,
        views: one('SELECT SUM(n) AS n FROM views WHERE day = ?', day),
        visitors: one('SELECT COUNT(*) AS n FROM day_visitors WHERE day = ?', day),
        pages: byPath(rows('SELECT path, n FROM views WHERE day = ? ORDER BY n DESC', day))
      },
      allTime: {
        since: rows('SELECT MIN(day) AS d FROM views')[0].d,
        views: one('SELECT SUM(n) AS n FROM views'),
        visitors: one('SELECT COUNT(*) AS n FROM visitors'),
        pages: byPath(rows('SELECT path, SUM(n) AS n FROM views GROUP BY path ORDER BY n DESC'))
      },
      days: rows('SELECT day, SUM(n) AS views FROM views GROUP BY day ORDER BY day DESC LIMIT 60')
    };
  }

  webSocketMessage() {}

  webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch (e) {}
  }
}
