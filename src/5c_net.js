/* =====================================================================
   ONLINE PLAY over direct (WebRTC) links, found through the public game finder
   One host runs the real match. Its presence in the game room carries a compact snapshot ~20 times a
   second plus a short log of events (blasts, kills, feed, sounds); each joiner's presence carries its input.
   Joiners draw what the host sends about 0.1 s behind so motion is smooth, see their own soldier with
   almost no delay, and replay the host's events for effects and sound.
   ===================================================================== */
const NET = {
  room: null, avail: null, mode: null, busy: '', role: null, code: '', game: null, myPeer: null, hosts: [], msg: '', msgT: 0,
  // host
  matchId: 0, seq: 0, seqS: 0, slowT: 0, gs: null, slow: null, evId: 0, evLog: [], t0: performance.now(), sendT: 0, lastPres: '', pid: 0, kicked: new Set(), bn: {}, L: null, maxSnap: 0, hdr: null, roster: '',
  // client
  hostPeer: null, dev: null, myPid: -1, joined: false, wasJoined: false, curMatch: -1, lastSeq: -1, buf: [], off: null, lastEv: 0, evq: [], lobby: null, me: null,
  cc: new Array(15).fill(0), sd: 0, si: 0, pw: 0, dep: null, depN: 0, want: { c: '', t: -1, r: 0 }, lastI: null, pmap: new Map(), bul: [], lastHostT: 0, lastSnapT: 0, joinT: 0, lastA: null, demoMap: -1, selfD: null
};
const cleanName = n => String(n || '').toUpperCase().replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ' ').trimStart().slice(0, 10);
NET.name = cleanName(store.get('name', '')).trim();
// who this tab is across connections, so a host can give a dropped player their soldier back (per tab: two tabs are two players)
NET.cid = (() => { const mk = () => Math.random().toString(36).slice(2, 12); try { let c = sessionStorage.getItem('mm.cid'); if (!c) { c = mk(); sessionStorage.setItem('mm.cid', c); } return c; } catch (e) { return mk(); } })();
NET.left = {}; NET.list = new Map();
const NET_DELAY = 110;                                  // ms others are drawn behind the host
const WPNK = Object.keys(WPN);
const netNow = () => Math.round(performance.now() - NET.t0);

/* ---------- compact numbers: base-64 digits (JSON-safe, no escaping) ---------- */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', B64I = {};
for (let i = 0; i < 64; i++) B64I[B64[i]] = i;
function pk(n, c) { n = Math.round(n) || 0; const mx = 64 ** c - 1; n = n < 0 ? 0 : n > mx ? mx : n; let s = ''; for (let i = c - 1; i >= 0; i--) s += B64[Math.floor(n / 64 ** i) % 64]; return s; }
class Rd { constructor(s) { this.s = s || ''; this.i = 0; } u(c) { let n = 0; for (let k = 0; k < c; k++) n = n * 64 + (B64I[this.s[this.i++]] || 0); return n; } get end() { return this.i >= this.s.length; } }
const angE = a => pk(((((a || 0) % TAU) + TAU) % TAU) / TAU * 4096, 2), angD = n => n / 4096 * TAU;
const lerpAng = (a, b, k) => a + angDiff(a, b) * k;

/* ---------- direct play: browser-to-browser (WebRTC), for the game as a plain HTML file ----------
   A free public message relay (ntfy.sh) only introduces the two browsers; after that the game data flows
   directly between them. Every browser listens on its own topic: the host on "militiamayhem-<code>", a joiner
   on a random one. Each side sends its whole connection offer in one message (ICE gathered first), so a join
   costs about three messages. (PeerJS's public server stopped relaying messages in Oct 2026.) */
