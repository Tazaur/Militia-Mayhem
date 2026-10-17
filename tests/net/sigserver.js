// minimal stand-in for the PeerJS public server: same websocket protocol
const { WebSocketServer } = require('/opt/npm-tools/node_modules/ws');
const wss = new WebSocketServer({ port: 9000, path: '/peerjs' });
const clients = new Map(), queue = new Map();
let relayed = 0;
wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams, id = q.get('id'), key = q.get('key');
  if (!id || !q.get('token') || key !== 'peerjs') { ws.send(JSON.stringify({ type: 'ERROR', payload: { msg: 'bad params' } })); ws.close(); return; }
  if (clients.has(id)) { ws.send(JSON.stringify({ type: 'ID-TAKEN', payload: { msg: 'ID is taken' } })); ws.close(); return; }
  clients.set(id, ws); ws.send(JSON.stringify({ type: 'OPEN' }));
  for (const m of queue.get(id) || []) ws.send(JSON.stringify(m)); queue.delete(id);
  ws.on('message', d => {
    let m; try { m = JSON.parse(d); } catch (e) { return; }
    if (m.type === 'HEARTBEAT') return;
    m.src = id;
    if (m.type === 'LEAVE' && !m.dst) { clients.delete(id); return; }
    const to = clients.get(m.dst);
    if (to) { to.send(JSON.stringify(m)); relayed++; }
    else if (m.type !== 'LEAVE' && m.type !== 'EXPIRE') { const l = queue.get(m.dst) || []; l.push(m); queue.set(m.dst, l); setTimeout(() => { const l2 = queue.get(m.dst); if (l2 && l2.includes(m)) { queue.set(m.dst, l2.filter(x => x !== m)); if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'EXPIRE', src: m.dst, dst: id })); } }, 5000); }
  });
  ws.on('close', () => { if (clients.get(id) === ws) clients.delete(id); });
});
setInterval(() => process.stdout.write(''), 1e6);
console.log('sig on 9000');
