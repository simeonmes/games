"use strict";
// Peer-to-peer rooms. The host's browser runs SquintHost; everyone else connects to it with a
// six-digit code. PeerJS's free public server only introduces the browsers to each other.
// Add ?peer=host:port to the address to use a self-run PeerJS server (for local testing).

const Net = (() => {
  const PREFIX = "squint-room-", PROTO = 1;
  let peer = null, role = null, me = null, hostConn = null, host = null, tickTimer = 0, joinTimer = 0;
  let handlers = {}, leaving = false, code = "";
  const conns = new Map();

  const urlParam = k => new URLSearchParams(location.search).get(k);
  function peerOpts() {
    const q = urlParam("peer");
    if (q) { const [h, port] = q.split(":"); return { host: h, port: +port || 9000, path: "/", secure: false, debug: 0 }; }
    return { debug: 0 };
  }
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "../krillion/js/vendor/peerjs.min.js?v=1";
      s.onload = ok;
      s.onerror = () => fail(new Error("load"));
      document.head.appendChild(s);
    });
  }
  function inviteLink() {
    const extra = urlParam("peer") ? `&peer=${encodeURIComponent(urlParam("peer"))}` : "";
    return `${location.origin}${location.pathname}?room=${code}${extra}`;
  }
  function errText(err) {
    const t = err && err.type;
    if (t === "peer-unavailable") return `There's no room ${code}. Check the code and try again.`;
    if (t === "browser-incompatible") return "This browser can't make peer-to-peer connections. Try Chrome, Edge, Firefox or Safari.";
    if (["network", "server-error", "socket-error", "socket-closed"].includes(t)) return "Couldn't reach the matchmaking server. Check your internet connection and try again.";
    if (err && err.message === "load") return "Couldn't load the multiplayer code. Refresh the page and try again.";
    return "Something went wrong connecting. Try again.";
  }

  const toSelf = m => queueMicrotask(() => handlers.message && handlers.message(m));
  function out(id, m) {
    if (id === me) return toSelf(m);
    const c = conns.get(id);
    if (!c || !c.open) return;
    c.send(m);
    if (m.t === "bye") { conns.delete(id); setTimeout(() => { try { c.close(); } catch (e) {} }, 600); }
  }

  function hostConnection(c) {
    c.on("data", m => {
      if (!host || !m || typeof m !== "object") return;
      if (m.t === "hello") {
        if (m.v !== PROTO) { c.send({ t: "bye", msg: "Your game is out of date. Refresh the page and try again." }); return; }
        if (conns.has(c.peer)) return;
        conns.set(c.peer, c);
        if (!host.addPlayer(c.peer, m.name, m.av)) { conns.delete(c.peer); setTimeout(() => { try { c.close(); } catch (e) {} }, 600); }
      } else if (conns.get(c.peer) === c) host.receive(c.peer, m);
    });
    const drop = () => { if (conns.get(c.peer) === c) conns.delete(c.peer); if (host) host.removePlayer(c.peer); };
    c.on("close", drop);
    c.on("error", drop);
  }

  async function create(profile, h) {
    handlers = h;
    leaving = false;
    try { await loadPeer(); } catch (e) { throw new Error(errText(e)); }
    for (let attempt = 0; attempt < 6; attempt++) {
      code = String(Math.floor(100000 + Math.random() * 900000));
      try {
        await new Promise((ok, fail) => {
          const p = new Peer(PREFIX + code, peerOpts());
          p.on("open", id => {
            peer = p; role = "host"; me = id;
            host = SquintHost.create({ out, words: WORDS });
            p.on("connection", hostConnection);
            host.addPlayer(me, profile.name, profile.av);
            tickTimer = setInterval(() => host && host.tick(), 200);
            ok();
          });
          p.on("error", err => {
            if (peer !== p) { p.destroy(); fail(err); return; }
            if (err.type === "peer-unavailable") return;
            handlers.notice && handlers.notice("Connection trouble. Your room is still open.");
          });
          p.on("disconnected", () => { if (peer === p && !p.destroyed && !leaving) p.reconnect(); });
        });
        history.replaceState(null, "", inviteLink());
        return code;
      } catch (err) {
        if (err.type !== "unavailable-id") throw new Error(errText(err));
      }
    }
    throw new Error("Couldn't make a room code. Try again.");
  }

  async function join(c, profile, h) {
    handlers = h;
    leaving = false;
    code = c;
    try { await loadPeer(); } catch (e) { throw new Error(errText(e)); }
    return new Promise((ok, fail) => {
      const p = new Peer(peerOpts());
      peer = p;
      joinTimer = setTimeout(() => { if (role !== "guest") { cleanup(); fail(new Error(`Couldn't connect to room ${c}. Check the code and try again.`)); } }, 15000);
      p.on("open", () => {
        const conn = p.connect(PREFIX + c, { reliable: true });
        hostConn = conn;
        conn.on("open", () => {
          clearTimeout(joinTimer);
          role = "guest"; me = p.id;
          conn.send({ t: "hello", v: PROTO, name: profile.name, av: profile.av });
          history.replaceState(null, "", inviteLink());
          ok(code);
        });
        conn.on("data", m => handlers.message && handlers.message(m));
        const gone = () => {
          if (leaving || role !== "guest") return;
          cleanup();
          handlers.closed && handlers.closed("The host closed the room.");
        };
        conn.on("close", gone);
        conn.on("error", gone);
      });
      p.on("error", err => {
        if (role === "guest") { if (err.type !== "peer-unavailable") handlers.notice && handlers.notice("Connection trouble…"); return; }
        clearTimeout(joinTimer);
        cleanup();
        fail(new Error(errText(err)));
      });
    });
  }

  function send(m) {
    if (role === "host" && host) host.receive(me, m);
    else if (hostConn && hostConn.open) hostConn.send(m);
  }

  function cleanup() {
    clearTimeout(joinTimer);
    clearInterval(tickTimer);
    const p = peer;
    peer = null; role = null; hostConn = null; host = null; conns.clear();
    if (p && !p.destroyed) { leaving = true; try { p.destroy(); } catch (e) {} }
    if (urlParam("room")) history.replaceState(null, "", location.pathname + (urlParam("peer") ? `?peer=${encodeURIComponent(urlParam("peer"))}` : ""));
  }

  function leave() {
    leaving = true;
    if (role === "host") {
      for (const c of conns.values()) if (c.open) c.send({ t: "bye", msg: "The host closed the room." });
      const p = peer;
      peer = null;
      setTimeout(() => { try { p && p.destroy(); } catch (e) {} }, 300);
    }
    cleanup();
  }

  return {
    create, join, send, leave, inviteLink,
    get me() { return me; }, get code() { return code; }, get isHost() { return role === "host"; },
    roomFromUrl: () => (urlParam("room") || "").replace(/\D/g, "").slice(0, 6),
  };
})();
