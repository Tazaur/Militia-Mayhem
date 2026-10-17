(() => {
  const bc = new BroadcastChannel('mm-mock');
  const ch = { postMessage: m => window.__relaySend ? window.__relaySend(m) : bc.postMessage(m) };
  const me = 'p' + Math.random().toString(36).slice(2, 8);
  const LAT = [25, 70];
  const stats = window.__mock = { me, maxPres: 0, rejects: 0, sent: 0, recv: 0 };
  let lastDeliver = 0;
  const later = fn => { const now = performance.now(), t = Math.max(lastDeliver, now + LAT[0] + Math.random() * (LAT[1] - LAT[0])); lastDeliver = t; setTimeout(fn, t - now); };
  const rooms = {};
  function makeRoom(name) {
    const R = { name, mine: {}, peers: new Map(), hs: [], dirty: false };
    const self = () => ({ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: R.mine, updatedAt: Date.now() });
    R.fire = (joined, left, updated) => { const peers = [self(), ...R.peers.values()]; for (const h of R.hs) try { h({ peers, joined, left, updated }); } catch (e) { console.error(e); } };
    R.api = {
      name,
      presence(patch) {
        const m = { ...R.mine }; for (const k in patch) { if (patch[k] === null) delete m[k]; else m[k] = patch[k]; }
        const n = new TextEncoder().encode(JSON.stringify(m)).length; stats.maxPres = Math.max(stats.maxPres, n);
        if (n > 4096) { stats.rejects++; return Promise.reject({ code: 'invalid_argument', message: 'presence over 4 KiB' }); }
        R.mine = m; R.dirty = true; return Promise.resolve();
      },
      onPeers(h) { R.hs.push(h); setTimeout(() => R.fire([...R.peers.values()], [], []), 0); return () => { }; },
      peers() { return [self(), ...R.peers.values()]; },
      emit() { return Promise.resolve(); }, on() { return () => { }; },
      connected() { return true; }, onConnection(h) { setTimeout(() => h(true), 0); return () => { }; },
      leave() { ch.postMessage({ t: 'bye', room: name, from: me }); delete rooms[name]; return Promise.resolve(); }
    };
    return R;
  }
  setInterval(() => { for (const R of Object.values(rooms)) if (R.dirty) { R.dirty = false; stats.sent++; ch.postMessage({ t: 'pres', room: R.name, from: me, p: R.mine }); } }, 33);
  const onmsg = m => later(() => {
    const R = rooms[m.room]; if (!R) return; stats.recv++;
    if (m.t === 'hello') { ch.postMessage({ t: 'pres', room: m.room, from: me, p: R.mine }); return; }
    if (m.t === 'bye') { const p = R.peers.get(m.from); if (p) { R.peers.delete(m.from); R.fire([], [p], []); } return; }
    if (m.t === 'pres') { let p = R.peers.get(m.from); const isNew = !p; if (!p) { p = { peer: m.from, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: {}, updatedAt: 0 }; R.peers.set(m.from, p); } p.presence = m.p; p.updatedAt = Date.now(); R.fire(isNew ? [p] : [], [], isNew ? [] : [p]); }
  });
  bc.onmessage = e => onmsg(e.data); window.__mockRecv = onmsg;
  const lobby = makeRoom('__lobby'); rooms.__lobby = lobby;
  setTimeout(() => ch.postMessage({ t: 'hello', room: '__lobby', from: me }), 10);
  const api = Object.assign({}, lobby.api, { join(name) { if (rooms[name]) return Promise.resolve(rooms[name].api); const R = makeRoom(name); rooms[name] = R; ch.postMessage({ t: 'hello', room: name, from: me }); return new Promise(r => setTimeout(() => r(R.api), 50)); } });
  addEventListener('beforeunload', () => { for (const n in rooms) ch.postMessage({ t: 'bye', room: n, from: me }); });
  window.__mockKill = () => { for (const n in rooms) ch.postMessage({ t: 'bye', room: n, from: me }); };
  window.claude = { use: async n => n === 'room' ? api : null };
})();