const P2P_PREFIX = 'militiamayhem-';
const P2P_SIGS = () => ((typeof window !== 'undefined' && window.__MM_SIG) ? [].concat(window.__MM_SIG) : ['https://ntfy.sh', 'https://ntfy.envs.net', 'https://ntfy.adminforge.de']).map(b => b.replace(/\/$/, ''));
const P2P_TOPIC = id => 'mm1-' + id;
const P2P_ICE = () => (typeof window !== 'undefined' && window.__MM_ICE) || [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const RTC = () => typeof window !== 'undefined' ? (window.RTCPeerConnection || window.webkitRTCPeerConnection || null) : null;
const p2pOK = () => !!RTC() && typeof WebSocket !== 'undefined';
/* what this browser view can do, shown when online play isn't possible */
function netDiag() { return 'WEBRTC ' + (RTC() ? 'OK' : 'MISSING') + ' · WEBSOCKET ' + (typeof WebSocket !== 'undefined' ? 'OK' : 'MISSING'); }

/* ---------- connection trace and error codes: every failure names the step that broke ---------- */
const NET_E = {
  101: ['CAN’T GET ONLINE', 'Your device couldn’t reach the server that finds games. Check your internet. Some school or work Wi-Fi blocks it.'],
  102: ['THE GAME FINDER ISN’T ANSWERING', 'The server that finds games is slow or down right now. Try again in a minute.'],
  103: ['THE GAME FINDER IS BUSY', 'The server that finds games turned us away, probably because it’s overloaded. Try again.'],
  104: ['COULDN’T MAKE A GAME CODE', 'Every code we tried was taken. Try again.'],
  201: ['NO GAME WITH THAT CODE', 'Nobody is hosting that code. Double-check it, and make sure the host is still in their lobby with the game on screen.'],
  202: ['THE HOST DIDN’T ANSWER', 'We found the game but the host never replied. Ask them to bring the game window to the front, then try again.'],
  301: ['YOUR DEVICES CAN’T REACH EACH OTHER', 'You found each other, but your internet setups won’t let a connection through (usually a router or firewall). Try a different network, like a phone hotspot.'],
  302: ['CONNECTING TOOK TOO LONG', 'Your devices kept trying but never got through (usually a router or firewall). Try again, or try a different network like a phone hotspot.'],
  303: ['YOUR BROWSER BLOCKED THE CONNECTION', 'One side couldn’t share how to reach it. A browser setting or extension may be blocking online play.'],
  401: ['CONNECTION DIDN’T FINISH', 'Your devices found a way to each other, but the link never opened. Try again.'],
  402: ['CONNECTION DROPPED', 'The link closed before the game could load. Try again.'],
  501: ['THE HOST’S GAME DIDN’T LOAD', 'You connected, but the lobby never came through. The host’s game window may be minimized or in the background.'],
  502: ['THAT GAME IS FULL', 'Four players are already in.'],
  503: ['THAT MATCH ALREADY STARTED', 'The host doesn’t allow joining mid-match. Join while they’re in the lobby.'],
  504: ['THE HOST REMOVED YOU', ''],
  601: ['LOST THE HOST', 'Nothing came from the host for 20 seconds. Their game window may be minimized, or their internet dropped.'],
  602: ['THE HOST LEFT', ''],
  701: ['YOUR BROWSER REFUSED TO CONNECT', 'The browser wouldn’t set up online play. Try updating it or using a different browser.'],
};
function mkTrace() { return { t0: performance.now(), sig: 0, offer: 0, answer: 0, lc: { host: 0, srflx: 0, relay: 0, prflx: 0 }, rc: { host: 0, srflx: 0, relay: 0, prflx: 0 }, lmdns: 0, rmdns: 0, gather: 'new', ice: 'new', conn: 'new', dc: 0, data: 0, turn: '', err: '' }; }
function traceCand(o, mdnsKey, tr, c) {
  const s = (c && c.candidate) || ''; if (!s) return;
  const m = / typ (\w+)/.exec(s), t = m ? m[1] : 'host'; if (t in o) o[t]++;
  if (/\.local /.test(s)) tr[mdnsKey]++;
}
const errTag = e => String(e && (e.name || e.message) || e).toUpperCase().slice(0, 40);
const candN = o => o.host + o.srflx + o.relay + o.prflx;
const tSum = o => 'H' + o.host + ' S' + o.srflx + ' R' + o.relay;
function traceLine(tr, other) {
  return 'YOU ' + tSum(tr.lc) + (tr.lmdns ? ' (' + tr.lmdns + ' MDNS)' : '') + ' · ' + other + ' ' + tSum(tr.rc) + (tr.rmdns ? ' (' + tr.rmdns + ' MDNS)' : '') +
    ' · ICE ' + tr.ice.toUpperCase() + ' · ' + ((performance.now() - tr.t0) / 1000).toFixed(1) + 'S';
}
function traceLine2(tr) { return 'RELAY ' + (tr.lc.relay ? 'OK' : tr.turn ? 'ERR ' + tr.turn : 'NONE') + ' · GATHER ' + tr.gather.toUpperCase() + ' · LINK ' + tr.conn.toUpperCase() + (tr.err ? ' · ' + tr.err : ''); }
function browserTag() {
  const u = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '', ios = /iPhone|iPad|iPod/.test(u);
  let m;
  if ((m = /CriOS\/(\d+)/.exec(u))) return 'CHROME ' + m[1] + ' iOS';
  if ((m = /Edg\/(\d+)/.exec(u))) return 'EDGE ' + m[1];
  if ((m = /Firefox\/(\d+)|FxiOS\/(\d+)/.exec(u))) return 'FIREFOX ' + (m[1] || m[2]) + (ios ? ' iOS' : '');
  if ((m = /Chrome\/(\d+)/.exec(u))) return 'CHROME ' + m[1] + (/Android/.test(u) ? ' ANDROID' : '');
  if ((m = /Version\/(\d+(\.\d+)?).*Safari/.exec(u))) return 'SAFARI ' + m[1] + (ios ? ' iOS' : '');
  return u ? 'OTHER' : 'NODE';
}
/* the reason a join attempt stalled, from how far it got */
function traceCode(tr) {
  if (tr.ice === 'failed' || tr.conn === 'failed') return 301;
  if (!tr.ack) return 201;
  if (!tr.answer) return 202;
  if (!candN(tr.rc) || !candN(tr.lc)) return 303;
  if (tr.ice !== 'connected' && tr.ice !== 'completed') return 302;
  if (!tr.dc) return 401;
  return 501;
}
/* show a failure: the player lands on the network screen with a panel naming the code, the step and the trace */
function netFail(code, extra) {
  const tr = NET.trace, E = NET_E[code] || ['CONNECTION ERROR', ''];
  const lines = [];
  if (tr && tr.offer) { lines.push(traceLine(tr, NET.role === 'host' ? 'THEM' : 'HOST')); lines.push(traceLine2(tr)); }
  if (extra) lines.push(String(extra).toUpperCase().slice(0, 90));
  lines.push('BUILD ' + VERSION.build + ' · ' + browserTag() + ' · ' + netDiag());
  // a joiner who was in the game and lost the link can try to get straight back in
  const re = NET.role === 'client' && (NET.joined || NET.wasJoined) && code !== 503 && code !== 504 && NET.code ? NET.code : '';
  if (NET.role) netLeave(); else NET.busy = '';
  NET.err = { code, title: E[0], hint: E[1], lines, t: performance.now(), re, sel: 0 };
  try { console.warn('[net] E' + code, E[0], lines.join(' | ')); } catch (e) { }
}
/* Every browser listens on all the relays; a message goes out on the first one that takes it. ntfy.sh allows 250
   messages a day per internet address (a household, or a whole phone carrier's shared address), so when it says no
   the next relay carries the introduction instead. */
function sigOpen(id) {
  return new Promise((res, rej) => {
    const bases = P2P_SIGS();
    let opened = false, failed = 0;
    const seen = new Set();
    const S = {
      id, on: null, onclose: null, onsenderr: null, dead: false, good: 0, subs: [],
      send(m) {
        if (!m.dst || S.dead) return; m.src = id; m.mid = m.mid || Math.random().toString(36).slice(2, 10);
        // a relay that refuses passes it on at once; one that is slow to answer gets company after 1.2 s (the far end ignores repeats)
        const body = JSON.stringify(m), errs = [], first = S.good; let next = 0, done = false;
        const tryNext = () => {
          if (done) return;
          const k = next++;
          if (k >= bases.length) { if (errs.length >= bases.length && S.onsenderr) S.onsenderr(errs.includes('RATE LIMITED') ? 'RATE LIMITED' : errs[0] || 'SEND FAILED'); return; }
          const i = (first + k) % bases.length; let moved = false;
          const on = () => { if (!moved) { moved = true; tryNext(); } };
          const tm = setTimeout(on, 1200);
          fetch(bases[i] + '/' + P2P_TOPIC(m.dst), { method: 'POST', body })
            .then(r => { clearTimeout(tm); if (r.ok) { done = true; S.good = i; return; } errs.push(r.status === 429 ? 'RATE LIMITED' : 'HTTP ' + r.status); on(); if (errs.length >= bases.length) tryNext(); })
            .catch(() => { clearTimeout(tm); errs.push('SEND FAILED'); on(); if (errs.length >= bases.length) tryNext(); });
        };
        tryNext();
      },
      close() { S.dead = true; for (const u of S.subs) { try { u.ws && u.ws.close(); } catch (e) { } } }
    };
    const t = setTimeout(() => { if (!opened) { rej('timeout'); S.close(); } }, 9000);
    const deliver = x => { if (!x || !x.src || x.src === id || !S.on) return; if (x.mid) { if (seen.has(x.mid)) return; seen.add(x.mid); } S.on(x); };
    bases.forEach(base => {
      const u = { ws: null, last: '', fails: 0, up: false }; S.subs.push(u);
      const wsBase = base.replace(/^http/, 'ws');
      const connect = () => {
        let ws; try { ws = new WebSocket(wsBase + '/' + P2P_TOPIC(id) + '/ws' + (u.last ? '?since=' + u.last : '')); } catch (e) { gone(); return; }
        u.ws = ws;
        ws.onmessage = e => {
          let m; try { m = JSON.parse(e.data); } catch (er) { return; }
          if (m.event === 'open') { u.fails = 0; u.up = true; if (!opened) { opened = true; clearTimeout(t); res(S); } return; }
          if (m.event !== 'message') return;
          u.last = m.id;
          // a message too long for the relay arrives as an attachment
          if (m.attachment && m.attachment.url) { fetch(m.attachment.url).then(r => r.json()).then(deliver).catch(() => { }); return; }
          try { deliver(JSON.parse(m.message)); } catch (er) { }
        };
        ws.onerror = () => { if (!u.up) gone(); };
        // the relay drops idle sockets now and then: reconnect, catching up on anything missed
        ws.onclose = () => {
          if (S.dead || !u.up) return;
          if (++u.fails === 3 && S.subs.every(o => o.fails >= 3 || !o.up) && S.onclose) S.onclose();
          setTimeout(() => { if (!S.dead) connect(); }, Math.min(10000, 1000 * u.fails));
        };
      };
      // a relay that can't be reached at all is just left out; only all of them failing is an error
      const gone = () => { if (u.dead) return; u.dead = true; if (++failed === bases.length && !opened) { clearTimeout(t); S.dead = true; rej('network'); } };
      connect();
    });
  });
}
/* ---------- the server list: hosts post a one-line listing on the relays' "mm1-list" topic (on change, at most every 20 s,
   and every 3 minutes to stay listed); the online menu listens to the last 10 minutes of it ---------- */
function netListSend(x) {
  const bases = P2P_SIGS(), body = JSON.stringify(x);
  const go = i => { if (i >= bases.length || typeof fetch === 'undefined') return; fetch(bases[i] + '/' + P2P_TOPIC('list'), { method: 'POST', body }).then(r => { if (!r.ok) go(i + 1); }).catch(() => go(i + 1)); };
  go(0);
}
function netListPub(now, L) {
  if (NET.role !== 'host' || !NET.game || !NET.game.perPeer) return;          // direct-play games only
  if (CFG.pub === false) { if (NET.pubK && NET.pubK !== 'gone') { NET.pubK = 'gone'; netListSend({ c: NET.code, gone: 1 }); } return; }
  const info = { c: NET.code, n: PLAYERS.length, st: L.st, md: MODES[CFG.mode].n, mp: MAPNAMES[CFG.map][1], nm: NET.name, mj: CFG.midjoin ? 1 : 0 }, key = JSON.stringify(info), since = now - (NET.pubT || -1e9);
  if ((key !== NET.pubK && since > 20000) || since > 180000) { NET.pubK = key; NET.pubT = now; netListSend(info); }
}
function netListWatch(on) {
  if (!on) { if (NET.lw) { for (const ws of NET.lw) { try { ws.close(); } catch (e) { } } NET.lw = null; } return; }
  if (NET.lw && !(NET.lw.every(w => w.dead) && performance.now() - NET.lwT > 10000)) return;
  netListWatch(false); NET.lw = []; NET.lwT = performance.now();
  for (const base of P2P_SIGS()) {
    let ws; try { ws = new WebSocket(base.replace(/^http/, 'ws') + '/' + P2P_TOPIC('list') + '/ws?since=10m'); } catch (e) { continue; }
    ws.onmessage = e => { let m, x; try { m = JSON.parse(e.data); if (m.event !== 'message') return; x = JSON.parse(m.message); } catch (er) { return; } netListSee(x, m.time); };
    ws.onclose = ws.onerror = () => { ws.dead = true; };
    NET.lw.push(ws);
  }
}
function netListSee(x, time) {
  if (!x || !/^[a-z0-9]{4}$/.test(x.c || '')) return;
  const t = (+time || Date.now() / 1000) * 1000, o = NET.list.get(x.c);
  if (o && o.t > t) return;                                   // older news about that game
  if (x.gone) { NET.list.set(x.c, { c: x.c, t, gone: true }); return; }
  NET.list.set(x.c, { c: x.c, t, n: clamp(x.n | 0, 0, MAXP), st: x.st === 'play' ? 'play' : 'lobby', md: String(x.md || '').slice(0, 24), mp: String(x.mp || '').slice(0, 24), nm: cleanName(x.nm).trim(), mj: !!x.mj, peer: null });
}
/* forget what we heard and listen again: the relays replay the last 10 minutes, so live games come straight back */
function netListRefresh() { NET.list.clear(); netListWatch(false); NET.lwT = performance.now(); }
/* every open game on the public list (fresh ones only) */
function netAllHosts() {
  const out = NET.hosts.slice(), have = new Set(out.map(h => h.c)), now = Date.now();
  for (const h of NET.list.values()) if (!h.gone && now - h.t < 400000 && !have.has(h.c) && !(NET.role === 'host' && h.c === NET.code)) out.push(h);      // (a joiner keeps NET.code after leaving: that game must still show)
  return out;
}
/* wait (briefly) until a connection has found its addresses, so they all go in one message */
const iceGathered = (pc, ms) => new Promise(r => {
  if (pc.iceGatheringState === 'complete') return r();
  const t = setTimeout(r, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } });
});
const sdpCands = d => ((d && d.sdp) || '').split(/\r?\n/).filter(l => l.startsWith('a=candidate:')).map(l => ({ candidate: l.slice(2) }));
/* the same calls the game uses on a room (presence, onPeers, leave), over direct links */
function netWire(dc, t) { try { dc.send(t); } catch (e) { } }
function p2pRoom(sig, hostId, trace) {
  const R = { mine: {}, per: {}, q: 0, links: new Map(), hs: [], pend: {}, onFail: null, onJoinFail: null, dead: false };
  const self = () => ({ peer: sig.id, sameTab: true, isMe: true, kind: 'viewer', presence: R.mine });
  const list = () => [self(), ...[...R.links.values()].filter(l => l.open).map(l => ({ peer: l.id, sameTab: false, isMe: false, kind: 'viewer', presence: l.pres }))];
  const fire = (joined, left) => { const ch = { peers: list(), joined, left, updated: [] }; for (const h of R.hs) { try { h(ch); } catch (e) { console.error(e); } } };
  // a message carries only the keys that changed (plus a running number, so a late packet never overwrites a newer one);
  // anything addressed to one peer only (their own HUD numbers) rides in R.per
  const txt = (L, patch) => JSON.stringify(Object.assign({ _q: ++R.q }, patch || R.mine, patch ? (R.perP && R.perP[L.id]) || {} : R.per[L.id] || {}));
  const dsend = (L, t) => { L.sentT = performance.now(); netWire(L.dc, t); };
  function drop(L, why) {
    if (!R.links.has(L.id)) return; R.links.delete(L.id); try { L.pc.close(); } catch (e) { }
    if (L.open) fire([], [{ peer: L.id }]); else if (hostId && R.onFail) R.onFail(why || 'failed'); else if (!hostId && R.onJoinFail) R.onJoinFail(L.tr, why || 'failed');
  }
  function mkLink(id, initiator) {
    const PC = RTC(), pc = new PC({ iceServers: P2P_ICE() });
    const tr = (hostId && trace) || mkTrace();
    const L = { id, pc, dc: null, pres: {}, kq: {}, open: false, last: performance.now(), sentT: 0, tr };
    // addresses found before the offer/answer goes out ride along in it; only late ones are sent separately
    pc.onicecandidate = e => { if (e.candidate) { traceCand(tr.lc, 'lmdns', tr, e.candidate); if (L.sent) sig.send({ type: 'CANDIDATE', dst: id, payload: { c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate } }); } };
    pc.onicecandidateerror = e => { if (/^turns?:/.test(e.url || '')) tr.turn = String(e.errorCode || '?'); };
    pc.onicegatheringstatechange = () => { tr.gather = pc.iceGatheringState; };
    pc.oniceconnectionstatechange = () => { tr.ice = pc.iceConnectionState; if (tr.ice === 'failed') drop(L, 'failed'); };
    pc.onconnectionstatechange = () => { tr.conn = pc.connectionState; if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(L, 'failed'); };
    const wire = dc => {
      L.dc = dc;
      dc.onopen = () => { tr.dc = performance.now(); L.open = true; L.last = performance.now(); dsend(L, txt(L)); fire([{ peer: id }], []); };
      dc.onmessage = e => {
        let m; try { m = JSON.parse(e.data) || {}; } catch (er) { return; }
        const q = m._q | 0; L.last = performance.now(); tr.data = tr.data || L.last;
        for (const k in m) { if (k === '_q' || q <= (L.kq[k] | 0)) continue; L.kq[k] = q; if (m[k] === null) delete L.pres[k]; else L.pres[k] = m[k]; }
        fire([], []);
      };
      dc.onclose = () => drop(L, 'closed');
    };
    // game traffic is state that is resent constantly, so a lost packet is never waited for
    if (initiator) wire(pc.createDataChannel('mm', { ordered: false, maxRetransmits: 0 })); else pc.ondatachannel = e => wire(e.channel);
    R.links.set(id, L); return L;
  }
  const flush = (id, L) => { for (const c of R.pend[id] || []) L.pc.addIceCandidate(c).catch(() => { }); delete R.pend[id]; };
  sig.on = async m => {
    const src = m.src, P = m.payload || {};
    try {
      if (m.type === 'OFFER' && !hostId && P.sdp) {
        if (R.links.has(src)) drop(R.links.get(src));
        sig.send({ type: 'ACK', dst: src });          // "a game with this code exists" before the slower answer
        const L = mkLink(src, false); L.tr.offer = L.tr.ack = performance.now();
        if (R.onJoinTry) R.onJoinTry();
        for (const c of [...sdpCands(P.sdp), ...(R.pend[src] || [])]) traceCand(L.tr.rc, 'rmdns', L.tr, c);
        await L.pc.setRemoteDescription(P.sdp); flush(src, L);
        await L.pc.setLocalDescription(await L.pc.createAnswer());
        await iceGathered(L.pc, 2500); if (!R.links.has(src)) return;
        sig.send({ type: 'ANSWER', dst: src, payload: { sdp: L.pc.localDescription } }); L.sent = true; L.tr.answer = performance.now();
      } else if (m.type === 'ACK') { const L = R.links.get(src); if (L && !L.tr.ack) L.tr.ack = performance.now(); }
      else if (m.type === 'ANSWER' && P.sdp) { const L = R.links.get(src); if (L && !L.tr.answer) { L.tr.answer = performance.now(); L.tr.ack = L.tr.ack || L.tr.answer; for (const c of sdpCands(P.sdp)) traceCand(L.tr.rc, 'rmdns', L.tr, c); await L.pc.setRemoteDescription(P.sdp); flush(src, L); } }
      else if (m.type === 'CANDIDATE' && P.c) { const L = R.links.get(src); if (L) traceCand(L.tr.rc, 'rmdns', L.tr, P.c); if (L && L.pc.remoteDescription) L.pc.addIceCandidate(P.c).catch(e => { L.tr.err = 'BAD CANDIDATE'; }); else (R.pend[src] = R.pend[src] || []).push(P.c); }
      else if (m.type === 'LEAVE') { const L = R.links.get(src); if (L) drop(L, hostId ? 'nohost' : 'left'); }
    } catch (e) { console.warn('p2p', e); const L = R.links.get(src); if (L) { L.tr.err = errTag(e); drop(L, 'setup'); } }
  };
  sig.onclose = () => { if (!R.dead && R.onSigLost) R.onSigLost(); };
  if (hostId && trace) sig.onsenderr = e => { trace.err = e; };
  // keep links warm: a quiet link gets our whole state four times a second; drop links that go silent
  R.tick = setInterval(() => {
    const now = performance.now();
    for (const L of [...R.links.values()]) {
      if (L.open && L.dc.readyState === 'open' && now - L.sentT > 240) dsend(L, txt(L));
      if (hostId && L.tr.offer && !L.tr.ack && now - L.tr.offer > 8000) drop(L, 'nohost');   // nobody is listening on that code
      else if (now - L.last > (L.open ? 10000 : 22000)) drop(L, 'timeout');
    }
  }, 250);
  if (hostId) (async () => {
    let L = null;
    try {
      L = mkLink(hostId, true); await L.pc.setLocalDescription(await L.pc.createOffer());
      await iceGathered(L.pc, 2500); if (!R.links.has(hostId)) return;
      sig.send({ type: 'OFFER', dst: hostId, payload: { sdp: L.pc.localDescription } }); L.sent = true; L.tr.offer = performance.now();
    }
    catch (e) { if (L) L.tr.err = errTag(e); if (R.onFail) R.onFail('setup'); }
  })();
  return {
    name: sig.id,
    presence(patch, per) {
      for (const k in patch) { if (patch[k] === null) delete R.mine[k]; else R.mine[k] = patch[k]; }
      R.perP = per || null; if (per) for (const id in per) R.per[id] = Object.assign(R.per[id] || {}, per[id]);
      for (const L of R.links.values()) if (L.open && L.dc.readyState === 'open') dsend(L, txt(L, patch));
      return Promise.resolve();
    },
    perPeer: true,
    onPeers(h) { R.hs.push(h); setTimeout(() => { if (!R.dead) fire([], []); }, 0); return () => { }; },
    peers: list, connected: () => !R.dead,
    set onFail(f) { R.onFail = f; }, set onSigLost(f) { R.onSigLost = f; }, set onJoinFail(f) { R.onJoinFail = f; }, set onJoinTry(f) { R.onJoinTry = f; },
    leave() { R.dead = true; clearInterval(R.tick); for (const L of R.links.values()) { try { L.pc.close(); } catch (e) { } } R.links.clear(); if (hostId) sig.send({ type: 'LEAVE', dst: hostId }); setTimeout(() => sig.close(), 100); return Promise.resolve(); }
  };
}

