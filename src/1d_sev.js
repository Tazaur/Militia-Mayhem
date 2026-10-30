/* ================= events → sounds (shared with the Sound Lab's EVENTS tab) =================
   The game calls ev(name, x, y, ctx) where something happens; that event's rules decide what plays.
   EVD: event → [group, what happens, { field: [meaning, options] }, flags]. Flags: a = a soldier does it (adds me / ally / bot),
   n = only the host sees it happen, so it's sent on to the other players. Every event at a spot also has dist (px to the
   nearest local player, else the camera).
   A rule: s sound (or fx effect), v volume, p pitch, dl delay s, th min ms between plays, who ('all' at the spot,
   'pl' only that player, 'ui' everyone, no position), F falloff, if condition, off. A condition is a gate { g: 'and' | 'or', c: [...] }
   or a test { f: field, op: '==' '!=' '<' '<=' '>' '>=' 'in', v }; n: 1 inverts either (NOT / NAND / NOR). */
const EVWPN = ['ar', 'br', 'ak', 'smg', 'shotgun', 'lmg', 'hmg', 'sniper', 'dmr', 'pistol', 'mp', 'rpg'], EVVEH = ['tank', 'jeep', 'nest'], EVROLE = ['drive', 'rifle', 'mg'];
const EVD = {
  'shot': ['Weapons', 'A soldier fires a gun (every shot; the bazooka is rocket.fire)', { w: ['weapon', EVWPN], scope: ['1 if it has a scope'] }, 'a'],
  'mg.fire': ['Weapons', 'A mounted MG fires (every bullet, about 13 a second)', { veh: ['mounted on', EVVEH] }, ''],
  'mg.heat': ['Weapons', 'A mounted MG overheats', { veh: ['mounted on', EVVEH] }, 'an'],
  'cannon.fire': ['Weapons', 'A tank fires its cannon', {}, 'a'],
  'rocket.fire': ['Weapons', 'Someone fires the bazooka', {}, 'a'],
  'reload': ['Weapons', 'A reload starts', { w: ['weapon', EVWPN] }, 'an'],
  'weapon.swap': ['Weapons', 'Someone switches weapon', { w: ['new weapon', EVWPN] }, 'an'],
  'gun.empty': ['Weapons', 'Trigger pulled on an empty magazine', { w: ['weapon', EVWPN] }, 'an'],
  'bullet.near': ['Hits & deaths', 'An enemy rifle or pistol bullet passes within 30 px of a player and misses (once per bullet, never MG)', {}, 'an'],
  'bullet.veh': ['Hits & deaths', 'A bullet hits a vehicle hull (not its crew)', { veh: ['vehicle', EVVEH] }, ''],
  'hitmark': ['Hits & deaths', 'A player\'s shot, blast or knife damages something (their hit marker)', { veh: ['1 if a vehicle or nest'] }, 'an'],
  'soldier.hit': ['Hits & deaths', 'A soldier takes damage', { kind: ['cause', ['bullet', 'mg', 'explosion', 'knife', 'crush', 'roof']], dmg: ['damage'], hp: ['health left'] }, 'an'],
  'soldier.down': ['Hits & deaths', 'Co-op: a player goes down', {}, 'an'],
  'soldier.death': ['Hits & deaths', 'A soldier dies', { fling: ['1 if the body is thrown (explosion, mine, fire, run over)'], swim: ['1 if swimming'] }, 'a'],
  'body.land': ['Hits & deaths', 'A thrown body lands', { water: ['1 if in water'] }, ''],
  'knife.swing': ['Hits & deaths', 'Someone swings the knife', {}, 'an'],
  'knife.hit': ['Hits & deaths', 'A knife swing connects', {}, 'an'],
  'explosion': ['Explosions & breaking', 'Something explodes', { r: ['blast radius (px)'], big: ['1 for a big blast'], kind: ['cause', ['grenade', 'rocket', 'shell', 'mine', 'vehicle']] }, ''],
  'prop.break': ['Explosions & breaking', 'A prop is destroyed', { type: ['prop', ['tree', 'hay', 'fence', 'bag', 'nest']] }, ''],
  'wall.ram': ['Explosions & breaking', 'Dev yard: a vehicle rams a wall', { glass: ['1 if glass'] }, ''],
  'roof.fall': ['Explosions & breaking', 'Dev yard: a roof tile falls', {}, ''],
  'wall.collapse': ['Explosions & breaking', 'Dev yard: a wall section collapses', { glass: ['1 if glass'] }, ''],
  'glass.hit': ['Explosions & breaking', 'Dev yard: a glass pane is first hit', {}, ''],
  'veh.crash': ['Vehicles', 'A vehicle crashes', { with: ['hit', ['veh', 'wall']], spd: ['speed'], veh: ['vehicle', EVVEH] }, 'n'],
  'veh.enter': ['Vehicles', 'Someone gets into a vehicle seat', { veh: ['vehicle', EVVEH], role: ['seat', EVROLE] }, 'an'],
  'veh.exit': ['Vehicles', 'Someone gets out of a vehicle', { veh: ['vehicle', EVVEH], role: ['seat they left', EVROLE] }, 'an'],
  'veh.seat': ['Vehicles', 'Someone switches seats inside a vehicle', { veh: ['vehicle', EVVEH], role: ['new seat', EVROLE] }, 'an'],
  'horn': ['Vehicles', 'A jeep driver presses fire', { veh: ['vehicle', EVVEH] }, 'an'],
  'nade.throw': ['Soldier', 'A grenade is thrown', { smoke: ['1 if smoke'] }, 'an'],
  'nade.bounce': ['Soldier', 'A grenade bounces', { wall: ['1 off a wall or prop, 0 off the ground'] }, 'n'],
  'smoke.pop': ['Soldier', 'A smoke grenade pops (not quiet dev-yard dust)', { dust: ['1 for dust'] }, ''],
  'stance': ['Soldier', 'Someone changes stance', { prone: ['1 if now prone'] }, 'a'],
  'crawl': ['Soldier', 'Crawling while prone (random, about 3 a second)', {}, 'a'],
  'swim': ['Soldier', 'Swimming (random, about 4 a second)', {}, 'a'],
  'jump': ['Soldier', 'Someone jumps or vaults', {}, 'an'],
  'torch': ['Items & gadgets', 'An engineer is repairing a vehicle (continuous)', {}, 'a'],
  'gadget.drop': ['Items & gadgets', 'A gadget is placed', { g: ['gadget', ['medbag', 'ammo', 'mine']] }, 'an'],
  'mine.trip': ['Items & gadgets', 'A vehicle drives onto a mine (just before it blows)', {}, 'n'],
  'heal': ['Items & gadgets', 'A med bag is healing a player', {}, 'an'],
  'pickup': ['Items & gadgets', 'A player is resupplied', { k: ['from', ['ammo', 'pouch', 'crate']] }, 'an'],
  'spot': ['Items & gadgets', 'A player presses spot', { n: ['enemies spotted'] }, 'an'],
  'points': ['Match', 'A player earns points', { n: ['points'] }, 'a'],
  'spawn': ['Match', 'A player deploys', { revive: ['1 if revived (co-op)'] }, 'an'],
  'flag': ['Match', 'A point is captured or lost', { captured: ['1 if captured, 0 if lost'], mine: ['1 if it is a local player\'s team'] }, 'n'],
  'tickets.low': ['Match', 'A team is low on tickets', {}, 'n'],
  'wave.start': ['Match', 'Co-op: a wave starts', {}, 'n'],
  'wave.clear': ['Match', 'Co-op: a wave is cleared', {}, 'n'],
  'match.start': ['Match', 'The match starts', {}, ''],
  'match.end': ['Match', 'The match ends', {}, ''],
  'menu': ['Menus', 'Menus: moving, selecting, changing settings; map, grenade type', {}, ''],
  'lobby.join': ['Menus', 'A player joins the lobby', {}, ''],
  'lobby.leave': ['Menus', 'A player leaves the lobby (or is kicked)', {}, ''],
  'ready': ['Menus', 'A player readies up or un-readies', { on: ['1 if now ready'] }, ''],
  'blocked': ['Menus', 'A blocked action (lobby full, can\'t start yet, bad code)', {}, '']
};
const EVLIST = Object.keys(EVD);
const ifIn = (f, v) => ({ f, op: 'in', v }), ifEq = (f, v) => ({ f, op: '==', v });
/* the default rules: exactly what the game played before rules existed */
const SEVD = {
  'shot': [{ s: 'rifle', if: ifIn('w', ['ar', 'smg']) }, { s: 'br', if: ifIn('w', ['br', 'ak', 'dmr']) }, { s: 'pistol', if: ifIn('w', ['pistol', 'mp']) }, { s: 'mg', if: ifIn('w', ['lmg', 'hmg']) }, { s: 'shotgun', if: ifEq('w', 'shotgun') }, { s: 'sniper', if: ifEq('w', 'sniper') }],
  'mg.fire': [{ s: 'mg' }], 'mg.heat': [{ s: 'heat' }], 'cannon.fire': [{ s: 'cannon' }], 'rocket.fire': [{ s: 'rocket' }],
  'reload': [{ s: 'reload', v: 0.6 }], 'weapon.swap': [{ s: 'reload', v: 0.3 }], 'gun.empty': [{ s: 'empty' }],
  'bullet.near': [{ s: 'whiz', who: 'pl' }], 'bullet.veh': [{ s: 'ting' }], 'hitmark': [{ s: 'hit', who: 'pl' }],
  'soldier.hit': [{ s: 'hurt', if: ifIn('kind', ['bullet', 'mg']) }], 'soldier.down': [{ s: 'lost', who: 'ui' }, { s: 'hurt' }],
  'soldier.death': [{ s: 'splash', if: { g: 'and', c: [ifEq('swim', 1), ifEq('fling', 0)] } }, { s: 'splat', if: { g: 'or', c: [ifEq('swim', 0), ifEq('fling', 1)] } }],
  'body.land': [{ s: 'splash', if: ifEq('water', 1) }, { s: 'splat', if: ifEq('water', 0) }],
  'knife.swing': [{ s: 'knife' }], 'knife.hit': [{ s: 'thud' }],
  'explosion': [{ s: 'boom', if: ifEq('big', 0) }, { s: 'bigboom', if: ifEq('big', 1) }, { fx: 'deafen' }],
  'prop.break': [{ s: 'crack', if: ifEq('type', 'tree') }, { s: 'crush', if: { f: 'type', op: '==', v: 'tree', n: 1 } }],
  'wall.ram': [{ s: 'crush', if: ifEq('glass', 0) }], 'roof.fall': [{ s: 'crush', v: 0.6 }],
  'wall.collapse': [{ s: 'glass', if: ifEq('glass', 1) }, { s: 'crumble', if: ifEq('glass', 0) }], 'glass.hit': [{ s: 'glass' }],
  'veh.crash': [{ s: 'clang' }], 'veh.enter': [{ s: 'door' }], 'veh.exit': [{ s: 'door' }], 'veh.seat': [{ s: 'shuffle' }], 'horn': [{ s: 'horn' }],
  'nade.throw': [{ s: 'throw' }], 'nade.bounce': [{ s: 'clink' }], 'smoke.pop': [{ s: 'splash', v: 0.5 }],
  'stance': [{ s: 'rustle' }], 'crawl': [{ s: 'rustle', v: 0.5 }], 'swim': [{ s: 'splash', v: 0.5 }], 'jump': [{ s: 'jump' }],
  'torch': [{ s: 'torch' }], 'gadget.drop': [{ s: 'drop', if: { f: 'g', op: '==', v: 'mine', n: 1 } }, { s: 'beep', if: ifEq('g', 'mine') }], 'mine.trip': [{ s: 'beep' }],
  'heal': [{ s: 'heal', who: 'pl' }], 'pickup': [{ s: 'pickup', who: 'pl' }], 'spot': [{ s: 'ping', who: 'pl' }],
  'points': [{ s: 'points', who: 'ui' }], 'spawn': [{ s: 'spawn', who: 'pl' }],
  'flag': [{ s: 'cap', who: 'ui', if: { g: 'and', c: [ifEq('captured', 1), ifEq('mine', 1)] } }, { s: 'lost', who: 'ui', if: { g: 'and', c: [ifEq('captured', 1), ifEq('mine', 1)], n: 1 } }],
  'tickets.low': [{ s: 'lost', who: 'ui' }], 'wave.start': [{ s: 'lost', who: 'ui' }], 'wave.clear': [{ s: 'cap', who: 'ui' }],
  'match.start': [{ s: 'join', who: 'ui' }], 'match.end': [{ s: 'win', who: 'ui' }],
  'menu': [{ s: 'ui', who: 'ui' }], 'lobby.join': [{ s: 'join', who: 'ui' }], 'lobby.leave': [{ s: 'leave', who: 'ui' }],
  'ready': [{ s: 'join', who: 'ui', if: ifEq('on', 1) }, { s: 'leave', who: 'ui', if: ifEq('on', 0) }], 'blocked': [{ s: 'leave', who: 'ui' }]
};
/* falloff. m 'screen' (default): full at the camera, down by a at the screen's edge (R), silent o·R beyond it.
   'world': full within n px of the nearest local player, silent past f px, curve c. 'flat': always full.
   mu: how much distance muffles (lowpass), rd: how much it adds reverb, pan 0: centred */
