/* ---------------- props' sprites: trees, pines, a sandbag, a hay bale, the supply crate ----------------
   Made here once per style (applyStyleAssets: SPR), and by the map editor (mapedit/) so what it places looks as in the game.
   Shared: only 2b_ground.js's helpers (gCv, gRng) may be used here. */
function propSprites(grit) {
  const P = {}, rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  { const c = gCv(16, 10), g = c.getContext('2d');
    g.fillStyle = grit ? '#3a3020' : '#5c4518'; rr(g, 0, 0, 16, 10, 4); g.fill();
    g.fillStyle = grit ? '#8a7a56' : '#c9a24a'; rr(g, 1, 1, 14, 8, 3); g.fill();
    g.fillStyle = grit ? '#9c8c66' : '#e0bd66'; g.fillRect(3, 2, 9, 2);
    g.fillStyle = grit ? '#5e5238' : '#8a6a28'; g.fillRect(4, 6, 8, 1); g.fillRect(7, 2, 1, 6); P.bag = c; }
  P.pines = [];
  { const pr = gRng(91);
    for (let v = 0; v < 4; v++) {
      const S = 72, c = gCv(S, S), g = c.getContext('2d'), cx = S / 2, cy = S / 2, spikes = 9 + v;
      const ring = (r0, r1, col, rot) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i <= spikes * 2; i++) { const a = rot + i * Math.PI / spikes, r = i % 2 ? r1 : r0; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill(); };
      const rot = pr() * Math.PI * 2;
      ring(30, 20, grit ? '#141a14' : '#0c2a16', rot); ring(25, 16, grit ? '#24302a' : '#16452a', rot + 0.2); ring(18, 11, grit ? '#34423a' : '#1f5a36', rot + 0.4);
      g.fillStyle = grit ? 'rgba(220,224,226,0.75)' : 'rgba(250,252,255,0.85)'; for (let i = 0; i < 26; i++) { const a = pr() * Math.PI * 2, r = 6 + pr() * 22; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + pr() * 3, 2); }
      g.fillStyle = grit ? '#3e2e22' : '#4a3020'; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
      P.pines.push(c);
    } }
  P.trees = [];
  const tr = gRng(77);
  const tc = grit ? [['#1b2112', 2, 2, 3], ['#2b3519', 0, 0, 0], ['#3b4622', -3, -2, -2], ['#4f5a2e', -8, -4, -4]] : [['#062c06', 2, 2, 3], ['#0e4e0e', 0, 0, 0], ['#1b6a19', -3, -2, -2], ['#2e8a26', -8, -4, -4]];
  for (let v = 0; v < 4; v++) {
    const S = 72, c = gCv(S, S), g = c.getContext('2d');
    const blobs = []; for (let i = 0; i < 7; i++) blobs.push([S / 2 + (tr() - 0.5) * 26, S / 2 + (tr() - 0.5) * 26, 12 + tr() * 9]);
    for (const [col, grow, dx, dy] of tc) for (const [x, y, r] of blobs) { g.fillStyle = col; g.beginPath(); g.arc(x + dx, y + dy, Math.max(2, r + grow), 0, Math.PI * 2); g.fill(); }
    P.trees.push(c);
  }
  // hay bale: a round bale seen from above, its wrap turning from angle 0 (drawn turned to the bale's own angle)
  { const c = gCv(30, 30), g = c.getContext('2d');
    g.fillStyle = grit ? '#857344' : '#c8a64e'; g.beginPath(); g.arc(15, 15, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = grit ? '#665834' : '#a0823a'; g.lineWidth = 1.5; for (const r of [9, 5]) { g.beginPath(); g.arc(15, 15, r, 0, 5); g.stroke(); }
    P.hay = c; }
  // supply crate
  { const c = gCv(18, 18), g = c.getContext('2d');
    g.fillStyle = '#5a2c00'; g.fillRect(0, 0, 18, 18); g.fillStyle = '#f08a14'; g.fillRect(1, 1, 16, 16); g.fillStyle = '#ffae40'; g.fillRect(1, 1, 16, 2);
    g.fillStyle = '#5a2c00'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 9, 10); P.crate = c; }
  return P;
}