/* ---------- connecting ---------- */
function netInit() { NET.mode = p2pOK() ? 'p2p' : null; NET.avail = !!NET.mode; }
function netErr(e) { console.warn('net', e && e.code, e && e.message); }
function netSay(m, t) { NET.msg = m; NET.msgT = t || 3.5; }
const sigCode = e => e === 'network' ? 101 : e === 'timeout' ? 102 : e === 'error' ? 103 : e === 'taken' ? 104 : 701;
const CODE_CH = 'abcdefghjkmnpqrstuvwxyz23456789';         // no 0 1 i l o
function netCode() { let s = ''; for (let i = 0; i < 4; i++) s += pick(CODE_CH); return s; }
async function netHost(dev) {
  if (!NET.avail || NET.role) return;
  NET.role = 'host'; NET.code = netCode(); NET.kicked = new Set(); NET.pubK = ''; NET.pubT = -1e9; NET.evLog = []; NET.lastPres = ''; NET.game = null; NET.busy = 'SETTING UP YOUR GAME…'; NET.trace = null; NET.err = null;
  try {
    let sig = null;
    for (let k = 0; k < 4 && !sig; k++) { try { sig = await sigOpen(P2P_PREFIX + NET.code); } catch (e) { if (e !== 'taken') throw e; NET.code = netCode(); } }
    if (!sig) throw 'taken';
    NET.game = p2pRoom(sig, null); NET.myPeer = sig.id;
    NET.game.onSigLost = () => { if (NET.role === 'host') netSay('LOST THE GAME FINDER — NEW PLAYERS CAN’T JOIN RIGHT NOW (E801)', 12); };
    NET.game.onJoinTry = () => { if (NET.role === 'host') netSay('SOMEONE IS JOINING…', 4); };
    NET.game.onJoinFail = (tr, why) => { if (NET.role === 'host' && why !== 'left') netSay('SOMEONE TRIED TO JOIN BUT COULDN’T CONNECT · E' + (why === 'closed' ? 402 : traceCode(tr)) + ' · ' + traceLine(tr, 'THEM') + ' · ' + traceLine2(tr), 15); };
  } catch (e) { NET.role = null; netFail(sigCode(e)); return; }
  NET.busy = '';
  NET.game.onPeers(netGamePeers, netErr);
  enterLobby(dev && dev.type !== 'net' ? dev : { type: 'kb' });
  if (PLAYERS[0]) PLAYERS[0].name = NET.name;
}
async function netJoin(h, dev) {
  if (!NET.avail || NET.role || !h) return;
  Object.assign(NET, { role: 'client', hostPeer: h.peer, code: h.c, dev: dev && dev.type !== 'net' ? dev : { type: 'kb' }, myPid: -1, joined: false, wasJoined: false, curMatch: -1, lastSeq: -1, buf: [], off: null, lobby: null, want: { c: '', t: -1, r: 0 }, dep: null, lastHostT: performance.now(), joinT: performance.now(), lastPres: '', game: null, demoMap: -1, gs: null, gsRaw: null, slow: null, snapN: 0, firstL: 0, doneMatch: 0, roApplied: '' });
  NET.busy = 'JOINING ' + h.c.toUpperCase() + '…'; NET.err = null; NET.trace = mkTrace();
  try {
    const sig = await sigOpen(P2P_PREFIX + 'j-' + Math.random().toString(36).slice(2, 10));
    NET.trace.sig = performance.now();
    NET.hostPeer = P2P_PREFIX + h.c; NET.myPeer = sig.id;
    NET.game = p2pRoom(sig, NET.hostPeer, NET.trace);
    NET.game.onFail = why => { if (NET.role === 'client' && !NET.joined) netFail(why === 'nohost' ? 201 : why === 'closed' ? 402 : why === 'setup' && !NET.trace.offer ? 701 : traceCode(NET.trace)); };
  } catch (e) { NET.role = null; netFail(sigCode(e)); return; }
  NET.busy = '';
  NET.game.onPeers(netGamePeers, netErr);
  PLAYERS = []; LOBBY.sel = 0; setState('lobby'); ev('lobby.join');
}
/* leave whatever online game we are in; back to the network menu with an optional message */
function netShutdown(msg) {
  const g = NET.game; NET.game = null;
  if (g) { try { g.presence({ L: null, g: null, gs: null, j: null, i: null, d: null }).catch(() => { }); } catch (e) { } try { g.leave().catch(() => { }); } catch (e) { } }
  if (NET.role === 'host' && NET.pubK && NET.pubK !== 'gone') { netListSend({ c: NET.code, gone: 1 }); NET.pubK = ''; }      // off the list
  NET.role = null; NET.curMatch = -1; NET.me = null; NET.buf = []; NET.evq = []; NET.pmap.clear(); NET.bul = []; NET.lastI = null;
  if (msg) netSay(msg);
}
function netLeave(msg) { netShutdown(msg); engineKillAll(); PLAYERS = []; SET.open = false; demoMatch(); setState('netmenu'); Music.mode = 'menu'; }
function netHostGone(code) { if (NET.role !== 'client') return; netFail(code || 602); }
function netReconnect() { const E = NET.err; if (!E || !E.re || NET.role) return; NET.err = null; ev('menu'); netJoin({ c: E.re }, NET.dev || NETM.dev); }

function netGamePeers(ch) {
  const me = ch.peers.find(p => p.sameTab); if (me) NET.myPeer = me.peer;
  if (NET.role === 'host') {
    for (const pr of ch.left) netPeerLeft(pr.peer);
    for (const pr of ch.peers) if (!pr.sameTab) netHostSee(pr);
  } else if (NET.role === 'client') {
    if (ch.left.some(p => p.peer === NET.hostPeer)) { netHostGone(); return; }
    // the host is whoever publishes this game's lobby here (peer labels should match the lobby's, but don't depend on it)
    let h = ch.peers.find(p => p.peer === NET.hostPeer);
    if (!h || !h.presence || !h.presence.L) { const h2 = ch.peers.find(p => !p.sameTab && p.presence && p.presence.L && p.presence.L.c === NET.code); if (h2) { h = h2; NET.hostPeer = h2.peer; } }
    if (h && h.presence) netClientSee(h.presence);
  }
}

/* ================= host side ================= */
function netHostSee(pr) {
  const P = pr.presence || {};
  let p = PLAYERS.find(q => isNet(q) && q.dev.peer === pr.peer);
  if (!p) {
    const cid = P.j && typeof P.j.id === 'string' ? P.j.id.slice(0, 16) : '';
    if (!P.j || NET.kicked.has(pr.peer) || (cid && NET.kicked.has(cid))) return;
    // the same player on a new link (back before their old one timed out): the old link is finished
    const old = cid && PLAYERS.find(q => isNet(q) && q.cid === cid); if (old) netPeerLeft(old.dev.peer);
    if (state === 'lobby') {
      if (PLAYERS.length >= MAXP) return;
      lobbyJoin({ type: 'net', peer: pr.peer }); p = PLAYERS.find(q => isNet(q) && q.dev.peer === pr.peer); if (!p) return; p.cid = cid;
    } else if (netHostLive() && !M.over && PLAYERS.length < MAXP && (CFG.midjoin || (cid && cid in NET.left))) { p = netMidJoin(pr.peer, P.j, cid); if (!p) return; }
    else return;
  }
  if ((P.i || null) !== p.netIn) p.netInT = performance.now();
  p.netIn = P.i || null; p.netDep = P.d || null;
  if (p.rdN === undefined) p.rdN = P.rd | 0; else if ((P.rd | 0) !== p.rdN) { p.rdN = P.rd | 0; if (state !== 'lobby') redeploy(p.sol); }     // REDEPLOY from their pause menu
  if (state === 'lobby') {
    if (!P.j) { leaveLobby(p); return; }
    const j = P.j;
    if (typeof j.c === 'string' && (j.cn | 0) !== (p.wantCn | 0)) { p.wantCn = j.cn | 0; applyColor(p, j.c); }     // a colour pick counts once
    // a joiner's team request counts once (so the host can still move them afterwards)
    if (MODES[CFG.mode].team && (j.t === 0 || j.t === 1) && (j.tn | 0) !== (p.wantTn | 0)) { p.wantTn = j.tn | 0; p.team = j.t; }
    p.ready = !!j.r; p.name = dupName(p, cleanName(j.n).trim());
  }
}
/* two players with the same name: the later ones get a nickname (stable, by join order) */
const DUPN = [n => 'Also ' + n, n => n + ' III', n => 'Another ' + n, n => n + ' (but cooler)', n => n + '’s 3rd cousin', n => 'Not ' + n, n => n + ' Jr.', n => 'Evil ' + n];
function dupName(p, raw) {
  p.base = raw; if (!raw) return raw;
  const k = raw.toLowerCase(); let i = 0;
  for (const q of PLAYERS) { if (q === p) break; if (String(q.base != null ? q.base : q.name || '').toLowerCase() === k) i++; }
  return i ? (DUPN[i - 1] || (n => n + ' #' + (i + 1)))(raw) : raw;
}
function netPeerLeft(peer) {
  const p = PLAYERS.find(q => isNet(q) && q.dev.peer === peer); if (!p) return;
  if (!M || M.demo || state === 'lobby') leaveLobby(p); else netBotify(p);
}
function netKick(p) { NET.kicked.add(p.dev.peer); if (p.cid) NET.kicked.add(p.cid); PLAYERS = PLAYERS.filter(q => q !== p); ev('lobby.leave'); }
/* someone dropped out mid-match: their soldier fights on as a bot */
const botSubName = n => 'BOT (' + String(n || '').trim().slice(0, 10) + ')';
function netBotify(p) {
  PLAYERS = PLAYERS.filter(q => q !== p);
  const s = p.sol; if (!s) return;
  const was = s.name;
  s.player = null; s.bot = makeSoldier({ bot: true, team: s.team }).bot; if (!s.alive) s.respawnT = Math.max(s.respawnT, 1);
  // the soldier and its score carry on, but under a name that says a bot is filling in
  s.name = botSubName(was); NET.bn[M.sol.indexOf(s)] = s.name;
  if (p.cid) NET.left[p.cid] = M.sol.indexOf(s);         // theirs again if they reconnect
  netRoster();
  toast(was + ' LEFT — A BOT TAKES OVER', '#f2e6c4', 2.8, -1, 3);
}
const netHostLive = () => M && !M.demo && (state === 'play' || state === 'pause');
/* someone joins a match already under way: they take over a bot (their own old soldier if they dropped out, else a bot
   on the side with fewer people, a dead one if possible) and go to the deploy screen */
function netMidJoin(peer, j, cid) {
  lobbyJoin({ type: 'net', peer }); const p = PLAYERS.find(q => isNet(q) && q.dev.peer === peer); if (!p) return null;
  p.cid = cid; p.name = dupName(p, cleanName(j.n).trim()); p.ready = true;
  const back = cid && cid in NET.left ? M.sol[NET.left[cid]] : null; if (cid) delete NET.left[cid];
  let s = back && !back.player ? back : null, team = 0;
  if (!s) {
    const humans = t => M.sol.filter(o => o.player && o.team === t).length;
    team = M.coop ? 0 : humans(0) <= humans(1) ? 0 : 1;
    const pick = L => L.find(o => !o.alive) || L[0] || null;
    s = M.coop ? null : pick(M.sol.filter(o => !o.player && (M.ffa || o.team === team))) || pick(M.sol.filter(o => !o.player));     // co-op: a new survivor, never a raider
    if (s) { s.pts = s.k = s.d = s.caps = s.vk = 0; s.heal = s.rep = s.longest = s.rk = 0; }
  }
  if (!s) { s = makeSoldier({ team: M.ffa ? 100 + M.sol.length : team, color: p.color, name: p.name, player: p }); M.sol.push(s); }
  if (s.alive) { if (s.veh) leaveSeat(s); s.alive = false; }       // the bot standing in steps aside
  s.player = p; s.bot = null; s.mhp = M.coop ? 200 : 100; s.name = p.name || 'P' + (p.id + 1); s.respawnT = 0; s.firstDeploy = true; s.deployIdle = 0;
  p.sol = s; p.team = s.team; if (M.ffa) p.color = s.color; else { if (!M.coop) p.color = M.teamColor[s.team]; s.color = p.color; s.dark = false; }
  delete NET.bn[M.sol.indexOf(s)]; netRoster();
  toast(s.name + (back ? ' IS BACK' : ' JOINED'), '#f2e6c4', 2.5, -1, 3);
  return p;
}
function netInputHost(p) {
  const I = newI(), q = p.netIn;
  if (p.netDep) p.lastDep = p.netDep.n;           // a deploy asked for while alive doesn't carry into the next life
  if (!q || !Array.isArray(q.m)) { if (q && Array.isArray(q.c)) p.netC = q.c.slice(); return I; }
  I.mx = clamp((q.m[0] || 0) / 100, -1, 1); I.my = clamp((q.m[1] || 0) / 100, -1, 1);
  I.aimA = typeof q.a === 'number' ? q.a / 1000 : null; I.fire = !!q.f; I.ads = !!q.ad; I.sprint = !!q.sp; I.gadget = !!q.g; I.altDist = q.ds || 220; I.interactSwap = !!q.is;
  const c = Array.isArray(q.c) ? q.c : [], pc = p.netC || c, e = k => c[k] !== pc[k];
  I.jump = e(0); I.reload = e(1); I.alt = e(2); I.nadeCyc = e(3); I.gadgetP = e(4); I.enter = e(5); I.melee = e(6); I.spot = e(7); I.stanceCycle = e(8); I.swapW = e(9); I.seatNext = e(10); I.lamp = e(14);
  I.seatDir = e(11) ? clamp(q.sd | 0, 0, 3) : -1; I.seatIdx = e(12) ? clamp(q.si | 0, 0, 3) : -1; I.pickW = e(13) ? clamp(q.pw | 0, 0, 1) : -1;
  p.netC = c.slice(); p.netVt = typeof q.vt === 'number' ? q.vt : null;
  // when they sent it, on our clock: their timestamp plus the smallest gap we've seen (so network jitter doesn't become position jitter)
  if (p.netInQt !== q) { p.netInQt = q; if (typeof q.ct === 'number') { const o = p.netInT - q.ct; p.ctOff = p.ctOff === undefined || o < p.ctOff ? o : p.ctOff + (o - p.ctOff) * 0.01; p.netRepT = q.ct + p.ctOff; } else p.netRepT = p.netInT; }
  // on foot, the joiner says where they are; the host takes it if it's believable, otherwise it corrects them
  const s = p.sol, rp = q.p;
  if (s && s.alive && !s.veh && Array.isArray(rp) && (q.ca | 0) === (s.netCorr | 0)) {
    if (p.netInQ !== q) {
      p.netInQ = q; const x = +rp[0] || 0, y = +rp[1] || 0, B = p.repBuf = p.repBuf && p.repBuf.ca === (s.netCorr | 0) ? p.repBuf : Object.assign([], { ca: s.netCorr | 0 });
      if (Math.hypot(x - s.x, y - s.y) > 110 || MAP.buildings.some(b => inRect(x, y, b, 2))) { netCorrect(s); p.repBuf = null; }
      else if (!B.length || p.netRepT > B[B.length - 1].t) { B.push({ x, y, vx: clamp(+rp[2] || 0, -300, 300), vy: clamp(+rp[3] || 0, -300, 300), jt: clamp(+rp[4] || 0, 0, 0.42), t: p.netRepT }); if (B.length > 10) B.shift(); }
    }
    const B = p.repBuf;
    if (B && B.length && B.ca === (s.netCorr | 0) && performance.now() - B[B.length - 1].t < 400) I.netPos = B;
  }
  // driving: the same deal for the vehicle
  const v = s && s.alive ? s.veh : null, vp = q.vp;
  if (v && s.seat === 0 && v.T.drive && Array.isArray(vp) && (q.vca | 0) === (v.netCorr | 0) && p.netInQv !== q) {
    p.netInQv = q; const x = +vp[0] || 0, y = +vp[1] || 0, B = v.repBuf = v.repBuf && v.repBuf.ca === (v.netCorr | 0) && v.repBuf.drv === s ? v.repBuf : Object.assign([], { ca: v.netCorr | 0, drv: s });
    if (Math.hypot(x - v.x, y - v.y) > 160 || MAP.buildings.some(b => inRect(x, y, b, 0))) { netCorrect(v); v.repBuf = null; }
    else if (!B.length || p.netRepT > B[B.length - 1].t) { B.push({ x, y, a: +vp[2] || 0, vx: clamp(+vp[3] || 0, -400, 400), vy: clamp(+vp[4] || 0, -400, 400), spd: clamp(+vp[5] || 0, -400, 400), av: clamp(+vp[6] || 0, -6, 6), tr: +vp[7] || 0, t: p.netRepT }); if (B.length > 10) B.shift(); }
  }
  return I;
}
/* host: a joiner's new shots remember what moment the joiner was looking at (their view time on our clock), and leave
   from where the joiner actually stood rather than where our slightly-behind replay of them has got to */