const SEVF = { m: 'screen', a: 0.45, o: 1.4, n: 150, f: 900, c: 1, mu: 1, rd: 1, pan: 1 };
function fallK(F, d, R) {
  if (F.m === 'flat') return 1;
  if (F.m === 'world') return d <= F.n ? 1 : d >= F.f ? 0 : Math.pow(1 - (d - F.n) / Math.max(1, F.f - F.n), F.c);
  return d < R ? 1 - F.a * d / R : Math.max(0, (1 - F.a) * (1 - (d - R) / (F.o * R)));
}
/* effects a rule can trigger instead of a sound. deafen (hearing loss): within re × the blast radius of a local player,
   everything muffles to cut Hz (+ far Hz when further off) and a whine rings (f1/v1, f2/v2), recovering over d0 + d1·k s; rm rumble */
const SEVX = { deafen: { re: 1.6, cut: 260, far: 1600, d0: 1.2, d1: 2.2, f1: 3720, v1: 0.05, f2: 4180, v2: 0.03, rm: 0.8 } };
function deafen(A, k, E0) {
  const E = Object.assign({}, SEVX.deafen, E0), c = A.ctx, now = sfxT(A), dur = E.d0 + E.d1 * k, f = A.ear.frequency;
  aHold(f, now); f.exponentialRampToValueAtTime(Math.max(20, E.cut + (1 - k) * E.far), now + 0.05); f.exponentialRampToValueAtTime(20000, now + dur);
  for (const [fq, vv] of [[E.f1, E.v1], [E.f2, E.v2]]) { if (!vv) continue; const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq; const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vv * k), now + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, now + dur); o.connect(g); g.connect(A.master); o.start(now); o.stop(now + dur + 0.1); }
}
/* does event context x pass condition C */
function sevTest(C, x) {
  if (!C) return true;
  let r;
  if (C.g) r = !C.c.length || (C.g === 'or' ? C.c.some(c => sevTest(c, x)) : C.c.every(c => sevTest(c, x)));
  else {
    const a = x[C.f], b = C.v;
    switch (C.op) {
      case 'in': r = (Array.isArray(b) ? b : String(b).split(',').map(s => s.trim())).some(v => v == a); break;     // loose: '1' matches 1
      case '!=': r = a != b; break; case '<': r = +a < +b; break; case '<=': r = +a <= +b; break; case '>': r = +a > +b; break; case '>=': r = +a >= +b; break;
      default: r = a == b;
    }
  }
  return C.n ? !r : r;
}
