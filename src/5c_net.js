/* =====================================================================
   ONLINE PLAY over the artifact room (presence only, so anyone admitted to the page can play)
   One host runs the real match. Its presence in the game room carries a compact snapshot ~20 times a
   second plus a short log of events (blasts, kills, feed, sounds); each joiner's presence carries its input.
   Joiners draw what the host sends about 0.1 s behind so motion is smooth, see their own soldier with
   almost no delay, and replay the host's events for effects and sound.
   ===================================================================== */
const NET = {
  room: null, avail: null, mode: null, busy: '', role: null, code: '', game: null, myPeer: null, hosts: [], msg: '', msgT: 0,
  // host
  matchId: 0, seq: 0, evId: 0, evLog: [], t0: performance.now(), sendT: 0, lastPres: '', lastMM: '', pid: 0, kicked: new Set(), L: null, maxSnap: 0, hdr: null, roster: '',
  // client
  hostPeer: null, dev: null, myPid: -1, joined: false, wasJoined: false, curMatch: -1, lastSeq: -1, buf: [], off: null, lastEv: 0, evq: [], lobby: null, me: null,
  cc: new Array(14).fill(0), sd: 0, si: 0, pw: 0, dep: null, depN: 0, want: { c: '', t: -1, r: 0 }, lastI: null, pmap: new Map(), bul: [], lastHostT: 0, lastSnapT: 0, joinT: 0, lastA: null, demoMap: -1, selfD: null
};
const cleanName = n => String(n || '').toUpperCase().replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ' ').trimStart().slice(0, 10);
NET.name = cleanName(store.get('name', '')).trim();
const NET_DELAY = 110;                                  // ms others are drawn behind the host
const NETSFX = ['door', 'shuffle', 'clink', 'throw', 'reload', 'empty', 'knife', 'thud', 'horn', 'beep', 'drop', 'jump', 'heat', 'clang'];
const NETSFX_I = {}; NETSFX.forEach((n, i) => NETSFX_I[n] = i);
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
const P2P_SIG = () => (typeof window !== 'undefined' && window.__MM_SIG) || 'https://ntfy.sh';
const P2P_TOPIC = id => 'mm1-' + id;
const P2P_ICE = () => (typeof window !== 'undefined' && window.__MM_ICE) || [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const RTC = () => typeof window !== 'undefined' ? (window.RTCPeerConnection || window.webkitRTCPeerConnection || null) : null;
const p2pOK = () => !!RTC() && typeof WebSocket !== 'undefined';
/* what this browser view can do, shown when online play isn't possible */
function netDiag() { return 'WEBRTC ' + (RTC() ? 'OK' : 'MISSING') + ' · WEBSOCKET ' + (typeof WebSocket !== 'undefined' ? 'OK' : 'MISSING') + ' · CLAUDE ROOM ' + (NET.room ? 'OK' : 'NONE'); }

/* ---------- connection trace and error codes: every failure names the step that broke ---------- */
const NET_E = {
  101: ['CAN’T REACH THE MATCHMAKING SERVER', 'This device couldn’t reach the free matchmaking relay (ntfy.sh). Check its internet; some school or work networks block it.'],
  102: ['MATCHMAKING SERVER DIDN’T ANSWER', 'The matchmaking server is slow or down. Try again in a minute.'],
  103: ['MATCHMAKING SERVER REFUSED', 'The free matchmaking server turned the request away (it may be overloaded). Try again.'],
  104: ['NO FREE GAME CODE', 'Every code tried was already in use. Try again.'],
  201: ['NO GAME WITH THAT CODE', 'Nobody answered on this code. Check the code, and that the host is still in its lobby with the tab in front.'],
  202: ['THE HOST DIDN’T REPLY', 'The join request reached the matchmaking server but the host never answered. Bring the host’s tab to the front and try again.'],
  301: ['NO NETWORK PATH TO THE HOST', 'Both sides found each other but no direct route worked and no relay was available. Usually a router/NAT or firewall issue; a TURN relay fixes it.'],
  302: ['NETWORK PATH TIMED OUT', 'Route checks between the two devices never finished. Usually a router/NAT or firewall issue; a TURN relay fixes it.'],
  303: ['NO ADDRESSES EXCHANGED', 'One side sent no network addresses, so there was nothing to try. The browser may be blocking WebRTC.'],
  401: ['GAME LINK DIDN’T OPEN', 'A network route was found but the data channel never opened.'],
  402: ['GAME LINK CLOSED', 'The data channel closed before any game data arrived.'],
  501: ['HOST SENT NO GAME DATA', 'Connected, but the host’s lobby never arrived. The host’s tab may be in the background.'],
  502: ['THAT GAME IS FULL', 'Four players are already in.'],
  503: ['THAT MATCH HAS ALREADY STARTED', 'Join while the host is in the lobby.'],
  504: ['YOU WERE REMOVED FROM THE GAME', ''],
  601: ['LOST CONTACT WITH THE HOST', 'Nothing arrived from the host for 20 seconds. Keep the host’s tab in front.'],
  602: ['THE HOST LEFT THE GAME', ''],
  701: ['WEBRTC ERROR', 'The browser refused to set up the connection.'],
};
function mkTrace() { return { t0: performance.now(), sig: 0, offer: 0, answer: 0, lc: { host: 0, srflx: 0, relay: 0, prflx: 0 }, rc: { host: 0, srflx: 0, relay: 0, prflx: 0 }, lmdns: 0, rmdns: 0, gather: 'new', ice: 'new', conn: 'new', dc: 0, data: 0, turn: '', err: '' }; }
function traceCand(o, mdnsKey, tr, c) {
  const s = (c && c.candidate) || ''; if (!s) return;
  const m = / typ (\w+)/.exec(s), t = m ? m[1] : 'host'; if (t in o) o[t]++;
  if (/\.local /.test(s)) tr[mdnsKey]++;
}
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
  if (!(tr.rc.host + tr.rc.srflx + tr.rc.relay + tr.rc.prflx) || !(tr.lc.host + tr.lc.srflx + tr.lc.relay + tr.lc.prflx)) return 303;
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
  if (NET.role) netLeave(); else NET.busy = '';
  NET.err = { code, title: E[0], hint: E[1], lines, t: performance.now() };
  try { console.warn('[net] E' + code, E[0], lines.join(' | ')); } catch (e) { }
}
let SIG_MSG = '';
function sigOpen(id) {
  return new Promise((res, rej) => {
    let ws;
    const base = P2P_SIG().replace(/\/$/, ''), wsBase = base.replace(/^http/, 'ws');
    let opened = false, fails = 0;
    const S = {
      id, ws: null, on: null, onclose: null, onsenderr: null, dead: false, last: '',
      send(m) {
        if (!m.dst || S.dead) return; m.src = id;
        fetch(base + '/' + P2P_TOPIC(m.dst), { method: 'POST', body: JSON.stringify(m) })
          .then(r => { if (!r.ok && S.onsenderr) S.onsenderr(r.status === 429 ? 'RATE LIMITED' : 'HTTP ' + r.status); })
          .catch(() => { if (S.onsenderr) S.onsenderr('SEND FAILED'); });
      },
      close() { S.dead = true; try { S.ws && S.ws.close(); } catch (e) { } }
    };
    const t = setTimeout(() => { if (!opened) { rej('timeout'); S.close(); } }, 9000);
    const deliver = x => { if (x && x.src && x.src !== id && S.on) S.on(x); };
    const connect = () => {
      let ws; try { ws = new WebSocket(wsBase + '/' + P2P_TOPIC(id) + '/ws' + (S.last ? '?since=' + S.last : '')); } catch (e) { clearTimeout(t); rej('network'); return; }
      S.ws = ws;
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (er) { return; }
        if (m.event === 'open') { fails = 0; if (!opened) { opened = true; clearTimeout(t); res(S); } return; }
        if (m.event !== 'message') return;
        S.last = m.id;
        // a message too long for the relay arrives as an attachment
        if (m.attachment && m.attachment.url) { fetch(m.attachment.url).then(r => r.json()).then(deliver).catch(() => { }); return; }
        try { deliver(JSON.parse(m.message)); } catch (er) { }
      };
      ws.onerror = () => { if (!opened) { clearTimeout(t); S.dead = true; rej('network'); } };
      // the relay drops idle sockets now and then: reconnect, catching up on anything missed
      ws.onclose = () => { if (S.dead || !opened) return; if (++fails === 3 && S.onclose) S.onclose(); setTimeout(() => { if (!S.dead) connect(); }, Math.min(10000, 1000 * fails)); };
    };
    connect();
  });
}
/* wait (briefly) until a connection has found its addresses, so they all go in one message */
const iceGathered = (pc, ms) => new Promise(r => {
  if (pc.iceGatheringState === 'complete') return r();
  const t = setTimeout(r, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } });
});
const sdpCands = d => ((d && d.sdp) || '').split(/\r?\n/).filter(l => l.startsWith('a=candidate:')).map(l => ({ candidate: l.slice(2) }));
/* the same calls the game uses on a room (presence, onPeers, leave), over direct links */
function p2pRoom(sig, hostId, trace) {
  const R = { mine: {}, links: new Map(), hs: [], pend: {}, onFail: null, onJoinFail: null, dead: false };
  const self = () => ({ peer: sig.id, sameTab: true, isMe: true, kind: 'viewer', presence: R.mine });
  const list = () => [self(), ...[...R.links.values()].filter(l => l.open).map(l => ({ peer: l.id, sameTab: false, isMe: false, kind: 'viewer', presence: l.pres }))];
  const fire = (joined, left) => { const ch = { peers: list(), joined, left, updated: [] }; for (const h of R.hs) { try { h(ch); } catch (e) { console.error(e); } } };
  const txt = () => JSON.stringify(R.mine);
  function drop(L, why) {
    if (!R.links.has(L.id)) return; R.links.delete(L.id); try { L.pc.close(); } catch (e) { }
    if (L.open) fire([], [{ peer: L.id }]); else if (hostId && R.onFail) R.onFail(why || 'failed'); else if (!hostId && R.onJoinFail) R.onJoinFail(L.tr, why || 'failed');
  }
  function mkLink(id, initiator) {
    const PC = RTC(), pc = new PC({ iceServers: P2P_ICE() });
    const tr = (hostId && trace) || mkTrace();
    const L = { id, pc, dc: null, pres: {}, open: false, last: performance.now(), tr };
    // addresses found before the offer/answer goes out ride along in it; only late ones are sent separately
    pc.onicecandidate = e => { if (e.candidate) { traceCand(tr.lc, 'lmdns', tr, e.candidate); if (L.sent) sig.send({ type: 'CANDIDATE', dst: id, payload: { c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate } }); } };
    pc.onicecandidateerror = e => { if (/^turns?:/.test(e.url || '')) tr.turn = String(e.errorCode || '?'); };
    pc.onicegatheringstatechange = () => { tr.gather = pc.iceGatheringState; };
    pc.oniceconnectionstatechange = () => { tr.ice = pc.iceConnectionState; if (tr.ice === 'failed') drop(L, 'failed'); };
    pc.onconnectionstatechange = () => { tr.conn = pc.connectionState; if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(L, 'failed'); };
    const wire = dc => {
      L.dc = dc;
      dc.onopen = () => { tr.dc = performance.now(); L.open = true; L.last = performance.now(); try { dc.send(txt()); } catch (e) { } fire([{ peer: id }], []); };
      dc.onmessage = e => { try { L.pres = JSON.parse(e.data) || {}; L.last = performance.now(); tr.data = tr.data || L.last; fire([], []); } catch (er) { } };
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
    } catch (e) { console.warn('p2p', e); const L = R.links.get(src); if (L) { L.tr.err = String(e && (e.name || e.message) || e).toUpperCase().slice(0, 40); drop(L, 'setup'); } }
  };
  sig.onclose = () => { if (!R.dead && R.onSigLost) R.onSigLost(); };
  if (hostId && trace) sig.onsenderr = e => { trace.err = e; };
  // keep links warm: resend our state four times a second, drop links that go quiet
  R.tick = setInterval(() => {
    const now = performance.now(), t = txt();
    for (const L of [...R.links.values()]) {
      if (L.open && L.dc.readyState === 'open') { try { L.dc.send(t); } catch (e) { } }
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
    catch (e) { if (L) L.tr.err = String(e && (e.name || e.message) || e).toUpperCase().slice(0, 40); if (R.onFail) R.onFail('setup'); }
  })();
  return {
    name: sig.id,
    presence(patch) {
      for (const k in patch) { if (patch[k] === null) delete R.mine[k]; else R.mine[k] = patch[k]; }
      const t = txt(); for (const L of R.links.values()) if (L.open && L.dc.readyState === 'open') { try { L.dc.send(t); } catch (e) { } }
      return Promise.resolve();
    },
    onPeers(h) { R.hs.push(h); setTimeout(() => { if (!R.dead) fire([], []); }, 0); return () => { }; },
    peers: list, connected: () => !R.dead,
    set onFail(f) { R.onFail = f; }, set onSigLost(f) { R.onSigLost = f; }, set onJoinFail(f) { R.onJoinFail = f; }, set onJoinTry(f) { R.onJoinTry = f; },
    leave() { R.dead = true; clearInterval(R.tick); for (const L of R.links.values()) { try { L.pc.close(); } catch (e) { } } R.links.clear(); if (hostId) sig.send({ type: 'LEAVE', dst: hostId }); setTimeout(() => sig.close(), 100); return Promise.resolve(); }
  };
}

/* ---------- connecting ---------- */
async function netInit() {
  // direct play everywhere (file or claude.ai page) so everyone can meet; the claude.ai room is only a fallback
  NET.mode = p2pOK() ? 'p2p' : null; NET.avail = p2pOK() ? true : null;
  let r = null;
  try { const C = typeof window !== 'undefined' && window.claude; if (C && C.use) r = await C.use('room'); } catch (e) { r = null; }
  if (r) { NET.room = r; try { r.onPeers(netLobbyPeers, netErr); } catch (e) { } if (!NET.mode) NET.mode = 'room'; }
  NET.avail = !!NET.mode;
}
function netErr(e) {
  console.warn('room', e && e.code, e && e.message);
  if (e && (e.code === 'not_granted' || e.code === 'revoked' || e.code === 'capability_disabled' || e.code === 'capability_removed')) { NET.room = null; if (NET.mode === 'room') { NET.mode = null; NET.avail = false; if (NET.role) netShutdown('ONLINE PLAY IS NOT AVAILABLE HERE'); } }
}
function netSay(m, t) { NET.msg = m; NET.msgT = t || 3.5; }
const sigCode = e => e === 'network' ? 101 : e === 'timeout' ? 102 : e === 'error' ? 103 : e === 'taken' ? 104 : 701;
function netLobbyPeers(ch) {
  const me = ch.peers.find(p => p.sameTab); if (me) NET.myPeer = me.peer;
  NET.hosts = ch.peers.filter(p => !p.sameTab && p.kind !== 'agent' && p.presence && p.presence.mm && /^[a-z0-9]{4}$/.test(p.presence.mm.c || '')).map(p => {
    const m = p.presence.mm; return { peer: p.peer, c: m.c, n: clamp(m.n | 0, 0, 4), st: m.st === 'play' ? 'play' : 'lobby', md: String(m.md || '').slice(0, 24), mp: String(m.mp || '').slice(0, 24), mine: p.isMe };
  });
  if (NET.role === 'client' && ch.left.some(p => p.peer === NET.hostPeer)) netHostGone();
}
function netCode() { const A = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
async function netHost(dev) {
  if (!NET.avail || NET.role) return;
  NET.role = 'host'; NET.code = netCode(); NET.kicked = new Set(); NET.evLog = []; NET.lastPres = ''; NET.lastMM = ''; NET.game = null; NET.busy = 'OPENING A GAME…'; NET.trace = null; NET.err = null;
  try {
    let sig = null;
    if (NET.mode === 'p2p') {
      try { for (let k = 0; k < 4 && !sig; k++) { try { sig = await sigOpen(P2P_PREFIX + NET.code); } catch (e) { if (e !== 'taken') throw e; NET.code = netCode(); } } if (!sig) throw 'taken'; }
      catch (e) { if (!NET.room) throw e; }       // matchmaking unreachable from here: use the claude.ai room instead
    }
    if (sig) {
      NET.game = p2pRoom(sig, null); NET.myPeer = sig.id;
      NET.game.onSigLost = () => { if (NET.role === 'host') netSay('E801 MATCHMAKING SERVER DROPPED — NEW PLAYERS CAN’T JOIN', 12); };
      NET.game.onJoinTry = () => { if (NET.role === 'host') netSay('A PLAYER IS CONNECTING…', 4); };
      NET.game.onJoinFail = (tr, why) => { if (NET.role === 'host' && why !== 'left') netSay('JOIN FAILED E' + (why === 'closed' ? 402 : traceCode(tr)) + ' · ' + traceLine(tr, 'THEM') + ' · ' + traceLine2(tr), 15); };
    }
    else NET.game = await NET.room.join('mm-' + NET.code);
  } catch (e) { NET.role = null; netFail(sigCode(e), e === 'error' ? SIG_MSG : ''); return; }
  NET.busy = '';
  NET.game.onPeers(netGamePeers, netErr);
  enterLobby(dev && dev.type !== 'net' ? dev : { type: 'kb' });
  if (PLAYERS[0]) PLAYERS[0].name = NET.name;
}
async function netJoin(h, dev) {
  if (!NET.avail || NET.role || !h) return;
  Object.assign(NET, { role: 'client', hostPeer: h.peer, code: h.c, dev: dev && dev.type !== 'net' ? dev : { type: 'kb' }, myPid: -1, joined: false, wasJoined: false, curMatch: -1, lastSeq: -1, buf: [], off: null, lobby: null, want: { c: '', t: -1, r: 0 }, dep: null, lastHostT: performance.now(), joinT: performance.now(), lastPres: '', game: null, demoMap: -1 });
  NET.busy = 'CONNECTING TO GAME ' + h.c.toUpperCase() + '…'; NET.err = null; NET.trace = mkTrace();
  try {
    let sig = null;
    if (NET.mode === 'p2p' && !h.peer) { try { sig = await sigOpen(P2P_PREFIX + 'j-' + Math.random().toString(36).slice(2, 10)); } catch (e) { if (!NET.room) throw e; } }
    if (!sig) NET.game = await NET.room.join('mm-' + h.c);
    else {
      NET.trace.sig = performance.now();
      NET.hostPeer = P2P_PREFIX + h.c; NET.myPeer = sig.id;
      NET.game = p2pRoom(sig, NET.hostPeer, NET.trace);
      NET.game.onFail = why => { if (NET.role === 'client' && !NET.joined) netFail(why === 'nohost' ? 201 : why === 'closed' ? 402 : why === 'setup' && !NET.trace.offer ? 701 : traceCode(NET.trace)); };
    }
  } catch (e) { NET.role = null; netFail(sigCode(e), e === 'error' ? SIG_MSG : ''); return; }
  NET.busy = '';
  NET.game.onPeers(netGamePeers, netErr);
  PLAYERS = []; LOBBY.sel = 0; setState('lobby'); sfx('join');
}
/* leave whatever online game we are in; back to the network menu with an optional message */
function netShutdown(msg) {
  const g = NET.game; NET.game = null;
  if (g) { try { g.presence({ L: null, g: null, j: null, i: null, d: null }).catch(() => { }); } catch (e) { } try { g.leave().catch(() => { }); } catch (e) { } }
  if (NET.role === 'host' && NET.room) NET.room.presence({ mm: null }).catch(() => { });
  NET.role = null; NET.curMatch = -1; NET.me = null; NET.buf = []; NET.evq = []; NET.pmap.clear(); NET.bul = []; NET.lastI = null;
  if (msg) netSay(msg);
}
function netLeave(msg) { netShutdown(msg); engineKillAll(); PLAYERS = []; SET.open = false; demoMatch(); setState('netmenu'); Music.mode = 'menu'; }
function netHostGone(code) { if (NET.role !== 'client') return; netFail(code || 602); }

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
    if (!P.j || NET.kicked.has(pr.peer) || state !== 'lobby' || PLAYERS.length >= MAXP) return;
    lobbyJoin({ type: 'net', peer: pr.peer }); p = PLAYERS.find(q => isNet(q) && q.dev.peer === pr.peer); if (!p) return;
  }
  p.netIn = P.i || null; p.netDep = P.d || null;
  if (state === 'lobby') {
    if (!P.j) { leaveLobby(p); return; }
    const j = P.j;
    if (typeof j.c === 'string' && j.c !== p.color && COLORS.includes(j.c) && !PLAYERS.some(q => q !== p && q.color === j.c)) p.color = j.c;
    if (MODES[CFG.mode].team && (j.t === 0 || j.t === 1)) p.team = j.t;
    p.ready = !!j.r; p.name = cleanName(j.n).trim();
  }
}
function netPeerLeft(peer) {
  const p = PLAYERS.find(q => isNet(q) && q.dev.peer === peer); if (!p) return;
  if (!M || M.demo || state === 'lobby') leaveLobby(p); else netBotify(p);
}
function netKick(p) { NET.kicked.add(p.dev.peer); PLAYERS = PLAYERS.filter(q => q !== p); sfx('leave'); }
/* someone dropped out mid-match: their soldier fights on as a bot */
function netBotify(p) {
  PLAYERS = PLAYERS.filter(q => q !== p);
  const s = p.sol; if (!s) return;
  s.player = null; s.bot = makeSoldier({ bot: true, team: s.team }).bot; if (!s.alive) s.respawnT = Math.max(s.respawnT, 1);
  toast(s.name + ' LEFT — A BOT TAKES OVER', '#f2e6c4', 2.8, -1, 3);
}
function netInputHost(p) {
  const I = newI(), q = p.netIn;
  if (p.netDep) p.lastDep = p.netDep.n;           // a deploy asked for while alive doesn't carry into the next life
  if (!q || !Array.isArray(q.m)) { if (q && Array.isArray(q.c)) p.netC = q.c.slice(); return I; }
  I.mx = clamp((q.m[0] || 0) / 100, -1, 1); I.my = clamp((q.m[1] || 0) / 100, -1, 1);
  I.aimA = typeof q.a === 'number' ? q.a / 1000 : null; I.fire = !!q.f; I.ads = !!q.ad; I.sprint = !!q.sp; I.gadget = !!q.g; I.altDist = q.ds || 220; I.interactSwap = !!q.is;
  const c = Array.isArray(q.c) ? q.c : [], pc = p.netC || c, e = k => c[k] !== pc[k];
  I.jump = e(0); I.reload = e(1); I.alt = e(2); I.nadeCyc = e(3); I.gadgetP = e(4); I.enter = e(5); I.melee = e(6); I.spot = e(7); I.stanceCycle = e(8); I.swapW = e(9); I.seatNext = e(10);
  I.seatDir = e(11) ? clamp(q.sd | 0, 0, 3) : -1; I.seatIdx = e(12) ? clamp(q.si | 0, 0, 3) : -1; I.pickW = e(13) ? clamp(q.pw | 0, 0, 1) : -1;
  p.netC = c.slice();
  return I;
}
function netDeployHost(s) {
  const p = s.player, d = p.netDep;
  if (!d || d.n === p.lastDep) return;
  if (s.respawnT > 0 || (!M.ffa && M.tickets[s.team] <= 0) || M.over) return;
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
  NET.matchId++; NET.evLog = [];
  NET.hdr = [M.cfg.mode, M.cfg.map, M.cfg.bots, M.cfg.limit, M.cfg.skill, M.cfg.ff ? 1 : 0, Math.max(0, ['clear', 'rain', 'snow'].indexOf(M.cfg.weather)), COLORS.indexOf(M.teamColor[0]), COLORS.indexOf(M.teamColor[1]), M.cfg.teamColors === 'classic' ? 0 : 1];
  NET.names = {}; for (const s of M.sol) if (s.player) NET.names[s.player.id] = s.name;
  NET.roster = M.sol.map(s => pk(s.player ? s.player.id + 1 : 0, 1) + pk(s.player ? 0 : BOTNAMES.indexOf(s.name), 1) + pk(COLORS.indexOf(s.color), 1) + pk(s.team, 2) + pk(s.dark ? 1 : 0, 1)).join('');
}
function netLobbyInfo() {
  const inMatch = M && !M.demo && state !== 'lobby';
  return { st: inMatch ? 'play' : 'lobby', c: NET.code, cfg: [CFG.mode, CFG.map, CFG.bots, CFG.limit, CFG.skill, CFG.ff ? 1 : 0, Math.max(0, ['clear', 'rain', 'snow'].indexOf(CFG.weather)), CFG.teamColors === 'classic' ? 0 : 1],
    pl: PLAYERS.map(p => [p.id, isNet(p) ? p.dev.peer : '', p.color, p.team, p.ready ? 1 : 0, isNet(p) ? 'net' : p.dev.type, p.name || '']) };
}
/* the whole match in a few kilobytes */
function netSnap() {
  const now = netNow(), S = [];
  for (const s of M.sol) {
    if (!s.alive) { S.push('A'); continue; }
    const W_ = s.w ? cw(s) : null, vi = s.veh ? M.vehicles.indexOf(s.veh) : -1;
    const fA = 1 | (s.stance === 2 ? 2 : 0) | (s.swim ? 4 : 0) | (s.torch ? 8 : 0) | (s.ads ? 16 : 0) | (s.protect > 0 ? 32 : 0);
    const fB = (s.thrownSmoke ? 1 : 0) | (s.handT > 0 ? 2 : 0) | (s.meleeT > 0 ? 4 : 0) | (s.spotT > 0 && s.spotTeam === 0 ? 8 : 0) | (s.spotT > 0 && s.spotTeam === 1 ? 16 : 0) | (W_ && W_.mag > 0 ? 32 : 0);
    S.push(pk(fA, 1) + pk(fB, 1) + pk(Math.max(0, s.throwT) / 0.35 * 63, 1) + pk(Math.max(0, s.jumpT) / 0.42 * 63, 1) + pk(s.x, 2) + pk(s.y, 2) + angE(s.a) + pk(W_ ? WPNK.indexOf(W_.id) : 0, 1) + pk((s.shotN || 0) % 64, 1) + pk(vi >= 0 ? vi * 4 + s.seat + 1 : 0, 1) + pk(s.kit, 1));
  }
  const V = M.vehicles.map(v => {
    if (!v.active) return 'A';
    const fl = 1 | (v.dead ? 2 : 0) | (v.hitFlash > 0 ? 4 : 0) | (v.over > 0 ? 8 : 0);
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
  let I = '', ni = 0;
  for (const it of M.items) { if (ni++ >= 40) break; I += pk(['med', 'ammo', 'mine', 'pouch'].indexOf(it.k), 1) + pk(it.x, 2) + pk(it.y, 2) + pk(it.team < 0 ? 4095 : it.team, 2); }
  let C = ''; for (let i = 0; i < M.crates.length; i += 6) { let b = 0; for (let j = 0; j < 6 && i + j < M.crates.length; j++) if (M.crates[i + j].live) b |= 1 << j; C += B64[b]; }
  const Wr = M.wrecks.map(w => pk(w.type === 'tank' ? 0 : 1, 1) + pk(w.x, 2) + pk(w.y, 2) + angE(w.a) + angE(w.ta || 0) + pk(w.t * 10, 2)).join('');
  const F = M.flags.map(f => pk((f.owner + 1) | (f.contested ? 4 : 0), 1) + pk((f.prog + 1) * 31.5, 1)).join('');
  const R = M.sol.map(s => pk(s.pts, 3) + pk(s.k, 2) + pk(s.d, 2) + pk(s.caps, 1) + pk(s.vk, 1)).join('');
  const pv = {};
  for (const p of PLAYERS) if (isNet(p) && p.sol) {
    const s = p.sol, w = s.w || [{ id: WPNK[0], mag: 0, res: 0 }, { id: WPNK[0], mag: 0, res: 0 }];
    pv[p.id] = [Math.ceil(Math.max(0, s.hp)), Math.max(0, Math.round(s.respawnT * 10)), s.wi, WPNK.indexOf(w[0].id), w[0].mag, w[0].res, WPNK.indexOf(w[1].id), w[1].mag, w[1].res, s.nades, s.smokes || 0, s.mines, Math.max(0, Math.round(s.gcd * 10)), Math.round(s.gmax || 0), Math.max(0, Math.round(s.reloadT * 10)), Math.round((s.reloadMax || 0) * 10), s.throwSel || 0,
      Math.max(0, Math.round(s.hitT * 100)), Math.max(0, Math.round(s.hurtT * 100)), Math.max(0, Math.round(s.seatT * 100)), Math.round((s.seatMax || 0.5) * 100), s.msg ? String(s.msg.txt).slice(0, 40) : '', s.msg ? Math.round(s.msg.t * 10) : 0];
  }
  const E = []; for (const e of NET.evLog) if (now - e.t < 700) E.push([e.id, Math.round((now - e.t) / 10), ...e.a]);
  const g = { id: NET.matchId, q: ++NET.seq, t: now, h: NET.hdr, ro: NET.roster, nm: NET.names, S: S.join(''), V, P, I, C, W: Wr, F, T: [M.tickets[0], M.tickets[1]], o: M.over ? [M.winner, M.winnerSol ? M.sol.indexOf(M.winnerSol) : -1] : 0, R, pv, E };
  if (M.over) g.A = M.sol.map(s => pk(s.heal, 2) + pk(s.rep, 2) + pk(s.longest / 2, 2) + pk(s.rk, 1)).join('');
  return g;
}
function netHostTick(now) {
  if (!NET.game) return;
  const inMatch = M && !M.demo && (state === 'play' || state === 'pause' || state === 'end' || (SET.open && SET.from === 'pause'));
  const L = netLobbyInfo();
  const mm = { c: NET.code, n: PLAYERS.length, st: L.st, md: MODES[CFG.mode].n, mp: MAPNAMES[CFG.map][1] }, mj = JSON.stringify(mm);
  if (mj !== NET.lastMM && NET.room) { NET.lastMM = mj; NET.room.presence({ mm }).catch(netErr); }
  if (now - NET.sendT < 45) return; NET.sendT = now;
  const pres = { L, g: inMatch && PLAYERS.some(isNet) ? netSnap() : null };
  let js = JSON.stringify(pres);
  // stay under the 4 KiB presence cap: shed old events, then items, then projectiles
  while (pres.g && js.length > 3950) {
    const g = pres.g;
    if (g.E.length > 4) g.E.splice(0, Math.ceil(g.E.length / 4)); else if (g.I) g.I = ''; else if (g.P) g.P = ''; else if (g.E.length) g.E = []; else break;
    js = JSON.stringify(pres);
  }
  if (js === NET.lastPres) return;
  NET.lastPres = js; NET.maxSnap = Math.max(NET.maxSnap, js.length);
  NET.game.presence(pres).catch(netErr);
}

/* ================= client side ================= */
function netClientSee(P) {
  NET.lastHostT = performance.now();
  if (P.L) netClientLobby(P.L);
  if (P.g) netRecvSnap(P.g);
}
function netClientLobby(L) {
  NET.lobby = L;
  const pl = Array.isArray(L.pl) ? L.pl : [], mine = pl.find(e => e[1] === NET.myPeer);
  NET.joined = !!mine; if (mine) { NET.myPid = mine[0]; NET.wasJoined = true; }
  if (state === 'lobby') {
    PLAYERS = pl.map(e => ({ id: e[0], dev: e[1] === NET.myPeer ? NET.dev : { type: 'net', peer: e[1], kind: e[5] }, color: e[2], team: e[3], ready: !!e[4], mine: e[1] === NET.myPeer, kit: 0, var: 0, name: cleanName(e[6]).trim() }));
    if (L.cfg && L.cfg[1] !== NET.demoMap) { NET.demoMap = L.cfg[1]; withHostCfg(() => demoMatch()); }
    if (NET.wasJoined && !mine) { netFail(504); return; }
    if (!mine && performance.now() - NET.joinT > 2500) { if (L.st === 'play') { netFail(503); return; } if (pl.length >= MAXP) { netFail(502); return; } }
  }
  if (L.st === 'lobby' && (state === 'play' || state === 'pause' || state === 'end')) netClientToLobby();
}
function netClientToLobby() {
  engineKillAll(); SET.open = false; NET.curMatch = -1; NET.buf = []; NET.evq = []; NET.pmap.clear(); NET.bul = []; NET.me = null; NET.want.r = 0; NET.dep = null; NET.demoMap = -1;
  setState('lobby'); Music.mode = 'menu';
  if (NET.lobby) netClientLobby(NET.lobby);
}
/* match settings shown in a joiner's lobby are the host's, without touching the joiner's own saved settings */
function withHostCfg(fn) {
  if (NET.role !== 'client' || !NET.lobby || !NET.lobby.cfg) return fn();
  const keep = { mode: CFG.mode, map: CFG.map, bots: CFG.bots, limit: CFG.limit, skill: CFG.skill, ff: CFG.ff, weather: CFG.weather, teamColors: CFG.teamColors }, c = NET.lobby.cfg;
  Object.assign(CFG, { mode: clamp(c[0] | 0, 0, MODES.length - 1), map: clamp(c[1] | 0, 0, MAPNAMES.length - 1), bots: c[2] | 0, limit: c[3] | 0, skill: c[4] | 0, ff: !!c[5], weather: ['clear', 'rain', 'snow'][c[6]] || 'clear', teamColors: c[7] ? 'player' : 'classic' });
  try { return fn(); } finally { Object.assign(CFG, keep); }
}
function netRecvSnap(g) {
  if (typeof g.q !== 'number' || g.q === NET.lastSeq) return;
  if (g.id === NET.curMatch && g.q < NET.lastSeq) return;
  NET.lastSeq = g.q;
  const now = performance.now(), o = g.t - now;
  if (NET.off === null || o > NET.off || g.id !== NET.curMatch) NET.off = o; else NET.off += (o - NET.off) * 0.02;
  if (g.id !== NET.curMatch) { if (!(state === 'lobby' || state === 'play' || state === 'pause' || state === 'end') || !netClientStart(g)) return; }
  NET.lastSnapT = now;
  const snap = netDecode(g); NET.buf.push(snap); if (NET.buf.length > 14) NET.buf.shift();
  if (Array.isArray(g.E)) for (const e of g.E) if (e[0] > NET.lastEv) { NET.lastEv = e[0]; NET.evq.push({ t: g.t - e[1] * 10, a: e.slice(2) }); }
  if (NET.evq.length > 300) NET.evq.splice(0, NET.evq.length - 300);
}
function netClientStart(g) {
  const h = g.h || [], ro = new Rd(g.ro), roster = [];
  while (!ro.end) { const kind = ro.u(1), ni = ro.u(1), ci = ro.u(1), team = ro.u(2), dark = ro.u(1); roster.push({ pid: kind - 1, ni, color: COLORS[ci] || 'red', team, dark: !!dark }); }
  if (!roster.some(r => r.pid === NET.myPid)) return false;            // we're not in this match
  const cfg = { mode: clamp(h[0] | 0, 0, MODES.length - 1), map: clamp(h[1] | 0, 0, MAPNAMES.length - 1), bots: h[2] | 0, limit: h[3] | 0, skill: h[4] | 0, ff: !!h[5], weather: ['clear', 'rain', 'snow'][h[6]] || 'clear', teamColors: h[9] ? 'player' : 'classic', camera: CFG.camera };
  PLAYERS = roster.filter(r => r.pid >= 0).map(r => r.pid === NET.myPid ? { id: r.pid, dev: NET.dev, color: r.color, team: r.team, ready: true, kit: 0, var: 0 } : { id: r.pid, dev: { type: 'net', peer: '' }, color: r.color, team: r.team, ready: true });
  NET.me = PLAYERS.find(p => p.id === NET.myPid);
  newMatch(cfg, false);
  const tc = [COLORS[h[7]] || 'blue', COLORS[h[8]] || 'red']; M.teamColor = tc; TEAMHEX = tc.map(c => CHEX[c]);
  TEAMNAME = (!M.ffa && cfg.teamColors !== 'classic') ? tc.map(c => CNAME[c]) : ['WEST', 'EAST']; buildRings();
  M.sol = roster.map(r => {
    const pl = r.pid >= 0 ? PLAYERS.find(p => p.id === r.pid) : null;
    const s = makeSoldier({ team: r.team, color: r.color, name: pl ? (cleanName(g.nm && g.nm[r.pid]).trim() || 'P' + (r.pid + 1)) : (BOTNAMES[r.ni] || 'Bot'), player: pl, bot: !pl });
    s.dark = r.dark; s.respawnT = 0; s.alive = false; if (pl) { pl.sol = s; s.firstDeploy = true; }
    return s;
  });
  const me = NET.me.sol; if (NET.kitPick) Object.assign(me, NET.kitPick);
  Object.assign(NET, { curMatch: g.id, buf: [], evq: [], bul: [], lastA: null, dep: null, lastI: null, selfD: null });
  NET.pmap.clear();
  layoutViews(); SET.open = false; setState('play'); Music.mode = 'battle'; sfx('join');
  return true;
}
function netDecode(g) {
  const prev = NET.buf[NET.buf.length - 1], pdt = prev ? Math.max(0.01, (g.t - prev.t) / 1000) : 0;
  const S = [], r = new Rd(g.S);
  for (let i = 0; i < M.sol.length; i++) {
    const fA = r.u(1); if (!(fA & 1)) { S.push(null); continue; }
    const fB = r.u(1), thr = r.u(1), jmp = r.u(1), x = r.u(2), y = r.u(2), a = angD(r.u(2)), w = r.u(1), sh = r.u(1), st = r.u(1), kit = r.u(1);
    const o = { fA, fB, thr: thr / 63 * 0.35, jmp: jmp / 63 * 0.42, x, y, a, w: WPNK[w] || WPNK[0], sh, vi: st ? (st - 1) >> 2 : -1, seat: st ? (st - 1) & 3 : -1, kit: clamp(kit, 0, KITS.length - 1), vx: 0, vy: 0 };
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
  const I = [], ri = new Rd(g.I);
  while (!ri.end) { const k = ri.u(1), x = ri.u(2), y = ri.u(2), t = ri.u(2); I.push({ k: ['med', 'ammo', 'mine', 'pouch'][k] || 'pouch', x, y, team: t === 4095 ? -1 : t, t: 9 }); }
  const W2 = [], rw = new Rd(g.W);
  while (!rw.end) { const k = rw.u(1), x = rw.u(2), y = rw.u(2), a = angD(rw.u(2)), ta = angD(rw.u(2)), t = rw.u(2) / 10, T = VT[k ? 'jeep' : 'tank']; W2.push({ type: k ? 'jeep' : 'tank', x, y, a, ta, t, T: 180, burn: t - 166, hl: T.hl * 0.92, hw: T.hw * 0.9 }); }
  return { t: g.t, S, V, P, I, W: W2, C: String(g.C || ''), F: String(g.F || ''), T: g.T, o: g.o, R: String(g.R || ''), A: g.A, pv: g.pv ? g.pv[NET.myPid] : null };
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
  netApplySnaps(now, dt);
  const me = NET.me, s = me.sol;
  if (state === 'play' && s.alive && !M.over) { const I = humanInput(me); NET.lastI = I; netCount(I); }
  else {
    NET.lastI = null;
    if (!s.alive && !M.over) { if (s.deathT > 0) { s.deathT -= dt; trackKiller(s); } else if (state === 'play') deployInput(s, dt); }
  }
  netCosmetics(dt);
  updateCams(dt);
}
function netCount(I) {
  const K = ['jump', 'reload', 'alt', 'nadeCyc', 'gadgetP', 'enter', 'melee', 'spot', null, 'swapW', 'seatNext'];
  for (let i = 0; i < K.length; i++) if (K[i] && I[K[i]]) NET.cc[i]++;
  if (I.crouch || I.proneT || I.stanceCycle) NET.cc[8]++;
  if (I.seatDir >= 0) { NET.cc[11]++; NET.sd = I.seatDir; }
  if (I.seatIdx >= 0) { NET.cc[12]++; NET.si = I.seatIdx; }
  if (I.pickW >= 0) { NET.cc[13]++; NET.pw = I.pickW; }
}
function netDeployReq(s, opt) {
  NET.dep = { n: ++NET.depN, k: s.kit, v: s.var || 0, sc: s.sec || 0, nt: s.nt || 0, o: opt ? opt.name : '' };
  NET.kitPick = { kit: s.kit, var: s.var || 0, sec: s.sec || 0, nt: s.nt || 0 };
  sfx('ui');
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
  const pres = { j: { c: NET.want.c, t: NET.want.t, r: NET.want.r, n: NET.name }, i, d: NET.dep };
  const js = JSON.stringify(pres); if (js === NET.lastPres) return; NET.lastPres = js;
  NET.game.presence(pres).catch(netErr);
}
function netTick() {
  if (NET.msgT > 0) NET.msgT -= 1 / 60;
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
    case 'x': explosionFx(a[1], a[2], a[3], !!a[4]); break;
    case 'd': { const s = MAP.statics[a[1]]; if (s) destroyStatic(s); break; }
    case 'k': netKillFx(a, t); break;
    case 'f': M.feed.unshift({ a: a[1] ? { n: String(a[1]), c: a[2] } : null, how: String(a[3]), b: { n: String(a[4]), c: a[5] }, t: 6 }); if (M.feed.length > 6) M.feed.length = 6; break;
    case 'b': for (let i = 0; i < 2; i++) blood(a[1], a[2], a[3], a[4]); sfx('hurt', a[1], a[2]); break;
    case 't': { M.toasts.push({ txt: String(a[1]), c: String(a[2]), t: +a[3] || 2.5 }); const my = NET.me && NET.me.sol ? NET.me.sol.team : -1; if (a[5] <= 2) sfx(a[5] === 1 && a[4] === my ? 'cap' : 'lost'); break; }
    case 'pp': if (NET.me && a[1] === NET.me.id && NET.me.sol) { const s = NET.me.sol; s.pops.unshift({ txt: String(a[2]), t: 1.8 }); if (s.pops.length > 4) s.pops.length = 4; sfx('points'); } break;
    case 'ps': if (NET.me && a[1] === NET.me.id && typeof a[2] === 'string') sfx(a[2]); break;
    case 's': if (NETSFX[a[1]]) sfx(NETSFX[a[1]], a[2], a[3], (a[4] || 10) / 10); break;
    case 'sm': popSmoke(a[1], a[2]); break;
  }
}
function netKillFx(a, t) {
  const s = M.sol[a[1]]; if (!s) return; const x = a[3], y = a[4];
  if (a[2] === 1) { const ang = a[5] / 100, sp = a[6]; M.flings.push({ color: s.color, dark: s.dark, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, T: rnd(0.7, 1.0), rot: rnd(0, TAU), vr: rnd(-12, 12) }); sfx('splat', x, y); }
  else if (a[2] === 2) { for (let i = 0; i < 6; i++) part({ k: 'steam', x, y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 1, max: 1, sz: 8, drag: 2 }); sfx('splash', x, y); }
  else { const ang = a[6] / 100; addCorpse(s.color, s.dark, x, y, a[5] / 100); for (let i = 0; i < 6; i++) blood(x, y, Math.cos(ang), Math.sin(ang)); sfx('splat', x, y); }
  s.alive = false; s.veh = null; s.seat = -1; s.torch = false; s._deadT = t;
  if (NET.me && s === NET.me.sol) {
    const k = a[7] >= 0 ? M.sol[a[7]] : null;
    s.deathT = 2.2; s.deployIdle = 0; rumble(NET.me, 1, 0.4);
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
    const [a, b, k, ext] = i === myVi ? ps : po, ra = a.V[i], rb = b.V[i];
    if (!ra) { v.active = false; return; }
    if (!v.active) { v.active = true; v.netPos = false; if (v.netSeen) for (let j = 0; j < 12; j++) part({ k: 'dust', x: ra.x + rnd(-40, 40), y: ra.y + rnd(-25, 25), vx: rnd(-30, 30), vy: rnd(-30, 30), life: 1, max: 1, sz: 16, drag: 2 }); }
    v.netSeen = true;
    const px = v.x, py = v.y, pa = v.a, lr = rb && rb !== ra && Math.hypot(rb.x - ra.x, rb.y - ra.y) < 200 ? rb : null;
    if (lr) { v.x = lerp(ra.x, lr.x, k); v.y = lerp(ra.y, lr.y, k); v.a = lerpAng(ra.a, lr.a, k); v.ta = lerpAng(ra.ta, lr.ta, k); v.mgA = lerpAng(ra.mgA, lr.mgA, k); }
    else { v.x = ra.x + ra.vx * ext; v.y = ra.y + ra.vy * ext; v.a = ra.a; v.ta = ra.ta; v.mgA = ra.mgA; }
    v.dead = !!(ra.fl & 2); v.hp = ra.hp; v.recoil = ra.rec; v.heat = ra.heat; v.cd = ra.cd; v.spd = ra.spd * v.T.maxF; v.over = ra.fl & 8 ? 1 : 0; if (ra.fl & 4) v.hitFlash = 0.08;
    v.vx = lr ? lerp(ra.vx, lr.vx, k) : ra.vx; v.vy = lr ? lerp(ra.vy, lr.vy, k) : ra.vy; v.tRel = angDiff(v.a, v.ta); v.mgRel = 0;
    if (v._cN === undefined) { v._cN = ra.cN; v._mN = ra.mN; }
    if (ra.cN !== v._cN) { v._cN = ra.cN; v._cfx = true; }
    if (ra.mN !== v._mN) { v._mfx = Math.min(3, (ra.mN - v._mN + 64) % 64); v._mN = ra.mN; }
    if (v.netPos && v.T.drive) vehTrackFx(v, Math.hypot(v.x - px, v.y - py) + Math.abs(angDiff(pa, v.a)) * 20);
    v.netPos = true;
  });
  // ---- soldiers
  const myTeam = me.team;
  M.sol.forEach((s, i) => {
    const mine = s === me, [a, b, k, ext] = mine ? ps : po, ra = a.S[i], rb = b.S[i];
    if (!ra) { if (s.alive) { s.alive = false; s.veh = null; s.seat = -1; s.torch = false; } return; }
    if (!s.alive) {
      if (s._deadT !== undefined && a.t <= s._deadT) return;            // the kill already played; wait for the next life
      s.alive = true; s.deathT = 0; s.walkT = 0; s._n = ra.sh; s.x = ra.x; s.y = ra.y; s.vx = s.vy = 0; s.firstDeploy = false; s.hp = 100; s.netPos = false;
    }
    const px = s.x, py = s.y, lr = rb && rb !== ra && rb.vi === ra.vi && Math.hypot(rb.x - ra.x, rb.y - ra.y) < 150 ? rb : null;
    let tx, ty;
    if (lr) { tx = lerp(ra.x, lr.x, k); ty = lerp(ra.y, lr.y, k); s.a = lerpAng(ra.a, lr.a, k); s.vx = lerp(ra.vx, lr.vx, k); s.vy = lerp(ra.vy, lr.vy, k); }
    else { tx = ra.x + ra.vx * ext; ty = ra.y + ra.vy * ext; s.a = ra.a; s.vx = ra.vx; s.vy = ra.vy; }
    if (mine && s.netPos && ra.vi < 0 && Math.hypot(tx - px, ty - py) < 60) { const q = 1 - Math.exp(-dt * 22); s.x = lerp(px, tx, q); s.y = lerp(py, ty, q); } else { s.x = tx; s.y = ty; }
    s.netPos = true;
    s.stance = ra.fA & 2 ? 2 : 0; s.swim = !!(ra.fA & 4); s.torch = !!(ra.fA & 8); s.ads = !!(ra.fA & 16); s.protect = ra.fA & 32 ? 1 : 0;
    s.thrownSmoke = !!(ra.fB & 1); s.handT = ra.fB & 2 ? 0.3 : 0; s.kit = ra.kit; s.handK = KITS[s.kit].g;
    if (ra.fB & 4) { if (!s._mel) { s.meleeT = 0.18; s._mel = 1; } } else s._mel = 0;
    s.spotT = (myTeam === 0 && ra.fB & 8) || (myTeam === 1 && ra.fB & 16) ? 1 : 0; s.spotTeam = myTeam;
    s.throwT = ra.thr; s.jumpT = ra.jmp;
    if (!mine || !a.pv) { s.w = [{ id: ra.w, mag: ra.fB & 32 ? 1 : 0, res: 0 }, { id: ra.w, mag: 0, res: 0 }]; s.wi = 0; }
    const v = ra.vi >= 0 ? M.vehicles[ra.vi] : null;
    if (v && v.active) { s.veh = v; s.seat = clamp(ra.seat, 0, v.seats.length - 1); v.seats[s.seat] = s; s.seatT = 0; } else { s.veh = null; s.seat = -1; }
    // walking animation, footprints and the little noises of moving
    const d = s.veh ? 0 : Math.hypot(s.x - px, s.y - py), sp = d / Math.max(dt, 1e-3);
    s.moving = !s.veh && sp > (s.stance === 2 ? 6 : 18); s.walkT += d;
    if (s.moving && !s.swim && !(s.jumpT > 0)) { s.stepAcc += d; if (s.stepAcc > (s.stance === 2 ? 10 : 9)) { s.stepAcc = 0; s.stepSide = -s.stepSide; footprint(s.x, s.y, Math.atan2(s.y - py, s.x - px), s.stance === 2 ? 0 : s.stepSide, s.stance === 2); } }
    if (s.stance === 2 && s.moving && Math.random() < dt * 3) sfx('rustle', s.x, s.y, 0.5);
    if (s.swim && s.moving && Math.random() < dt * 4) { sfx('splash', s.x, s.y, 0.5); part({ k: 'ripple', x: s.x, y: s.y, vx: 0, vy: 0, life: 0.9, max: 0.9, sz: 14, drag: 0 }); }
    if (s._n === undefined) s._n = ra.sh;
    if (ra.sh !== s._n) { s._sfx = Math.min(3, (ra.sh - s._n + 64) % 64); s._n = ra.sh; }
  });
  for (const s of M.sol) if (s.alive && s.veh) updateSeatedPos(s);
  // your own aim answers your hand straight away
  const I = NET.lastI;
  if (me.alive && I && typeof I.aimA === 'number') {
    if (!me.veh && me.stance !== 2) me.a = I.aimA;
    else if (me.veh) { const role = me.veh.T.seats[me.seat].role; if (role === 'rifle') me.a = I.aimA; if (role === 'drive' && me.veh.type === 'tank') me.veh.aimT = I.aimA; }
  }
  if (me.veh && (!I || typeof I.aimA !== 'number')) me.veh.aimT = undefined;
  // shots fire once everyone is in place
  for (const s of M.sol) while (s._sfx > 0) { s._sfx--; netShotFx(s); }
  for (const v of M.vehicles) { if (v._cfx) { v._cfx = false; netCannonFx(v); } while (v._mfx > 0) { v._mfx--; netMgFx(v); } }
  // ---- projectiles (others' timeline)
  const [pa] = po, seen = new Set();
  for (const r of pa.P) {
    let p = NET.pmap.get(r.id);
    if (!p) { p = { k: ['rocket', 'shell', 'nade', 'nade'][r.k], smoke: r.k === 3, nid: r.id, life: 1, h: 0, rot: 0, x: r.x, y: r.y, vx: r.vx, vy: r.vy }; NET.pmap.set(r.id, p); }
    const e = clamp((To - pa.t) / 1000, 0, 0.2); p.x = r.x + r.vx * e; p.y = r.y + r.vy * e; p.vx = r.vx; p.vy = r.vy;
    if (r.k >= 2) { p.h = r.h; p.life = r.life; p.rot += dt * 12; } else { p.life = 1; if (Math.random() < 0.8) part({ k: 'smoke', x: p.x, y: p.y, vx: rnd(-10, 10), vy: rnd(-10, 10), life: 0.6, max: 0.6, sz: p.k === 'rocket' ? 7 : 5, drag: 2 }); }
    seen.add(r.id);
  }
  for (const [id, p] of NET.pmap) if (!seen.has(id)) { p.life = 0; NET.pmap.delete(id); }
  // ---- the slow stuff, once per new snapshot
  if (pa !== NET.lastA) {
    NET.lastA = pa;
    M.items = pa.I; M.wrecks = pa.W;
    for (let i = 0; i < M.crates.length; i++) M.crates[i].live = !!((B64I[pa.C[i / 6 | 0]] || 0) & (1 << (i % 6)));
    M.flags.forEach((f, i) => { const o = B64I[pa.F[i * 2]] || 0, pr = B64I[pa.F[i * 2 + 1]] || 0; f.owner = (o & 3) - 1; f.contested = !!(o & 4); f.prog = clamp(pr / 31.5 - 1, -1, 1); if (Math.abs(f.prog) > 0.985) f.prog = Math.sign(f.prog); if (Math.abs(f.prog) < 0.02) f.prog = 0; });
    if (Array.isArray(pa.T)) M.tickets = [pa.T[0] | 0, pa.T[1] | 0];
    const rr = new Rd(pa.R); for (const s of M.sol) { if (rr.end) break; s.pts = rr.u(3); s.k = rr.u(2); s.d = rr.u(2); s.caps = rr.u(1); s.vk = rr.u(1); }
    if (pa.A) { const ra2 = new Rd(pa.A); for (const s of M.sol) { if (ra2.end) break; s.heal = ra2.u(2); s.rep = ra2.u(2); s.longest = ra2.u(2) * 2; s.rk = ra2.u(1); } }
    if (pa.o && !M.over) { M.over = true; M.overT = 0; M.winner = pa.o[0]; M.winnerSol = M.sol[pa.o[1]] || null; sfx('win'); }
  }
  // ---- what only you see: health, ammo, cooldowns, messages
  const pv = ps[0].pv;
  if (pv) {
    if (me.alive) me.hp = pv[0]; me.respawnT = pv[1] / 10;
    if (me.alive) { me.wi = pv[2] ? 1 : 0; me.w = [{ id: WPNK[pv[3]] || WPNK[0], mag: pv[4], res: pv[5] }, { id: WPNK[pv[6]] || WPNK[0], mag: pv[7], res: pv[8] }]; }
    me.nades = pv[9]; me.smokes = pv[10]; me.mines = pv[11]; me.gcd = pv[12] / 10; me.gmax = pv[13]; me.reloadT = pv[14] / 10; me.reloadMax = pv[15] / 10; me.throwSel = pv[16];
    if (pv[17]) me.hitT = Math.max(me.hitT, pv[17] / 100); if (pv[18]) me.hurtT = Math.max(me.hurtT, pv[18] / 100);
    me.seatT = pv[19] / 100; me.seatMax = pv[20] / 100 || 0.5;
    if (pv[21]) { if (!me.msg || me.msg.txt !== pv[21]) me.msg = { txt: String(pv[21]), t: pv[22] / 10 }; }
  }
  M.proj = NET.bul.concat([...NET.pmap.values()]);
}
/* a shot someone fired, as the host reported it: sound, flash, casing and a tracer that stops at walls */
function netShotFx(s) {
  if (!s.alive || (s.veh && s.veh.T.seats[s.seat].role !== 'rifle')) return;
  const W_ = WPN[cw(s).id]; if (!W_) return;
  const [x, y] = gunTip(s);
  s.firedT = 1.2; s.flash = W_.rocket ? 0.1 : 0.05;
  if (W_.rocket) { rocketFx(s, x, y); return; }
  shotFx(s, W_, x, y);
  const n = W_.pel || 1, sm = (s.ads ? 0.5 : 1) * (s.stance === 2 ? 0.45 : 1);
  for (let i = 0; i < n; i++) { const a = s.a + rnd(-W_.spread, W_.spread) * sm, sp = W_.spd * (W_.pel ? rnd(0.85, 1.1) : 1); NET.bul.push({ k: 'bullet', x, y, ox: x, oy: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: W_.life * (W_.pel ? rnd(0.8, 1.1) : 1), src: s, team: s.team, heavy: W_.dmg >= 40, low: s.stance >= 1 }); }
}
function netCannonFx(v) {
  const c = Math.cos(v.ta), sn = Math.sin(v.ta), px = v.x - 4 * Math.cos(v.a), py = v.y - 4 * Math.sin(v.a);
  const d = v.seats[0]; if (d) d.firedT = 2;
  cannonFx(v, px + c * 96, py + sn * 96, d && d.player && !isNet(d.player) ? d : null);
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
    for (const b of MAP.buildings) { const t = segRect(x0, y0, x1, y1, b, 0); if (t >= 0 && t < bt) { bt = t; hit = 1; } }
    for (const w of M.wrecks) { const t = segWreck(x0, y0, x1, y1, w); if (t >= 0 && t < bt) { bt = t; hit = 1; } }
    staticsNear((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 + 14, _near);
    for (const s of _near) { if (s.type === 'fence' || (s.type === 'bag' && !p.low)) continue; const t = segCirc(x0, y0, x1, y1, s.x, s.y, s.type === 'tree' ? 9 : s.type === 'hay' ? 12 : s.r); if (t >= 0 && t < bt) { bt = t; hit = 1; } }
    for (const s of M.sol) { if (!s.alive || s === p.src || (s.veh && !s.veh.T.seats[s.seat].exposed) || (!M.ffa && s.team === p.team && !M.ff)) continue; const t = segCirc(x0, y0, x1, y1, s.x, s.y, s.veh ? 7 : s.stance === 2 ? 4.5 : 9); if (t >= 0 && t < bt) { bt = t; hit = 3; } }
    for (const v of M.vehicles) {
      if (!v.active || v.dead || v === p.srcV || (p.src && p.src.veh === v)) continue; const vt = vehTeam(v); if (vt >= 0 && vt === p.team && !M.ff) continue;
      if (Math.abs(v.x - x0) > 160 || Math.abs(v.y - y0) > 160) continue;
      const [ax, ay] = toLocal(v, x0, y0), [bx, by] = toLocal(v, x1, y1), t = segRect(ax, ay, bx, by, { x: -v.T.hl, y: -v.T.hw, w: v.T.hl * 2, h: v.T.hw * 2 }, 0); if (t >= 0 && t < bt) { bt = t; hit = 2; }
    }
    if (hit) { const hx = lerp(x0, x1, bt), hy = lerp(y0, y1, bt); p.life = 0; if (hit === 1) sparks(hx, hy, 2); else if (hit === 2) { sfx('ting', hx, hy); sparks(hx, hy, 3); } continue; }
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
    if (s.alive && s.torch && !s.veh) { sfx('torch', s.x, s.y); if (Math.random() < 0.8) { const [tx, ty] = muzzle(s, 16); part({ k: 'spark', x: tx, y: ty, vx: rnd(-140, 140), vy: rnd(-140, 140), life: 0.15, max: 0.15, sz: 1.4, drag: 6 }); } }
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