function netTagShots(p, s, n0) {
  if (typeof p.netVt !== 'number') return;
  const rew = clamp(netNow() - p.netVt, 0, 400), R = s.veh ? (s.seat === 0 ? s.veh.repBuf : null) : p.repBuf, B = R && R.length ? R[R.length - 1] : null, e = s.veh || s;
  const ok = B && performance.now() - B.t < 250 && Math.hypot(B.x - e.x, B.y - e.y) < 40, dx = ok ? B.x - e.x : 0, dy = ok ? B.y - e.y : 0;
  for (let k = n0; k < M.proj.length; k++) {
    const q = M.proj[k]; if (q.k === 'nade' || q.src !== s) continue;
    q.rew = rew; q.x += dx; q.y += dy; if (q.ox !== undefined) { q.ox += dx; q.oy += dy; }
  }
}
/* host: a joiner's reports are replayed a little behind (like everyone else on their screen), so arrival jitter never shows */
const NET_REP_DELAY = 60;
function netSample(B, T) {
  for (let i = B.length - 1; i >= 0; i--) {
    if (B[i].t > T) continue;
    const a = B[i], b = B[i + 1];
    if (!b) { const e = Math.min(0.1, (T - a.t) / 1000); return { x: a.x + a.vx * e, y: a.y + a.vy * e, a: (a.a || 0) + (a.av || 0) * e, vx: a.vx, vy: a.vy, spd: a.spd, av: a.av, tr: a.tr, jt: Math.max(0, (a.jt || 0) - e) }; }
    const k = (T - a.t) / Math.max(1, b.t - a.t);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), a: lerpAng(a.a || 0, b.a || 0, k), vx: lerp(a.vx, b.vx, k), vy: lerp(a.vy, b.vy, k), spd: lerp(a.spd || 0, b.spd || 0, k), av: lerp(a.av || 0, b.av || 0, k), tr: lerpAng(a.tr || 0, b.tr || 0, k), jt: lerp(a.jt || 0, b.jt || 0, k) };
  }
  const a = B[0]; return { x: a.x, y: a.y, a: a.a || 0, vx: a.vx, vy: a.vy, spd: a.spd, av: a.av, tr: a.tr, jt: a.jt || 0 };
}
function netDriveRep(v, driver) {
  const B = v.repBuf;
  if (!B || !B.length || B.drv !== driver || B.ca !== (v.netCorr | 0) || performance.now() - B[B.length - 1].t > 400) return null;
  return B;
}
/* host: follow a joiner's own driving, then let the world push back (crushing, shoving and damage happen here) */
function netAuthDrive(v, B, dt) {
  const r = netSample(B, performance.now() - NET_REP_DELAY), ox = v.x, oy = v.y, oa = v.a;
  v.x = r.x; v.y = r.y; v.a = r.a; v.vx = r.vx; v.vy = r.vy; v.spd = r.spd; v.av = r.av; if (v.type === 'tank') v.tRel = r.tr;
  vehicleCollide(v, false, true);
  if (Math.hypot(v.x - r.x, v.y - r.y) > 14) { netCorrect(v); v.repBuf = null; }
  v.spd = r.spd;
  syncMounts(v);
  vehTrackFx(v, Math.hypot(v.x - ox, v.y - oy) + Math.abs(angDiff(oa, v.a)) * 20);
}
function netCorrect(s) { s.netCorr = ((s.netCorr | 0) + 1) % 64; }
/* host: replay a joiner's own movement, then make sure it's somewhere they can be */
function netAuthMove(s, B, dt) {
  const r = netSample(B, performance.now() - NET_REP_DELAY);
  s.x = r.x; s.y = r.y; s.vx = r.vx; s.vy = r.vy; s.jumpT = r.jt; s.netAuthT = M.time;      // their vault on their clock, so we agree when they're over a sandbag
  soldierCollide(s);
  if (Math.hypot(s.x - r.x, s.y - r.y) > 6) { netCorrect(s); if (s.player) s.player.repBuf = null; }
}
function netDeployHost(s) {
  const p = s.player, d = p.netDep;
  if (!d || d.n === p.lastDep) return;
  if (s.respawnT > 0 || !canDeploy(s) || M.over) return;
  p.lastDep = d.n;
  s.kit = clamp(d.k | 0, 0, KITS.length - 1); s.var = Math.max(0, d.v | 0); s.sec = Math.max(0, d.sc | 0); s.nt = Math.max(0, d.nt | 0);
  const opts = spawnOptions(s); spawnSoldier(s, opts.find(o => o.name === d.o) || opts[0]);
  if (p.netIn && Array.isArray(p.netIn.c)) p.netC = p.netIn.c.slice();
}
function netEv(type, ...a) {
  if (NET.role !== 'host' || !M || M.demo) return;
  NET.evLog.push({ id: ++NET.evId, t: netNow(), a: [type, ...a] });
  if (NET.evLog.length > 200) NET.evLog.splice(0, NET.evLog.length - 200);
}
function netMatchStarted() {
  if (NET.role !== 'host') return;
  NET.matchId++; NET.evLog = []; NET.bn = {}; NET.left = {};
  NET.hdr = [...cfgPack(M.cfg), COLORS.indexOf(M.teamColor[0]), COLORS.indexOf(M.teamColor[1]), M.cfg.teamColors === 'classic' ? 0 : 1, M.cfg.fog === 'off' ? 0 : 1];
  netRoster();
}
/* the match settings both net headers (match start, lobby info) open with */
function cfgPack(C) { return [C.mode, C.map, C.bots, C.limit, C.skill, C.ff ? 1 : 0, Math.max(0, WEATHERS.indexOf(C.weather))]; }
function cfgUnpack(c) { return { mode: clamp(c[0] | 0, 0, MODES.length - 1), map: clamp(c[1] | 0, 0, MAPNAMES.length - 1), bots: c[2] | 0, limit: c[3] | 0, skill: c[4] | 0, ff: !!c[5], weather: WEATHERS[c[6]] || 'clear' }; }
/* who is who: a player number (or a bot name), colour and team for every soldier, in order */
function netRoster() {
  NET.names = {}; for (const s of M.sol) if (s.player) NET.names[s.player.id] = s.name;
  NET.roster = M.sol.map(s => pk(s.player ? s.player.id + 1 : 0, 1) + pk(s.player ? 0 : BOTNAMES.indexOf(s.name), 1) + pk(COLORS.indexOf(s.color), 1) + pk(s.team, 2) + pk(s.dark ? 1 : 0, 1)).join('');
}
function readRoster(str) { const ro = new Rd(str), out = []; while (!ro.end) out.push({ pid: ro.u(1) - 1, ni: ro.u(1), color: COLORS[ro.u(1)] || 'red', team: ro.u(2), dark: !!ro.u(1) }); return out; }
function netLobbyInfo() {
  const inMatch = M && !M.demo && state !== 'lobby';
  return { st: inMatch ? 'play' : 'lobby', c: NET.code, mj: CFG.midjoin ? 1 : 0, cfg: [...cfgPack(CFG), CFG.teamColors === 'classic' ? 0 : 1, CFG.board ? 1 : 0, CFG.midjoin ? 1 : 0, CFG.pub === false ? 0 : 1, CFG.fog === 'off' ? 0 : 1],
    pl: PLAYERS.map(p => [p.id, isNet(p) ? p.dev.peer : '', p.color, p.team, p.ready ? 1 : 0, isNet(p) ? 'net' : p.dev.type, p.name || '']) };
}
/* the whole match in a few kilobytes */
function netSnap() {
  const now = netNow(), S = [];
  for (const s of M.sol) {
    if (!s.alive) { S.push('A'); continue; }
    const W_ = s.w ? cw(s) : null, vi = s.veh ? M.vehicles.indexOf(s.veh) : -1;
    const fA = 1 | (s.stance === 1 ? 2 : 0) | (s.swim ? 4 : 0) | (s.torch ? 8 : 0) | (s.ads ? 16 : 0) | (s.protect > 0 ? 32 : 0);
    const fB = (s.thrownSmoke ? 1 : 0) | (s.handT > 0 ? 2 : 0) | (s.meleeT > 0 ? 4 : 0) | (s.spotT > 0 && s.spotTeam === 0 ? 8 : 0) | (s.spotT > 0 && s.spotTeam === 1 ? 16 : 0) | (W_ && W_.mag > 0 ? 32 : 0);
    S.push(pk(fA, 1) + pk(fB, 1) + pk(Math.max(0, s.throwT) / 0.35 * 63, 1) + pk(Math.max(0, s.jumpT) / 0.42 * 63, 1) + pk(s.x, 2) + pk(s.y, 2) + angE(s.a) + pk(W_ ? WPNK.indexOf(W_.id) : 0, 1) + pk((s.shotN || 0) % 64, 1) + pk(vi >= 0 ? vi * 4 + s.seat + 1 : 0, 1) + pk(s.kit | (s.lamp ? 32 : 0), 1));     // kit, and 32: flashlight on
  }
  const V = M.vehicles.map(v => {
    if (!v.active) return 'A';
    const fl = 1 | (v.dead ? 2 : 0) | (v.hitFlash > 0 ? 4 : 0) | (v.over > 0 ? 8 : 0) | (v.lights ? 16 : 0);
    return pk(fl, 1) + pk(v.x, 2) + pk(v.y, 2) + angE(v.a) + angE(v.ta) + angE(v.mgA) + pk(v.hp, 2) + pk(v.recoil * 63, 1) + pk(Math.min(1, v.heat) * 63, 1) + pk(Math.max(0, v.cd) / 2.3 * 63, 1) + pk((clamp(v.spd / v.T.maxF, -1, 1) + 1) * 31.5, 1) + pk((v.cN || 0) % 64, 1) + pk((v.mN || 0) % 64, 1);
  }).join('');
  let P = '', np = 0;
  for (const p of M.proj) {
    if (p.k === 'bullet' || np >= 30) continue;
    if (!p.nid) p.nid = NET.pid = NET.pid % 4095 + 1;
    np++;
    const k = p.k === 'rocket' ? 0 : p.k === 'shell' ? 1 : p.smoke ? 3 : 2;
    P += pk(k, 1) + pk(p.nid, 2) + pk(p.x, 2) + pk(p.y, 2) + (k < 2 ? angE(Math.atan2(p.vy, p.vx)) : pk(p.vx / 14 + 32, 1) + pk(p.vy / 14 + 32, 1) + pk(p.h, 1) + pk(p.life * 20, 1));
  }
  const F = M.flags.map(f => pk((f.owner + 1) | (f.contested ? 4 : 0), 1) + pk((f.prog + 1) * 31.5, 1)).join('');
  const pv = {};
  for (const p of PLAYERS) if (isNet(p) && p.sol) {
    const s = p.sol, w = s.w || [{ id: WPNK[0], mag: 0, res: 0 }, { id: WPNK[0], mag: 0, res: 0 }];
    pv[p.id] = [Math.ceil(Math.max(0, s.hp)), Math.max(0, Math.round(s.respawnT * 10)), s.wi, WPNK.indexOf(w[0].id), w[0].mag, w[0].res, WPNK.indexOf(w[1].id), w[1].mag, w[1].res, s.nades, s.smokes || 0, s.mines, Math.max(0, Math.round(s.gcd * 10)), Math.round(s.gmax || 0), Math.max(0, Math.round(s.reloadT * 10)), Math.round((s.reloadMax || 0) * 10), s.throwSel || 0,
      Math.max(0, Math.round(s.hitT * 100)) + (s.hitT > 0 && s.hitV ? 100 : 0), Math.max(0, Math.round(s.hurtT * 100)), Math.max(0, Math.round(s.seatT * 100)), Math.round((s.seatMax || 0.5) * 100), s.msg ? String(s.msg.txt).slice(0, 40) : '', s.msg ? Math.round(s.msg.t * 10) : 0, s.netCorr | 0, s.veh ? s.veh.netCorr | 0 : 0];
  }
  // each event rides in four snapshots in a row: a lost packet or two never loses it, and it doesn't bloat every packet
  const E = []; for (const e of NET.evLog) if ((e.n | 0) < 4 && now - e.t < 700) { e.n = (e.n | 0) + 1; E.push([e.id, Math.round((now - e.t) / 10), ...e.a]); }
  const g = { id: NET.matchId, q: ++NET.seq, t: now, S: S.join(''), V, P, F, T: [M.tickets[0], M.tickets[1]], o: M.over ? [M.winner, M.winnerSol ? M.sol.indexOf(M.winnerSol) : -1] : 0, E };
  if (M.coop) { g.WV = [M.wv.n, M.wv.left, Math.ceil(M.wv.brk * 10)]; g.D = M.sol.map((s, i) => s.alive && s.down ? [i, Math.ceil(s.bleed), Math.round(s.rev * 100)] : 0).filter(Boolean); }
  return { g, pv };
}
/* what changes slowly (or never): sent four times a second beside the fast snapshots */
function netSnapSlow() {
  let I = '', ni = 0;
  for (const it of M.items) { if (ni++ >= 40) break; I += pk(['med', 'ammo', 'mine', 'pouch'].indexOf(it.k), 1) + pk(it.x, 2) + pk(it.y, 2) + pk(it.team < 0 ? 4095 : it.team, 2); }
  let C = ''; for (let i = 0; i < M.crates.length; i += 6) { let b = 0; for (let j = 0; j < 6 && i + j < M.crates.length; j++) if (M.crates[i + j].live) b |= 1 << j; C += B64[b]; }
  const Wr = M.wrecks.map(w => pk(w.type === 'tank' ? 2 * ((w.tr | 0) + 1) : 1 + 2 * ((w.bw | 0) + 1 + (w.bf ? 5 : 0)), 1) + pk(w.x, 2) + pk(w.y, 2) + angE(w.a) + angE(w.ta || 0) + pk(w.t * 10, 2)).join('');
  const R = M.sol.map(s => pk(s.pts, 3) + pk(s.k, 2) + pk(s.d, 2) + pk(s.caps, 1) + pk(s.vk, 1)).join('');
  const gs = { id: NET.matchId, q: ++NET.seqS, h: NET.hdr, ro: NET.roster, nm: NET.names, I, C, W: Wr, R };
  if (NET.bn && Object.keys(NET.bn).length) gs.bn = NET.bn;
  if (M.over) gs.A = M.sol.map(s => pk(s.heal, 2) + pk(s.rep, 2) + pk(s.longest / 2, 2) + pk(s.rk, 1)).join('');
  return gs;
}
function netHostTick(now) {
  if (!NET.game) return;
  const inMatch = M && !M.demo && (state === 'play' || state === 'pause' || state === 'end' || (SET.open && SET.from === 'pause'));
  const L = netLobbyInfo();
  netListPub(now, L);
  if (now - NET.sendT < 33) return; NET.sendT = now;
  const live = inMatch && PLAYERS.some(isNet), slow = !live || now - NET.slowT > 240;
  const pres = {};
  if (live) {
    const { g, pv } = netSnap(); pres.g = g;
    if (slow) { pres.gs = netSnapSlow(); pres.L = L; NET.slowT = now; }
    if (NET.game.perPeer) {
      // direct links: each joiner gets only their own HUD numbers
      const per = {}; for (const p of PLAYERS) if (isNet(p) && pv[p.id]) per[p.dev.peer] = { pv: [p.id, pv[p.id]] };
      // the slow half goes in its own message, so the fast one always fits in a single packet
      if (pres.gs) { NET.game.presence({ L: pres.L, gs: pres.gs }).catch(netErr); delete pres.L; delete pres.gs; }
      NET.maxSnap = Math.max(NET.maxSnap, JSON.stringify(pres).length + 160);
      NET.game.presence(pres, per).catch(netErr); return;
    }
    g.pv = pv;
    if (pres.gs) NET.gs = pres.gs;
  } else { pres.L = L; pres.g = null; }
  const js = JSON.stringify(pres);
  if (js === NET.lastPres) return;
  NET.lastPres = js; NET.maxSnap = Math.max(NET.maxSnap, js.length);
  NET.game.presence(pres).catch(netErr);
}

/* ================= client side ================= */
function netClientSee(P) {
  NET.lastHostT = performance.now();
  if (P.L) netClientLobby(P.L);
  if (P.gs && P.gs !== NET.gsRaw) netRecvSlow(P.gs);
  if (P.g) netRecvSnap(P.g, Array.isArray(P.pv) && P.pv[0] === NET.myPid ? P.pv[1] : null);
}
function netClientLobby(L) {
  NET.lobby = L;
  const pl = Array.isArray(L.pl) ? L.pl : [], mine = pl.find(e => e[1] === NET.myPeer);
  NET.joined = !!mine; if (mine) { NET.myPid = mine[0]; NET.wasJoined = true; }
  if (state === 'lobby') {
    PLAYERS = pl.map(e => ({ id: e[0], dev: e[1] === NET.myPeer ? NET.dev : { type: 'net', peer: e[1], kind: e[5] }, color: e[2], team: e[3], ready: !!e[4], mine: e[1] === NET.myPeer, kit: 0, var: 0, name: cleanName(e[6]).trim() }));
    // our own picks show at once; lobby updates sent before the host saw them would otherwise flip them back (then forward again)
    const me = PLAYERS.find(p => p.mine), W8 = NET.want, nw = performance.now(), hold = (k, v, set) => { if (!W8[k]) return; if (v() || nw - W8[k] > 2000) W8[k] = 0; else set(); };
    if (me) { hold('cT', () => me.color === W8.c, () => me.color = W8.c); hold('tT', () => me.team === W8.t, () => me.team = W8.t); hold('rT', () => me.ready === !!W8.r, () => me.ready = !!W8.r); }
    if (L.cfg && L.cfg[1] !== NET.demoMap) { NET.demoMap = L.cfg[1]; withHostCfg(() => demoMatch()); }
    if (NET.wasJoined && !mine) { netFail(504); return; }
    // not let in: a full game says so; a match under way gives the host a moment (it lets in late joiners, or a player it knows)
    const nw2 = performance.now(); if (!NET.firstL) NET.firstL = nw2;
    if (!mine && pl.length >= MAXP && nw2 - NET.joinT > 2500) { netFail(502); return; }
    if (!mine && L.st === 'play' && nw2 - NET.firstL > (L.mj ? 9000 : 4000)) { netFail(503); return; }
  }
  if (L.st === 'lobby' && (state === 'play' || state === 'pause' || state === 'end')) netClientToLobby();
}
function netClientToLobby() {
  NET.doneMatch = Math.max(NET.doneMatch | 0, NET.curMatch);          // that match is over here, whatever late packets say
  engineKillAll(); SET.open = false; NET.curMatch = -1; NET.buf = []; NET.evq = []; NET.pmap.clear(); NET.bul = []; NET.me = null; NET.want.r = 0; NET.dep = null; NET.demoMap = -1;
  setState('lobby'); Music.mode = 'menu';
  if (NET.lobby) netClientLobby(NET.lobby);
}
/* match settings shown in a joiner's lobby are the host's, without touching the joiner's own saved settings */
function withHostCfg(fn) {
  if (NET.role !== 'client' || !NET.lobby || !NET.lobby.cfg) return fn();
  const keep = { mode: CFG.mode, map: CFG.map, bots: CFG.bots, limit: CFG.limit, skill: CFG.skill, ff: CFG.ff, board: CFG.board, weather: CFG.weather, teamColors: CFG.teamColors, midjoin: CFG.midjoin, pub: CFG.pub, fog: CFG.fog }, c = NET.lobby.cfg;
  Object.assign(CFG, cfgUnpack(c), { teamColors: c[7] ? 'player' : 'classic', board: !!c[8], midjoin: c[9] === undefined ? true : !!c[9], pub: c[10] !== 0, fog: c[11] === 0 ? 'off' : 'los' });
  try { return fn(); } finally { Object.assign(CFG, keep); }
}
/* the slow half: match header and roster (to start the match), scoreboard, items, crates, wrecks */
function netRecvSlow(gs) {
  NET.gsRaw = gs;
  if (typeof gs.q !== 'number' || (NET.gs && gs.id === NET.gs.id && gs.q <= NET.gs.q)) return;
  NET.gs = gs; NET.slow = null;
}
function netSlowApply() {
  const gs = NET.gs; if (!gs || gs.id !== NET.curMatch) return null;
  if (typeof gs.ro === 'string' && gs.ro !== NET.roApplied) netRosterSync(gs);
  if (NET.slow) return NET.slow;
  // players who left: their soldier is a bot now, under its stand-in name
  if (gs.bn) for (const i in gs.bn) { const s = M.sol[i | 0]; if (s && s.player && s !== (NET.me && NET.me.sol)) { PLAYERS = PLAYERS.filter(p => p !== s.player); s.player = null; } if (s) s.name = cleanName(gs.bn[i]).trim() ? String(gs.bn[i]).slice(0, 18) : s.name; }
  const I = [], ri = new Rd(gs.I);
  while (!ri.end) { const k = ri.u(1), x = ri.u(2), y = ri.u(2), t = ri.u(2); I.push({ k: ['med', 'ammo', 'mine', 'pouch'][k] || 'pouch', x, y, team: t === 4095 ? -1 : t, t: 9 }); }
  const W2 = [], rw = new Rd(gs.W);
  while (!rw.end) { const k = rw.u(1), x = rw.u(2), y = rw.u(2), a = angD(rw.u(2)), ta = angD(rw.u(2)), t = rw.u(2) / 10, T = wreckBox(k & 1 ? 'jeep' : 'tank'); W2.push({ type: k & 1 ? 'jeep' : 'tank', tr: k & 1 ? 0 : (k >> 1) - 1, x, y, a, ta, t, T: 180, burn: t - 166, hl: T[0], hw: T[1], bw: k & 1 ? (k >> 1) % 5 - 1 : -1, bf: k >> 1 >= 5 }); }
  return NET.slow = { I, W: W2, C: String(gs.C || ''), R: String(gs.R || ''), A: gs.A };
}
/* joiner: someone joined or left mid-match: soldiers change hands (or a new one appears) to match the host's roster */
function netRosterSync(gs) {
  NET.roApplied = gs.ro;
  const me = NET.me && NET.me.sol;
  readRoster(gs.ro).forEach(({ pid, ni, color, team, dark }, i) => {
    let s = M.sol[i];
    if (!s) { s = makeSoldier({ team, color, name: BOTNAMES[ni] || 'Bot', bot: true }); s.alive = false; s.respawnT = 0; M.sol.push(s); }
    if (s === me) return;
    if (pid >= 0 && (!s.player || s.player.id !== pid)) {
      let pl = PLAYERS.find(p => p.id === pid && p !== NET.me);
      if (!pl) { pl = { id: pid, dev: { type: 'net', peer: '' }, color, team, ready: true }; PLAYERS.push(pl); }
      if (pl.sol && pl.sol !== s && pl.sol.player === pl) pl.sol.player = null;
      pl.sol = s; pl.color = color; pl.team = team; s.player = pl; s.bot = null;
      s.name = cleanName(gs.nm && gs.nm[pid]).trim() || 'P' + (pid + 1);
    } else if (pid < 0 && s.player) { const op = s.player; s.player = null; if (op.sol === s) PLAYERS = PLAYERS.filter(p => p !== op); }
    s.color = color; s.team = team; s.dark = dark;
  });
}
function netRecvSnap(g, pv) {
  if (typeof g.q !== 'number' || g.q === NET.lastSeq) return;
  if (g.id <= (NET.doneMatch | 0)) return;
  if (g.id === NET.curMatch && g.q < NET.lastSeq) return;
  if (g.id !== NET.curMatch && (!NET.gs || NET.gs.id !== g.id)) return;      // a new match starts once its roster is here
  NET.lastSeq = g.q;
  const now = performance.now(), o = g.t - now;
  if (NET.off === null || o > NET.off || g.id !== NET.curMatch) NET.off = o; else NET.off += (o - NET.off) * 0.02;
  if (g.id !== NET.curMatch) { if (!(state === 'lobby' || state === 'play' || state === 'pause' || state === 'end') || !netClientStart(NET.gs)) return; }
  NET.lastSnapT = now; NET.snapN = (NET.snapN | 0) + 1;
  const snap = netDecode(g, pv || (g.pv ? g.pv[NET.myPid] : null)); NET.buf.push(snap); if (NET.buf.length > 14) NET.buf.shift();
  if (Array.isArray(g.E)) for (const e of g.E) if (e[0] > NET.lastEv) { NET.lastEv = e[0]; NET.evq.push({ t: g.t - e[1] * 10, a: e.slice(2) }); }
  if (NET.evq.length > 300) NET.evq.splice(0, NET.evq.length - 300);
}
function netClientStart(g) {
  const h = g.h || [], roster = readRoster(g.ro);
  if (NET.myPid < 0 || !roster.some(r => r.pid === NET.myPid)) return false;            // we're not in this match (yet)
  const cfg = Object.assign(cfgUnpack(h), { teamColors: h[9] ? 'player' : 'classic', camera: CFG.camera, fog: h[10] === 0 ? 'off' : 'los' });
  PLAYERS = roster.filter(r => r.pid >= 0).map(r => r.pid === NET.myPid ? { id: r.pid, dev: NET.dev, color: r.color, team: r.team, ready: true, kit: 0, var: 0 } : { id: r.pid, dev: { type: 'net', peer: '' }, color: r.color, team: r.team, ready: true });
  NET.me = PLAYERS.find(p => p.id === NET.myPid);
  newMatch(cfg, false);
  const tc = [COLORS[h[7]] || 'blue', COLORS[h[8]] || 'red']; M.teamColor = tc; TEAMHEX = tc.map(c => CHEX[c]);
  TEAMNAME = teamNames(cfg, false, M.ffa, tc); buildRings();
  M.sol = roster.map(r => {
    const pl = r.pid >= 0 ? PLAYERS.find(p => p.id === r.pid) : null;
    const s = makeSoldier({ team: r.team, color: r.color, name: pl ? (cleanName(g.nm && g.nm[r.pid]).trim() || 'P' + (r.pid + 1)) : (BOTNAMES[r.ni] || 'Bot'), player: pl, bot: !pl });
    s.dark = r.dark; s.respawnT = 0; s.alive = false; if (pl) { pl.sol = s; s.firstDeploy = true; }
    return s;
  });
  const me = NET.me.sol; if (NET.kitPick) Object.assign(me, NET.kitPick);
  Object.assign(NET, { curMatch: g.id, buf: [], evq: [], bul: [], lastA: null, dep: null, lastI: null, selfD: null, roApplied: g.ro });
  NET.pmap.clear();
  layoutViews(); SET.open = false; setState('play'); Music.mode = 'battle'; ev('match.start');
  return true;
}
function netDecode(g, pv) {
  const sl = netSlowApply() || { I: [], W: [], C: '', R: '', A: null };     // first: a roster change can add soldiers
  const prev = NET.buf[NET.buf.length - 1], pdt = prev ? Math.max(0.01, (g.t - prev.t) / 1000) : 0;
  const S = [], r = new Rd(g.S);
  for (let i = 0; i < M.sol.length; i++) {
    const fA = r.u(1); if (!(fA & 1)) { S.push(null); continue; }
    const fB = r.u(1), thr = r.u(1), jmp = r.u(1), x = r.u(2), y = r.u(2), a = angD(r.u(2)), w = r.u(1), sh = r.u(1), st = r.u(1), kit = r.u(1);
    const o = { fA, fB, thr: thr / 63 * 0.35, jmp: jmp / 63 * 0.42, x, y, a, w: WPNK[w] || WPNK[0], sh, vi: st ? (st - 1) >> 2 : -1, seat: st ? (st - 1) & 3 : -1, kit: clamp(kit & 31, 0, KITS.length - 1), lamp: !!(kit & 32), vx: 0, vy: 0 };
    const q = prev && prev.S[i]; if (q && q.vi === o.vi && pdt) { o.vx = (x - q.x) / pdt; o.vy = (y - q.y) / pdt; if (Math.hypot(o.vx, o.vy) > 400) o.vx = o.vy = 0; }
    S.push(o);
  }
  const V = [], rv = new Rd(g.V);
  for (let i = 0; i < M.vehicles.length; i++) {
    const fl = rv.u(1); if (!(fl & 1)) { V.push(null); continue; }
    const o = { fl, x: rv.u(2), y: rv.u(2), a: angD(rv.u(2)), ta: angD(rv.u(2)), mgA: angD(rv.u(2)), hp: rv.u(2), rec: rv.u(1) / 63, heat: rv.u(1) / 63, cd: rv.u(1) / 63 * 2.3, spd: rv.u(1) / 31.5 - 1, cN: rv.u(1), mN: rv.u(1), vx: 0, vy: 0 };
    const q = prev && prev.V[i]; if (q && pdt) { o.vx = (o.x - q.x) / pdt; o.vy = (o.y - q.y) / pdt; if (Math.hypot(o.vx, o.vy) > 600) o.vx = o.vy = 0; }
    V.push(o);
  }
  const P = [], rp = new Rd(g.P);
  while (!rp.end) {
    const k = rp.u(1), id = rp.u(2), x = rp.u(2), y = rp.u(2);
    if (k < 2) { const a = angD(rp.u(2)), sp = k ? 760 : 480; P.push({ k, id, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }); }
    else P.push({ k, id, x, y, vx: (rp.u(1) - 32) * 14, vy: (rp.u(1) - 32) * 14, h: rp.u(1), life: rp.u(1) / 20 });
  }
  return { t: g.t, S, V, P, I: sl.I, W: sl.W, C: sl.C, F: String(g.F || ''), T: g.T, WV: g.WV, D: g.D, o: g.o, R: sl.R, A: sl.A, pv: pv || null };
}
function netPair(T) {
  const B = NET.buf; if (!B.length) return null;
  if (T <= B[0].t) return [B[0], B[0], 0, 0];
  for (let i = B.length - 1; i >= 0; i--) if (B[i].t <= T) { const a = B[i], b = B[i + 1]; if (!b) return [a, a, 0, Math.min(0.15, (T - a.t) / 1000)]; return [a, b, (T - a.t) / Math.max(1, b.t - a.t), 0]; }
  return [B[0], B[0], 0, 0];
}
function netClientUpdate(dt) {
  if (!M || M.demo || NET.curMatch < 0 || !NET.me) return;
  const now = performance.now();
  M.time += dt; if (M.over) M.overT += dt;
  if (!NET.buf.length) { updateCams(dt); return; }
  const To = now + NET.off - NET_DELAY;
  netApplyEvents(To);
  const me = NET.me, s = me.sol;
  // read the controls first: our own aim and (on foot) our own movement answer them this frame, not a round trip later
  NET.lastI = state === 'play' && s.alive && !s.down && !M.over ? humanInput(me) : null;
  netApplySnaps(now, dt);
  netWrecksStep(dt);
  if (NET.lastI) {
    const I = NET.lastI; netCount(I);
    if (NET.auth && s.alive && !s.veh) netLocalMove(s, I, dt);
    else if (NET.vauth && s.alive && s.veh === NET.vauth && s.seat === 0) netLocalDrive(NET.vauth, I, dt);
    if (s.alive) netPredictShot(s, I, dt);
  }
  else {
    NET.pred = 0;
    if (!s.alive && !M.over) { if (s.deathT > 0) { s.deathT -= dt; trackKiller(s); } else if (state === 'play') deployInput(s, dt); }
  }
  for (const w of M.wrecks) w.t -= dt;              // the fade runs smoothly between the host's wreck updates
  netCosmetics(dt);
  updateCams(dt);
}
function netCount(I) {
  const K = ['jump', 'reload', 'alt', 'nadeCyc', 'gadgetP', 'enter', 'melee', 'spot', null, 'swapW', 'seatNext'];
  for (let i = 0; i < K.length; i++) if (K[i] && I[K[i]]) NET.cc[i]++;
  if (I.proneT || I.stanceCycle) NET.cc[8]++;
  if (I.seatDir >= 0) { NET.cc[11]++; NET.sd = I.seatDir; }
  if (I.seatIdx >= 0) { NET.cc[12]++; NET.si = I.seatIdx; }
  if (I.pickW >= 0) { NET.cc[13]++; NET.pw = I.pickW; }
  if (I.lamp) NET.cc[14]++;
}
function netDeployReq(s, opt) {
  NET.dep = { n: ++NET.depN, k: s.kit, v: s.var || 0, sc: s.sec || 0, nt: s.nt || 0, o: opt ? opt.name : '' };
  NET.kitPick = { kit: s.kit, var: s.var || 0, sec: s.sec || 0, nt: s.nt || 0 };
  ev('menu');
}
function netClientTick(now) {
  if (!NET.game) return;
  if (!NET.joined && !NET.wasJoined) {
    // a join that stalls fails with the step it stalled at: no answer from the host after 15 s, anything else after 22 s
    const tr = NET.trace, el = now - NET.joinT;
    if (tr && tr.ack && !tr.answer && el > 15000) { netFail(202); return; }
    if (el > 22000) { netFail(tr ? traceCode(tr) : 501); return; }
  } else if (now - NET.lastHostT > 20000) { netHostGone(601); return; }
  if (now - NET.sendT < 33) return; NET.sendT = now;
  const I = NET.lastI;
  const i = I ? { m: [Math.round(I.mx * 100), Math.round(I.my * 100)], a: typeof I.aimA === 'number' ? Math.round(I.aimA * 1000) : null, f: I.fire ? 1 : 0, ad: I.ads ? 1 : 0, sp: I.sprint ? 1 : 0, g: I.gadget ? 1 : 0, ds: Math.round(I.altDist || 0), is: I.interactSwap ? 1 : 0, c: NET.cc, sd: NET.sd, si: NET.si, pw: NET.pw } : { c: NET.cc };
  const ms = NET.me && NET.me.sol; i.ca = NET.corr | 0;
  if (I && ms && ms.alive) { i.ct = Math.round(performance.now()); if (NET.off !== null) i.vt = Math.round(performance.now() + NET.off - NET_DELAY); }
  if (I && NET.auth && ms && ms.alive && !ms.veh) i.p = [ms.x, ms.y, ms.vx, ms.vy, Math.max(0, ms.jumpT)].map(v => Math.round(v * 100) / 100);
  const vv = NET.vauth;
  if (I && vv && ms && ms.alive && ms.veh === vv && ms.seat === 0) { i.vp = [vv.x, vv.y, vv.a, vv.vx, vv.vy, vv.spd, vv.av || 0, vv.tRel || 0].map(v => Math.round(v * 100) / 100); i.vca = NET.vcorr | 0; }
  const pres = { j: { c: NET.want.c, cn: NET.want.cn | 0, t: NET.want.t, tn: NET.want.tn | 0, r: NET.want.r, n: NET.name, id: NET.cid }, i, d: NET.dep, rd: NET.rd | 0 };
  const js = JSON.stringify(pres); if (js === NET.lastPres) return; NET.lastPres = js;
  NET.game.presence(pres).catch(netErr);
}
function netTick() {
  if (NET.msgT > 0) NET.msgT -= 1 / 60;
  netListWatch(state === 'netmenu' && !NET.role && NET.mode === 'p2p');      // the server list is live while the online menu is up
  if (!NET.role) return;
  const now = performance.now();
  if (NET.role === 'host') netHostTick(now); else netClientTick(now);
}

/* ---------- applying the host's picture ---------- */
function netApplyEvents(To) {
  const me = NET.me && NET.me.sol, keep = [];
  for (const e of NET.evq) {
    const a = e.a, now = a[0] === 'pp' || a[0] === 'ps' || (a[0] === 'k' && M.sol[a[1]] === me);
    if (now || e.t <= To) { try { netDoEv(a, e.t); } catch (er) { console.error(er); } } else keep.push(e);
  }
  NET.evq = keep;
}
function netDoEv(a, t) {
  switch (a[0]) {
    case 'x': explosionFx(a[1], a[2], a[3], !!a[4], EVBOOM[a[5]]); break;
    case 'e': evNet(a); break;
    case 'd': { const s = MAP.statics[a[1]]; if (s) destroyStatic(s); break; }
    case 'k': netKillFx(a, t); break;
    case 'f': M.feed.unshift({ a: a[1] ? { n: String(a[1]), c: a[2] } : null, how: String(a[3]), b: { n: String(a[4]), c: a[5] }, t: 6 }); if (M.feed.length > 6) M.feed.length = 6; break;
    case 'b': for (let i = 0; i < 2; i++) blood(a[1], a[2], a[3], a[4]); break;
    case 't': { M.toasts.push({ txt: String(a[1]), c: String(a[2]), t: +a[3] || 2.5 }); break; }
    case 'pp': if (NET.me && a[1] === NET.me.id && NET.me.sol) { const s = NET.me.sol; s.pops.unshift({ txt: String(a[2]), t: 1.8 }); if (s.pops.length > 4) s.pops.length = 4; ev('points', undefined, undefined, { s, n: parseInt(String(a[2]).slice(1)) || 0 }); } break;
    case 'sm': popSmoke(a[1], a[2], {}); break;
    case 'sd': { const sec = MAP.secs[a[1]]; if (sec) devDamage(sec, sec.hp - a[2] / 10, a[3], a[4], true); break; }     // a wall section's hp
  }
}
function netKillFx(a, t) {
  const s = M.sol[a[1]]; if (!s) return; const x = a[3], y = a[4];
  if (a[2] === 1) { const ang = a[5] / 100, sp = a[6]; M.flings.push({ color: s.color, dark: s.dark, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, T: rnd(0.7, 1.0), rot: rnd(0, TAU), vr: rnd(-12, 12) }); ev('soldier.death', x, y, { s, fling: 1, swim: 0 }); }
  else if (a[2] === 2) { for (let i = 0; i < 6; i++) part({ k: 'steam', x, y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 1, max: 1, sz: 8, drag: 2 }); ev('soldier.death', x, y, { s, fling: 0, swim: 1 }); }
  else { const ang = a[6] / 100; addCorpse(s.color, s.dark, x, y, a[5] / 100); for (let i = 0; i < 6; i++) blood(x, y, Math.cos(ang), Math.sin(ang)); ev('soldier.death', x, y, { s, fling: 0, swim: 0 }); }
  s.alive = false; s.veh = null; s.seat = -1; s.torch = false; s._deadT = t;
  if (NET.me && s === NET.me.sol) {
    const k = a[7] >= 0 ? M.sol[a[7]] : null;
    s.deathT = performance.now() - (NET.rdT || -1e9) < 3000 ? 0 : 2.2; s.deployIdle = 0; rumble(NET.me, 1, 0.4);
    s.killer = k ? { sol: k, veh: k.veh || null, x: k.veh ? k.veh.x : k.x, y: k.veh ? k.veh.y : k.y, name: k.name, color: k.color } : null;
  }
}
function netApplySnaps(now, dt) {
  const hostNow = now + NET.off, To = hostNow - NET_DELAY, Ts = hostNow - 20;
  const po = netPair(To), ps = netPair(Ts); if (!po) return;
  const me = NET.me.sol, mi = M.sol.indexOf(me), nb = NET.buf[NET.buf.length - 1], myRec = nb.S[mi], myVi = myRec ? myRec.vi : -1;
  // ---- vehicles
  for (const v of M.vehicles) v.seats.fill(null);
  M.vehicles.forEach((v, i) => {
    // riding along: the same smooth, slightly-behind picture as everything else; only a driver without their own control uses the newest one
    const [a, b, k, ext] = i === myVi && myRec.seat === 0 && NET.vauth !== v ? ps : po, ra = a.V[i], rb = b.V[i];
    if (!ra) { v.active = false; if (NET.vauth === v) NET.vauth = null; return; }
    const keep = NET.vauth === v ? { x: v.x, y: v.y, a: v.a, ta: v.ta, tRel: v.tRel, vx: v.vx, vy: v.vy, spd: v.spd, av: v.av, rev: v.rev } : null;
    if (!v.active) { v.active = true; v.netPos = false; if (v.netSeen) for (let j = 0; j < 12; j++) part({ k: 'dust', x: ra.x + rnd(-40, 40), y: ra.y + rnd(-25, 25), vx: rnd(-30, 30), vy: rnd(-30, 30), life: 1, max: 1, sz: 16, drag: 2 }); }
    v.netSeen = true;
    const px = v.x, py = v.y, pa = v.a, lr = rb && rb !== ra && Math.hypot(rb.x - ra.x, rb.y - ra.y) < 200 ? rb : null;
    if (lr) { v.x = lerp(ra.x, lr.x, k); v.y = lerp(ra.y, lr.y, k); v.a = lerpAng(ra.a, lr.a, k); v.ta = lerpAng(ra.ta, lr.ta, k); v.mgA = lerpAng(ra.mgA, lr.mgA, k); }
    else { v.x = ra.x + ra.vx * ext; v.y = ra.y + ra.vy * ext; v.a = ra.a; v.ta = ra.ta; v.mgA = ra.mgA; }
    v.dead = !!(ra.fl & 2); v.hp = ra.hp; v.recoil = ra.rec; v.heat = ra.heat; v.cd = ra.cd; v.spd = ra.spd * v.T.maxF; v.over = ra.fl & 8 ? 1 : 0; v.lights = !!(ra.fl & 16); if (ra.fl & 4) v.hitFlash = 0.08;
    v.vx = lr ? lerp(ra.vx, lr.vx, k) : ra.vx; v.vy = lr ? lerp(ra.vy, lr.vy, k) : ra.vy; v.tRel = angDiff(v.a, v.ta); v.mgRel = angDiff(v.type === 'tank' ? v.ta : v.a, v.mgA);
    if (v._cN === undefined) { v._cN = ra.cN; v._mN = ra.mN; }
    if (ra.cN !== v._cN) { v._cN = ra.cN; v._cfx = true; }
    if (ra.mN !== v._mN) { v._mfx = Math.min(3, (ra.mN - v._mN + 64) % 64); v._mN = ra.mN; }
    if (v.po) netPushOff(v, v.x, v.y, dt);
    const own = i === myVi && netOwnVeh(v, i, nb, mi);
    // just let go of the wheel (changed seat or got out): our own copy was ahead of the host's picture, so ease back to it instead of jumping
    if (!own && keep) v.vo = { x: keep.x - v.x, y: keep.y - v.y, a: angDiff(v.a, keep.a), ta: angDiff(v.ta, keep.ta) };
    if (v.vo && !own) {
      const O = v.vo, q = Math.exp(-dt / 0.3); O.x *= q; O.y *= q; O.a *= q; O.ta *= q;
      v.x += O.x; v.y += O.y; v.a += O.a; v.ta += O.ta; v.tRel = angDiff(v.a, v.ta);
      if (Math.hypot(O.x, O.y) < 0.3 && Math.abs(O.a) + Math.abs(O.ta) < 0.004) v.vo = null;
    } else if (own) v.vo = null;
    if (own === true && keep) Object.assign(v, keep);
    else if (v.netPos && v.T.drive && !own) vehTrackFx(v, Math.hypot(v.x - px, v.y - py) + Math.abs(angDiff(pa, v.a)) * 20);
    if (own) syncMounts(v);
    v.netPos = true;
  });
  if (myVi < 0 && NET.vauth) NET.vauth = null;
  // ---- soldiers
  const myTeam = me.team;
  M.sol.forEach((s, i) => {
    const mine = s === me, [a, b, k, ext] = mine ? ps : po, ra = a.S[i], rb = b.S[i];
    if (!ra) { if (s.alive) { s.alive = false; s.veh = null; s.seat = -1; s.torch = false; } return; }
    if (!s.alive) {
      if (s._deadT !== undefined && a.t <= s._deadT) return;            // the kill already played; wait for the next life
      s.alive = true; s.deathT = 0; s.walkT = 0; s._n = ra.sh; s.x = ra.x; s.y = ra.y; s.vx = s.vy = 0; s.firstDeploy = false; s.hp = s.mhp || 100; s.netPos = false;
    }
    const px = s.x, py = s.y, ovx = s.vx, ovy = s.vy, ojt = s.jumpT, lr = rb && rb !== ra && rb.vi === ra.vi && Math.hypot(rb.x - ra.x, rb.y - ra.y) < 150 ? rb : null;
    let tx, ty;
    if (lr) { tx = lerp(ra.x, lr.x, k); ty = lerp(ra.y, lr.y, k); s.a = lerpAng(ra.a, lr.a, k); s.vx = lerp(ra.vx, lr.vx, k); s.vy = lerp(ra.vy, lr.vy, k); }
    else { tx = ra.x + ra.vx * ext; ty = ra.y + ra.vy * ext; s.a = ra.a; s.vx = ra.vx; s.vy = ra.vy; }
    const own = mine && netOwnPos(s, i, nb, ra);
    if (own === true) { s.x = px; s.y = py; s.vx = ovx; s.vy = ovy; }
    else if (own) { /* just corrected: netOwnPos put us where the host says */ }
    else if (mine && s.netPos && ra.vi < 0 && Math.hypot(tx - px, ty - py) < 60) { const q = 1 - Math.exp(-dt * 22); s.x = lerp(px, tx, q); s.y = lerp(py, ty, q); } else { s.x = tx; s.y = ty; }
    s.netPos = true;
    s.stance = ra.fA & 2 ? 1 : 0; s.swim = !!(ra.fA & 4); s.torch = !!(ra.fA & 8); s.ads = !!(ra.fA & 16); s.protect = ra.fA & 32 ? 1 : 0;
    s.thrownSmoke = !!(ra.fB & 1); s.handT = ra.fB & 2 ? 0.3 : 0; s.kit = ra.kit; s.lamp = ra.lamp; s.handK = KITS[s.kit].g;
    if (ra.fB & 4) { if (!s._mel) { s.meleeT = 0.18; s._mel = 1; } } else s._mel = 0;
    s.spotT = (myTeam === 0 && ra.fB & 8) || (myTeam === 1 && ra.fB & 16) ? 1 : 0; s.spotTeam = myTeam;
    s.throwT = ra.thr; s.jumpT = mine && NET.auth ? ojt : ra.jmp;
    if (!mine || !a.pv) { s.w = [{ id: ra.w, mag: ra.fB & 32 ? 1 : 0, res: 0 }, { id: ra.w, mag: 0, res: 0 }]; s.wi = 0; }
    const v = ra.vi >= 0 ? M.vehicles[ra.vi] : null;
    if (v && v.active) {
      // climbing in or moving seats glides over like it does on the host, instead of popping across
      const ns = clamp(ra.seat, 0, v.seats.length - 1);
      if (s.veh === v && s.seat >= 0 && s.seat !== ns) { const to = seatLocal(v, s.seat); let fx = to[0], fy = to[1]; if (s.seatT > 0 && s.seatFrom) { const kk = 1 - s.seatT / s.seatMax, e = kk * kk * (3 - 2 * kk); fx = lerp(s.seatFrom[0], to[0], e); fy = lerp(s.seatFrom[1], to[1], e); } s.seatFrom = [fx, fy]; s.seatT = s.seatMax = 0.5; }
      else if (s.veh !== v) { s.seatFrom = s.netPos && Math.hypot(px - v.x, py - v.y) < 140 ? toLocal(v, px, py) : null; s.seatT = s.seatMax = 0.25; }
      else s.seatT = Math.max(0, s.seatT - dt);
      s.veh = v; s.seat = ns; v.seats[ns] = s;
    } else { s.veh = null; s.seat = -1; s.seatT = 0; }
    // walking animation, footprints and the little noises of moving
    stepFx(s, s.veh ? 0 : Math.hypot(s.x - px, s.y - py), Math.atan2(s.y - py, s.x - px), dt);
    if (s._n === undefined) s._n = ra.sh;
    if (ra.sh !== s._n) { s._sfx = Math.min(3, (ra.sh - s._n + 64) % 64); s._n = ra.sh; }
  });
  for (const s of M.sol) if (s.alive && s.veh) updateSeatedPos(s);
  // your own aim answers your hand straight away
  const I = NET.lastI;
  if (me.alive && I && typeof I.aimA === 'number') {
    if (!me.veh && me.stance !== 1) me.a = I.aimA;
    else if (me.veh) {
      const v = me.veh, role = v.T.seats[me.seat].role; if (role === 'rifle') me.a = I.aimA; if (role === 'drive' && v.type === 'tank') v.aimT = I.aimA;
      if (role === 'mg') {
        // the gun swings toward our hand here and now, at the host's turning speed, within its arc
        const base = v.type === 'tank' ? v.ta : v.a;
        if (NET.mgV !== v) { NET.mgV = v; NET.mgRel = angDiff(base, v.mgA); }
        NET.mgRel += clamp(angDiff(base + NET.mgRel, I.aimA), -7 * dt, 7 * dt); if (v.T.arc) NET.mgRel = clamp(NET.mgRel, -v.T.arc, v.T.arc);
        v.mgRel = NET.mgRel; v.mgA = base + NET.mgRel; me.a = v.mgA;
      } else NET.mgV = null;
    }
  }
  if (me.veh && (!I || typeof I.aimA !== 'number')) me.veh.aimT = undefined;
  // shots fire once everyone is in place
  // our own shots already played when we pulled the trigger: the host's echo of them is skipped
  while (me._sfx > 0 && NET.pred > 0) { me._sfx--; NET.pred--; NET.predT = performance.now(); }
  for (const s of M.sol) while (s._sfx > 0) { s._sfx--; netShotFx(s); }
  for (const v of M.vehicles) { if (v._cfx) { v._cfx = false; netCannonFx(v); } while (v._mfx > 0) { v._mfx--; netMgFx(v); } }
  // ---- projectiles (others' timeline)
  const [pa] = po, seen = new Set();
  if (M.coop) {                                    // downed players and the wave count
    for (const s of M.sol) s.down = false;
    for (const d of pa.D || []) { const s = M.sol[d[0]]; if (s && s.alive) { s.down = true; s.bleed = d[1]; s.rev = d[2] / 100; } }
    if (pa.WV) M.wv = { n: pa.WV[0], left: pa.WV[1], brk: pa.WV[2] / 10, lim: LIMITS.surv[M.cfg.limit] || 0 };
  }
  for (const r of pa.P) {
    let p = NET.pmap.get(r.id);
    if (!p) { p = { k: ['rocket', 'shell', 'nade', 'nade'][r.k], smoke: r.k === 3, nid: r.id, life: 1, h: 0, rot: 0, x: r.x, y: r.y, vx: r.vx, vy: r.vy }; NET.pmap.set(r.id, p); }
    const e = clamp((To - pa.t) / 1000, 0, 0.2); p.x = r.x + r.vx * e; p.y = r.y + r.vy * e; p.vx = r.vx; p.vy = r.vy;
    if (r.k >= 2) { p.h = r.h; p.life = r.life; p.rot += dt * 12; } else { p.life = 1; if (Math.random() < 0.8) part({ k: 'smoke', z: shotZ(p), x: p.x, y: p.y, vx: rnd(-10, 10), vy: rnd(-10, 10), life: 0.6, max: 0.6, sz: p.k === 'rocket' ? 7 : 5, drag: 2 }); }
    seen.add(r.id);
  }
  for (const [id, p] of NET.pmap) if (!seen.has(id)) { p.life = 0; NET.pmap.delete(id); }
  // ---- the slow stuff, once per new snapshot
  if (pa !== NET.lastA) {
    NET.lastA = pa;
    M.items = pa.I; netWrecksSync(pa.W);
    for (let i = 0; i < M.crates.length; i++) M.crates[i].live = !!((B64I[pa.C[i / 6 | 0]] || 0) & (1 << (i % 6)));
    M.flags.forEach((f, i) => { const o = B64I[pa.F[i * 2]] || 0, pr = B64I[pa.F[i * 2 + 1]] || 0; f.owner = (o & 3) - 1; f.contested = !!(o & 4); f.prog = clamp(pr / 31.5 - 1, -1, 1); if (Math.abs(f.prog) > 0.985) f.prog = Math.sign(f.prog); if (Math.abs(f.prog) < 0.02) f.prog = 0; });
    if (Array.isArray(pa.T)) M.tickets = [pa.T[0] | 0, pa.T[1] | 0];
    const rr = new Rd(pa.R); for (const s of M.sol) { if (rr.end) break; s.pts = rr.u(3); s.k = rr.u(2); s.d = rr.u(2); s.caps = rr.u(1); s.vk = rr.u(1); }
    if (pa.A) { const ra2 = new Rd(pa.A); for (const s of M.sol) { if (ra2.end) break; s.heal = ra2.u(2); s.rep = ra2.u(2); s.longest = ra2.u(2) * 2; s.rk = ra2.u(1); } }
    if (pa.o && !M.over) { M.over = true; M.overT = 0; M.winner = pa.o[0]; M.winnerSol = M.sol[pa.o[1]] || null; ev('match.end'); }
  }
  // ---- what only you see: health, ammo, cooldowns, messages
  const pv = ps[0].pv;
  if (pv) {
    if (me.alive) me.hp = pv[0]; me.respawnT = pv[1] / 10;
    if (me.alive) { me.wi = pv[2] ? 1 : 0; me.w = [{ id: WPNK[pv[3]] || WPNK[0], mag: pv[4], res: pv[5] }, { id: WPNK[pv[6]] || WPNK[0], mag: pv[7], res: pv[8] }]; }
    me.nades = pv[9]; me.smokes = pv[10]; me.mines = pv[11]; me.gcd = pv[12] / 10; me.gmax = pv[13]; me.reloadT = pv[14] / 10; me.reloadMax = pv[15] / 10; me.throwSel = pv[16];
    if (pv[17]) { me.hitT = Math.max(me.hitT, (pv[17] % 100) / 100); me.hitV = pv[17] >= 100; } if (pv[18]) me.hurtT = Math.max(me.hurtT, pv[18] / 100);
    // the seat-change countdown runs here between the host's numbers (so the glide is smooth); a big disagreement takes the host's
    if (pv !== NET.lastPv) { NET.lastPv = pv; const st = pv[19] / 100; me.seatMax = pv[20] / 100 || 0.5; if (st <= 0 || Math.abs(st - me.seatT) > 0.15) me.seatT = st; }
    if (pv[21]) { if (!me.msg || me.msg.txt !== pv[21]) me.msg = { txt: String(pv[21]), t: pv[22] / 10 }; }
  }
  M.proj = NET.bul.concat([...NET.pmap.values()]);
}
/* joiner: on foot we place ourselves. The host's position only wins when it says so (its correction counter moved:
   a respawn, a wall we shouldn't be in, a move it didn't believe), and then we carry on from there */
function netOwnPos(s, i, nb, ra) {
  const rl = nb.S[i], cn = nb.pv ? nb.pv[23] | 0 : -1;
  if (cn < 0 || !rl || rl.vi >= 0 || ra.vi >= 0 || M.over) { NET.auth = false; return false; }
  if (NET.auth && cn === NET.corr) return true;
  NET.corr = cn; NET.auth = true; s.x = rl.x; s.y = rl.y; s.vx = s.vy = 0; s.jumpT = 0; NET.corrN = (NET.corrN | 0) + 1;
  return 'snap';
}
/* the movement half of controlSoldier, for our own soldier on a joiner's screen */
function netLocalMove(s, I, dt) {
  s.swim = inWater(s.x, s.y);
  let mx = I.mx, my = I.my; const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  if (I.jump && s.jumpT <= 0 && !s.swim) { let dx = mx, dy = my; const l = Math.hypot(dx, dy); if (l < 0.2) { dx = Math.cos(s.a); dy = Math.sin(s.a); } else { dx /= l; dy /= l; } s.jumpT = 0.42; s.jdx = dx; s.jdy = dy; }
  const sprint = I.sprint && m > 0.3 && !I.fire && s.stance === 0 && !s.swim, ads = !!I.ads && !sprint && !s.swim, ice = onIce(s.x, s.y);
  const spd = (s.swim ? 40 : s.stance === 1 ? 34 : sprint ? 128 : s.torch ? 30 : 82) * (ads ? 0.6 : 1), k = 1 - Math.exp(-dt * (ice ? 3 : 14));
  s.vx = lerp(s.vx, mx * spd, k); s.vy = lerp(s.vy, my * spd, k);
  if (s.jumpT > 0) {
    s.jumpT -= dt; const along = s.vx * s.jdx + s.vy * s.jdy; if (along < 110) { s.vx += s.jdx * (110 - along); s.vy += s.jdy * (110 - along); }
    if (s.jumpT <= 0.04) { staticsNear(s.x, s.y, 20, _near); if (_near.some(o => LOW[o.type] && Math.hypot(o.x - s.x, o.y - s.y) < o.r + s.r) && s.jumpT > -0.4) s.jumpT = 0.05; else if (s.jumpT <= 0) s.jumpT = 0; }
  }
  if (I.melee && !s.swim && !(s.meleeL > M.time)) { s.meleeL = M.time + 0.7; s.vx += Math.cos(s.a) * 90; s.vy += Math.sin(s.a) * 90; }
  const x0 = s.x, y0 = s.y;
  s.x += s.vx * dt; s.y += s.vy * dt;
  soldierCollide(s);
  // other soldiers and vehicles: we step aside (the host does the same for them)
  for (const o of M.sol) { if (o === s || !o.alive || o.veh) continue; const dx = s.x - o.x, dy = s.y - o.y; if (Math.abs(dx) > 14 || Math.abs(dy) > 14) continue; const d = Math.hypot(dx, dy); if (d < 13 && d > 0.01) { s.x = o.x + dx / d * 13; s.y = o.y + dy / d * 13; } }
  for (const v of M.vehicles) {
    if (!v.active || Math.abs(s.x - v.x) > 80 || Math.abs(s.y - v.y) > 80) continue;
    pushOutVeh(s, s.r, v);
  }
  stepFx(s, Math.hypot(s.x - x0, s.y - y0), Math.atan2(s.vy, s.vx), dt);
}
/* joiner driving: our vehicle answers our hands here; the host's picture only wins when its correction counter moves */
function netOwnVeh(v, i, nb, mi) {
  const rl = nb.S[mi], rv = nb.V[i], cn = nb.pv && nb.pv.length > 24 ? nb.pv[24] | 0 : -1;
  if (cn < 0 || !rl || rl.vi !== i || rl.seat !== 0 || !v.T.drive || !rv || (rv.fl & 2) || M.over) { if (NET.vauth === v) NET.vauth = null; return false; }
  if (NET.vauth === v && cn === NET.vcorr) return true;
  NET.vauth = v; NET.vcorr = cn; NET.vcorrN = (NET.vcorrN | 0) + 1;
  Object.assign(v, { x: rv.x, y: rv.y, a: rv.a, ta: rv.ta, tRel: angDiff(rv.a, rv.ta), vx: rv.vx, vy: rv.vy, spd: rv.spd * v.T.maxF, av: 0, rev: false });
  return 'snap';
}
function netLocalDrive(v, I, dt) {
  const ox = v.x, oy = v.y, oa = v.a;
  vehDrive(v, I.mx, I.my, dt, true);
  if (v.type === 'tank' && typeof I.aimA === 'number') v.tRel += clamp(angDiff(v.ta, I.aimA), -1.7 * dt, 1.7 * dt);
  syncMounts(v);
  vehTrackFx(v, Math.hypot(v.x - ox, v.y - oy) + Math.abs(angDiff(oa, v.a)) * 20);
  for (const s of v.seats) if (s) updateSeatedPos(s);        // everyone aboard rides with it this same frame
}
/* joiner: something we shoved shows where we shoved it until the host's (later) picture has moved it as far */
function netPushOff(o, bx, by, dt) {
  const P = o.po;
  if (o._bx !== undefined) { const l = Math.hypot(P.x, P.y); if (l > 0.01) { const adv = Math.max(0, ((bx - o._bx) * P.x + (by - o._by) * P.y) / l), nl = Math.max(0, l - adv) * Math.exp(-dt / 1.5); P.x *= nl / l; P.y *= nl / l; } }
  o._bx = bx; o._by = by; o.x = bx + P.x; o.y = by + P.y;
  if (Math.hypot(P.x, P.y) < 0.05) { o.po = null; o._bx = undefined; }
}
/* joiner: wrecks are kept between the host's updates (4 a second) and glide to where it says, so a shoved wreck moves smoothly */
function netWrecksSync(W) {
  const old = NET.wl || [], used = new Set(), out = [];
  for (const h of W) {
    let best = null, bd = 80;
    for (const w of old) { if (used.has(w) || w.type !== h.type) continue; const d = Math.hypot(w.hx - h.x, w.hy - h.y); if (d < bd) { bd = d; best = w; } }
    const w = best || wreckWheel(Object.assign({}, h, { sx: h.x, sy: h.y }));
    used.add(w); w.hx = h.x; w.hy = h.y; w.ha = h.a; w.ta = h.ta; w.t = h.t; w.burn = h.burn; out.push(w);
  }
  NET.wl = out; M.wrecks = out;
}
function netWrecksStep(dt) {
  const k = 1 - Math.exp(-dt * 8);
  for (const w of NET.wl || []) { w.sx += (w.hx - w.sx) * k; w.sy += (w.hy - w.sy) * k; w.a = lerpAng(w.a, w.ha, k); if (w.po) netPushOff(w, w.sx, w.sy, dt); else { w.x = w.sx; w.y = w.sy; } }
}
/* joiner: a rifle shot shows (flash, sound, tracer) the moment we fire, by the same rules the host fires it by.
   The host still fires the real bullet; any we showed that it didn't fire are forgotten after a moment */
function netPredictShot(s, I, dt) {
  NET.pfCd = (NET.pfCd || 0) - dt;
  if (NET.pred && performance.now() - NET.predT > 700) NET.pred = 0;
  const st = s.w && s.w[s.wi], W_ = st && WPN[st.id];
  if (!I.fire || !W_ || W_.rocket || s.torch || s.swim || s.reloadT > 0 || NET.pfCd > 0 || st.mag - (NET.pred | 0) <= 0) return;
  if (s.veh && s.veh.T.seats[s.seat].role !== 'rifle') return;
  NET.pfCd = W_.rate; NET.pred = (NET.pred | 0) + 1; NET.predT = performance.now(); netShotFx(s);
}
/* a shot someone fired, as the host reported it: sound, flash, casing and a tracer that stops at walls */
function netShotFx(s) {
  if (!s.alive || (s.veh && s.veh.T.seats[s.seat].role !== 'rifle')) return;
  const W_ = WPN[cw(s).id]; if (!W_) return;
  const [x, y] = gunTip(s);
  s.firedT = 1.2; s.flash = W_.rocket ? 0.1 : 0.05;
  if (W_.rocket) { rocketFx(s, x, y); return; }
  shotFx(s, W_, x, y);
  const n = W_.pel || 1, sm = (s.ads ? 0.5 : 1) * (s.stance === 1 ? 0.45 : 1);
  for (let i = 0; i < n; i++) { const a = s.a + rnd(-W_.spread, W_.spread) * sm, sp = W_.spd * (W_.pel ? rnd(0.85, 1.1) : 1); NET.bul.push({ k: 'bullet', x, y, ox: x, oy: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: W_.life * (W_.pel ? rnd(0.8, 1.1) : 1), src: s, team: s.team, heavy: W_.dmg >= 40, low: s.stance >= 1 }); }
}
function netCannonFx(v) {
  const c = Math.cos(v.ta), sn = Math.sin(v.ta), [px, py] = turretPivot(v);
  const d = v.seats[0]; if (d) d.firedT = 2;
  cannonFx(v, px + c * BARREL, py + sn * BARREL, d && d.player && !isNet(d.player) ? d : null);
}
function netMgFx(v) {
  const [px, py] = mgPos(v), a = v.mgA + rnd(-0.05, 0.05), x = px + Math.cos(v.mgA) * 22, y = py + Math.sin(v.mgA) * 22;
  const g = v.seats.find((o, i) => o && v.T.seats[i].role === 'mg'); if (g) g.firedT = 1.2;
  v.mgFlash = 0.04; mgFx(v, px, py, x, y);
  NET.bul.push({ k: 'bullet', mg: true, x, y, ox: x, oy: y, vx: Math.cos(a) * 1150, vy: Math.sin(a) * 1150, life: 0.6, src: g || null, srcV: v, team: g ? g.team : -1, low: false });
}
function netBullets(dt) {
  for (const p of NET.bul) {
    const x0 = p.x, y0 = p.y, x1 = x0 + p.vx * dt, y1 = y0 + p.vy * dt; let bt = 2, hit = 0;
    for (const b of MAP.buildings) { if (b.glass) continue; const t = segRect(x0, y0, x1, y1, b, 0); if (t >= 0 && t < bt) { bt = t; hit = 1; } }
    for (const w of M.wrecks) { const t = segWreck(x0, y0, x1, y1, w); if (t >= 0 && t < bt) { bt = t; hit = 1; } }
    staticsNear((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 + 14, _near);
    for (const s of _near) { if (s.type === 'fence' || (s.type === 'bag' && !p.low)) continue; const t = segCirc(x0, y0, x1, y1, s.x, s.y, s.type === 'tree' ? 9 : s.type === 'hay' ? 12 : s.r); if (t >= 0 && t < bt) { bt = t; hit = 1; } }
    for (const s of M.sol) { if (!s.alive || s === p.src || (s.veh && !s.veh.T.seats[s.seat].exposed) || (!M.ffa && s.team === p.team && !M.ff)) continue; const t = segCirc(x0, y0, x1, y1, s.x, s.y, s.veh ? 7 : s.stance === 1 ? 4.5 : 9); if (t >= 0 && t < bt) { bt = t; hit = 3; } }
    for (const v of M.vehicles) {
      if (!v.active || v.dead || v === p.srcV || (p.src && p.src.veh === v)) continue; const vt = vehTeam(v); if (vt >= 0 && vt === p.team && !M.ff) continue;
      if (Math.abs(v.x - x0) > 160 || Math.abs(v.y - y0) > 160) continue;
      const [ax, ay] = toLocal(v, x0, y0), [bx, by] = toLocal(v, x1, y1), t = segRect(ax, ay, bx, by, { x: -v.T.hl, y: -v.T.hw, w: v.T.hl * 2, h: v.T.hw * 2 }, 0); if (t >= 0 && t < bt) { bt = t; hit = 2; }
    }
    if (hit) { const hx = lerp(x0, x1, bt), hy = lerp(y0, y1, bt); p.life = 0; if (hit === 1) sparks(hx, hy, 2); else if (hit === 2) { ev('bullet.veh', hx, hy, {}); sparks(hx, hy, 3); } continue; }
    p.x = x1; p.y = y1; p.life -= dt; if (p.x < 0 || p.y < 0 || p.x > WW || p.y > WH) p.life = 0;
  }
  prune(NET.bul, p => p.life > 0);
}
function netCosmetics(dt) {
  netBullets(dt);
  for (const s of M.sol) {
    s.flash -= dt; s.meleeT -= dt; s.hitT -= dt; s.hurtT -= dt; s.firedT -= dt;
    if (s.msg) { s.msg.t -= dt; if (s.msg.t <= 0) s.msg = null; }
    for (const q of s.pops) q.t -= dt; prune(s.pops, q => q.t > 0);
    if (s.alive && s.torch && !s.veh) { ev('torch', s.x, s.y, { s }); if (Math.random() < 0.12) { const [tx, ty] = muzzle(s, 20); part({ k: 'spark', x: tx, y: ty, vx: rnd(-140, 140), vy: rnd(-140, 140), life: 0.15, max: 0.15, sz: 1.4, drag: 6 }); } }
  }
  for (const v of M.vehicles) { v.hitFlash -= dt; v.mgFlash -= dt; if (v.active && !v.dead) vehDamageFx(v, dt); engineUpdate(v); }
  for (const f of M.flags) f.wave += dt * 6;
  fxTick(dt, dt);
}
/* the "connection trouble" line for joiners */
function netOverlay() {
  if (NET.role !== 'client' || state === 'lobby' || state === 'netmenu' || state === 'menu') return;
  const gap = performance.now() - NET.lastSnapT;
  if (gap > 1500) { const u = uiU(); stxt('WAITING FOR THE HOST…', W / 2, H * 0.42, fpx(18, u, 14), '#ffe08a', 'center', 'middle', FD); }
}
netInit();
