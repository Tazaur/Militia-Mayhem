/* =====================================================================
   BOTS, PLAYER INPUT, DEPLOYMENT, MAIN UPDATE, CAMERAS
   ===================================================================== */
const _en = [];
function visibleTo(s, o, d) {
  if (o.firedT > 0 || (o.spotT > 0 && o.spotTeam === s.team)) return true;
  if (o.stance === 2 && d > 240) return false;
  if (o.stance === 1 && d > 380) return false;
  return true;
}
function enemiesOf(s, out) {
  out.length = 0;
  for (const o of M.sol) if (o.alive && isEnemy(s.team, o.team) && (!o.veh || o.veh.T.seats[o.seat].exposed) && o.protect <= 0) out.push(o);
  return out;
}
function findTarget(s, range) {
  let best = null, bd = range;
  enemiesOf(s, _en);
  for (const o of _en) { const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < bd && visibleTo(s, o, d) && los(s.x, s.y, o.x, o.y) && !smokeBlocks(s.x, s.y, o.x, o.y)) { bd = d; best = { o, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, d, veh: null }; } }
  const wantV = (s.veh && s.veh.type === 'tank' && s.seat === 0) || (s.w && s.w[1] && WPN[s.w[1].id].rocket && s.w[1].mag + s.w[1].res > 0) || (s.veh && s.veh.T.seats[s.seat].role === 'mg');
  for (const v of M.vehicles) {
    if (!v.active || v.dead) continue; const vt = vehTeam(v); if (!isEnemy(s.team, vt)) continue;
    const d = Math.hypot(v.x - s.x, v.y - s.y); if (d > range) continue;
    if ((wantV || !best) && los(s.x, s.y, v.x, v.y)) { if (!best || wantV || d < bd * 0.7) { best = { o: null, veh: v, x: v.x, y: v.y, vx: v.vx, vy: v.vy, d }; bd = d; } }
  }
  return best;
}
function pickGoal(s) {
  const B = s.bot;
  if (M.ffa || M.mode === 'tdm') {
    enemiesOf(s, _en);
    let best = null, bd = 1e9; for (const o of _en) { const d = Math.hypot(o.x - s.x, o.y - s.y) + rnd(0, 400); if (d < bd) { bd = d; best = o; } }
    B.goal = best ? { x: best.x + rnd(-60, 60), y: best.y + rnd(-60, 60) } : { x: rnd(200, WW - 200), y: rnd(200, WH - 200) }; B.goalT = rnd(4, 7); return;
  }
  if ((s.hp < 45) && !s.veh) {
    let c = null, cd = 380; for (const k of M.crates) if (k.live) { const d = Math.hypot(k.x - s.x, k.y - s.y); if (d < cd) { cd = d; c = k; } }
    if (c) { B.goal = { x: c.x, y: c.y, crate: true }; B.goalT = 6; return; }
  }
  const scored = M.flags.map(f => {
    let sc = Math.hypot(f.x - s.x, f.y - s.y);
    if (f.owner === s.team) sc += f.cnt && f.cnt[1 - s.team] ? -150 : 900; else if (f.owner === -1) sc -= 250;
    return { f, sc: sc + rnd(0, 500) };
  }).sort((a, b) => a.sc - b.sc);
  const f = scored[0].f, a = rnd(0, TAU), r = rnd(0, f.r * 0.6);
  B.goal = { x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, flag: f }; B.goalT = rnd(8, 14);
}
function botFollow(B, ox, oy, goal, I, dt, grid, arrive) {
  B.pathT -= dt;
  if (!B.path || B.pathT <= 0 || !B.pathGoal || Math.hypot(B.pathGoal.x - goal.x, B.pathGoal.y - goal.y) > 60 || B.pathGrid !== grid) {
    B.path = astar(grid, ox, oy, goal.x, goal.y) || [[goal.x, goal.y]]; B.pathI = 0; B.pathT = rnd(2.5, 4); B.pathGoal = { x: goal.x, y: goal.y }; B.pathGrid = grid;
  }
  let wp = B.path[B.pathI];
  while (wp && Math.hypot(wp[0] - ox, wp[1] - oy) < (B.pathI === B.path.length - 1 ? arrive : (grid === navV ? 45 : 22))) { B.pathI++; wp = B.path[B.pathI]; }
  if (!wp) return false;
  const dx = wp[0] - ox, dy = wp[1] - oy, d = Math.hypot(dx, dy) || 1;
  I.mx = dx / d; I.my = dy / d; return true;
}
function findCover(s, T) {
  let best = null, bd = 150;
  for (const A of MAP.arcs) {
    if (A.lost > 4) continue;
    const d = Math.hypot(A.x - s.x, A.y - s.y); if (d > bd) continue;
    const face = A.a + Math.PI, toT = Math.atan2(T.y - A.y, T.x - A.x);
    if (Math.abs(angDiff(face, toT)) > 1.0) continue;
    if (M.sol.some(o => o !== s && o.alive && !o.veh && Math.hypot(o.x - A.x, o.y - A.y) < 14)) continue;
    bd = d; best = A;
  }
  return best;
}
function newI() { return { mx: 0, my: 0, aimA: null, fire: false, alt: false, altDist: 0, swapW: false, enter: false, reload: false, sprint: false, seatNext: false, seatDir: -1, seatIdx: -1, crouch: false, proneT: false, stanceCycle: false, gadget: false, gadgetP: false, ads: false, jump: false, melee: false, spot: false, pickW: -1, interactSwap: false }; }
function setStance(s, st) { if (st === 1) st = 2; if (s.stance !== st && !s.swim) { s.stance = st; s.stanceT = 0.25; } }
function botControl(s, dt) {
  const B = s.bot, sk = M.skill, I = newI();
  if (M.over) return I;
  B.thinkT -= dt; B.goalT -= dt; B.nadeCd -= dt; B.vehCd -= dt; B.exitCd -= dt; B.gadCd -= dt;
  const v = s.veh, sd = v ? v.T.seats[s.seat] : null;
  if (B.thinkT <= 0) {
    B.thinkT = rnd(0.22, 0.36);
    const range = v ? (sd.role === 'drive' && v.type === 'tank' ? 620 : 520) : (s.kit === 3 ? 640 : 440);
    const nt = findTarget(s, range);
    if (nt && (!B.target || (B.target.o !== nt.o || B.target.veh !== nt.veh))) B.react = sk.react * rnd(0.7, 1.3);
    B.target = nt; B.err = rnd(-1, 1) * sk.err;
    B.idle = nt ? 0 : (B.idle || 0) + 0.3;
    if (!B.goal || B.goalT <= 0 || (B.goal.flag && B.goal.flag.owner === s.team && !(B.goal.flag.cnt && B.goal.flag.cnt[1 - s.team]) && Math.hypot(B.goal.x - s.x, B.goal.y - s.y) < 90) || (B.goal.crate && !M.crates.some(c => c.live && c.x === B.goal.x && c.y === B.goal.y))) { pickGoal(s); B.path = null; }
    if (!v) {
      // cover
      if (nt && nt.d < 460 && !B.cover && s.kit !== 1) B.cover = findCover(s, nt);
      if (B.cover && (!nt || B.cover.lost > 4) && B.idle > 3) B.cover = null;
      // repair job for engineers
      B.repairV = null;
      if (s.kit === 1 && (!nt || nt.d > 320)) { for (const w of M.vehicles) if (w.active && !w.dead && w.T.drive && w.hp < w.T.hp * 0.7 && !isEnemy(vehTeam(w), s.team) && Math.hypot(w.x - s.x, w.y - s.y) < 260 && Math.abs(w.spd) < 30) { B.repairV = w; break; } }
      // vehicles and nests
      if (B.vehCd <= 0 && (!nt || nt.d > 250) && !B.repairV) {
        B.vehCd = rnd(1.5, 3);
        const gd = Math.hypot(B.goal.x - s.x, B.goal.y - s.y);
        let choice = null, cd = 1e9;
        for (const w of M.vehicles) {
          if (!w.active || w.dead) continue; const wt = vehTeam(w); if (isEnemy(wt, s.team)) continue;
          const d = Math.hypot(w.x - s.x, w.y - s.y);
          const humanNear = M.sol.some(o => o.player && o.alive && !o.veh && o.team === s.team && Math.hypot(o.x - w.x, o.y - w.y) < 260);
          if (!w.T.drive) { if (!w.seats[0] && d < 220 && !humanNear && (!B.goal.flag || Math.hypot(B.goal.flag.x - w.x, B.goal.flag.y - w.y) < 360) && Math.random() < 0.5 && d < cd) { cd = d; choice = { w, seat: 0 }; } continue; }
          const driven = !!w.seats[0];
          if (driven && d < 190 && w.hp > w.T.hp * 0.35 && gd > 350) { const free = w.seats.findIndex((o, i) => !o && i > 0); if (free >= 0 && d < cd) { cd = d; choice = { w, seat: free }; } }
          else if (!driven && !humanNear && d < 260 && gd > 650 && w.hp > w.T.hp * 0.5 && !w.seats.some(Boolean)) { if (d < cd) { cd = d; choice = { w, seat: 0 }; } }
        }
        B.wantSeat = choice;
      }
      if (B.wantSeat && (!B.wantSeat.w.active || B.wantSeat.w.dead || B.wantSeat.w.seats[B.wantSeat.seat])) B.wantSeat = null;
      // gadgets
      if (B.gadCd <= 0) {
        const K = KITS[s.kit].g;
        if (K === 'medbag' && (s.hp < 60 || M.sol.some(o => o.alive && !o.veh && o.team === s.team && o !== s && o.hp < 60 && Math.hypot(o.x - s.x, o.y - s.y) < 90))) { I.gadgetP = true; B.gadCd = rnd(8, 14); }
        else if (K === 'ammo' && M.sol.filter(o => o.alive && !o.veh && o.team === s.team && o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 120).length >= 2 && !nt) { I.gadgetP = true; B.gadCd = rnd(15, 25); }
        else if (K === 'mine' && s.mines > 0 && !nt && onRoad(s.x, s.y, 0) && Math.random() < 0.3) { I.gadgetP = true; B.gadCd = rnd(20, 35); }
        else B.gadCd = rnd(1, 3);
      }
    }
  }
  const T = B.target;
  if (T && B.react > 0) B.react -= dt;
  let aimed = false;
  if (T) {
    const bs = v && sd.role === 'drive' ? 760 : 1050, tt = T.d / bs;
    const px = T.x + (T.vx || 0) * tt, py = T.y + (T.vy || 0) * tt;
    const ox = v && sd.role === 'drive' ? v.x : s.x, oy = v && sd.role === 'drive' ? v.y : s.y;
    I.aimA = Math.atan2(py - oy, px - ox) + B.err * (1 + T.d / 400); aimed = B.react <= 0;
  }
  if (!v) {
    let fighting = false;
    if (B.wantSeat) {
      const w = B.wantSeat.w, an = w.T.seats[B.wantSeat.seat].anchor, [ax, ay] = toWorld(w, an[0] * 0.92, an[1] * 0.92);
      const dx = ax - s.x, dy = ay - s.y, d = Math.hypot(dx, dy);
      if (d < 22) { const c = enterCandidate(s); if (c && c.v === w && c.seat >= 0) enterVehicle(s, c); B.wantSeat = null; }
      else { I.mx = dx / d; I.my = dy / d; I.sprint = !T; }
      if (!T) I.aimA = Math.atan2(dy, dx);
      setStance(s, 0);
    } else if (B.repairV) {
      const w = B.repairV, side = toWorld(w, 0, (w.T.hw + 14) * (s.id % 2 ? 1 : -1)), dx = side[0] - s.x, dy = side[1] - s.y, d = Math.hypot(dx, dy);
      if (d > 14) { I.mx = dx / d; I.my = dy / d; } else I.gadget = true;
      setStance(s, 0);
    } else if (B.cover && T) {
      const dx = B.cover.x - s.x, dy = B.cover.y - s.y, d = Math.hypot(dx, dy);
      if (d > 8) { I.mx = dx / d; I.my = dy / d; setStance(s, d < 18 ? 2 : 0); } else { setStance(s, 2); }
      fighting = true;
    } else if (T && T.d < 300) {
      B.strafeT -= dt; if (B.strafeT <= 0) { B.strafeT = rnd(0.8, 1.8); B.strafe = Math.random() < 0.5 ? -1 : 1; }
      const dx = T.x - s.x, dy = T.y - s.y, d = T.d || 1, ux = dx / d, uy = dy / d, k = d > 260 ? 0.6 : d < 150 ? -0.6 : 0;
      I.mx = ux * k - uy * B.strafe * 0.8; I.my = uy * k + ux * B.strafe * 0.8;
      setStance(s, 0); fighting = true;
    } else if (T && s.kit === 3 && T.d < 640) {
      setStance(s, 2); fighting = true;         // recon: go prone and snipe
    } else if (B.goal) {
      const moving = botFollow(B, s.x, s.y, B.goal, I, dt, navS, B.goal.flag ? 30 : 12);
      if (!moving && B.goal.flag) { B.strafeT -= dt; if (B.strafeT <= 0) { B.strafeT = rnd(1, 2.5); B.lx = rnd(-1, 1); B.ly = rnd(-1, 1); } I.mx = B.lx * 0.4; I.my = B.ly * 0.4; }
      I.sprint = !T && Math.random() < 0.9;
      if (!T) I.aimA = Math.atan2(I.my || Math.sin(s.a), I.mx || Math.cos(s.a));
      if (s.stance && (I.mx || I.my) && !T) setStance(s, 0);
    }
    B.stuckT += dt;
    if (B.stuckT > 1.2) { const moved = Math.hypot(s.x - (B.sx || 0), s.y - (B.sy || 0)); if (moved < 12 && (I.mx || I.my) && !s.stance) { B.path = null; B.pathT = 0; B.lx = rnd(-1, 1); B.ly = rnd(-1, 1); B.unstick = 0.5; } B.sx = s.x; B.sy = s.y; B.stuckT = 0; }
    if (B.unstick > 0) { B.unstick -= dt; I.mx = B.lx; I.my = B.ly; }
    if (T) {
      const sec = s.w[1], useRocket = T.veh && WPN[sec.id].rocket && sec.mag + sec.res > 0 && T.d < 430;
      const want = useRocket ? 1 : (s.w[0].mag + s.w[0].res > 0 ? 0 : 1);
      if (s.wi !== want) I.swapW = true;
      B.burst -= dt;
      if (B.burst <= 0) { B.rest -= dt; if (B.rest <= 0) { B.burst = rnd(0.4, 1.1) * sk.rate; B.rest = rnd(0.25, 0.7) / sk.rate; } }
      const W_ = WPN[cw(s).id];
      I.fire = aimed && (B.burst > 0 || W_.rate > 0.3) && T.d < (W_.scope ? 660 : 460);
      if (T.o && T.d < 24) I.melee = true;
      if (s.nades > 0 && B.nadeCd <= 0 && T.d > 110 && T.d < 270 && aimed && Math.random() < 0.08) { I.alt = true; I.altDist = T.d; B.nadeCd = rnd(6, 12); }
      if (s.nades > 0 && T.veh && T.d < 200 && B.nadeCd <= 0) { I.alt = true; I.altDist = T.d; B.nadeCd = rnd(4, 8); }
    } else if (s.wi !== 0 && s.w[0].mag + s.w[0].res > 0) I.swapW = true;
    if (!T && cw(s).mag < WPN[cw(s).id].mag * 0.5 && cw(s).res > 0) I.reload = true;
    return I;
  }
  // ---- seated ----
  if (s.seatT > 0) return I;
  const vt = v;
  if (sd.role === 'drive') {
    if (vt.hp < vt.T.hp * 0.2 && Math.random() < dt * 2) { I.enter = true; return I; }
    let goal = B.goal;
    if ((M.ffa || M.mode === 'tdm') && T) goal = { x: T.x, y: T.y };
    if (vt.type === 'jeep' && T && T.o && !T.o.veh && T.d < 240) goal = { x: T.x, y: T.y };
    if (goal) {
      const near = Math.hypot(goal.x - vt.x, goal.y - vt.y);
      if (near > (goal.flag ? 70 : 30)) botFollow(B, vt.x, vt.y, goal, I, dt, navV, goal.flag ? 70 : 30);
      else if (goal.flag) { const a = Math.atan2(vt.y - goal.y, vt.x - goal.x) + 1.2; I.mx = Math.cos(a) * 0.45; I.my = Math.sin(a) * 0.45; }
      if (goal.flag && goal.flag.owner === s.team && near < 150) B.goalT = Math.min(B.goalT, 1.5);
    }
    B.stuckT += dt;
    if (B.stuckT > 1.5) { const moved = Math.hypot(vt.x - (B.sx || 0), vt.y - (B.sy || 0)); if (moved < 15 && (I.mx || I.my)) { B.unstick = 1.1; B.ua = vt.a + Math.PI + rnd(-0.8, 0.8); B.path = null; } B.sx = vt.x; B.sy = vt.y; B.stuckT = 0; }
    if (B.unstick > 0) { B.unstick -= dt; I.mx = Math.cos(B.ua); I.my = Math.sin(B.ua); }
    if (vt.type === 'tank' && T) I.fire = aimed && T.d < 620 && Math.random() < 0.6;
    if (vt.type === 'jeep' && T && T.o && T.d < 60) I.fire = true;
    if (vt.type === 'jeep' && B.goal && B.goal.flag && B.goal.flag.owner === s.team && Math.hypot(vt.x - B.goal.x, vt.y - B.goal.y) < 120 && Math.abs(vt.spd) < 30 && B.exitCd <= 0 && Math.random() < dt * 0.3) { B.exitCd = 5; I.enter = true; }
    return I;
  }
  if (T) {
    B.burst -= dt; if (B.burst <= 0) { B.rest -= dt; if (B.rest <= 0) { B.burst = rnd(0.5, 1.3) * sk.rate; B.rest = rnd(0.2, 0.6) / sk.rate; } }
    I.fire = aimed && B.burst > 0;
  } else I.aimA = sd.role === 'mg' && !vt.T.drive ? vt.a + Math.sin(M.time * 0.6 + s.id) * vt.T.arc * 0.7 : vt.a + (sd.role === 'mg' ? Math.PI * (vt.type === 'jeep' ? 1 : 0) + Math.sin(M.time * 0.7 + s.id) * 0.9 : (s.seat === 2 ? -1.4 : 1.4));
  if (!T && sd.role === 'rifle' && cw(s).mag < 20 && cw(s).res > 0) I.reload = true;
  if (!vt.T.drive) { if (B.exitCd <= 0 && (vt.hp < vt.T.hp * 0.25 || B.idle > 14)) { B.exitCd = 6; I.enter = true; } return I; }
  B.noDriver = !vt.seats[0] ? (B.noDriver || 0) + dt : 0;
  const goalNear = B.goal && Math.hypot(vt.x - B.goal.x, vt.y - B.goal.y) < 170 && Math.abs(vt.spd) < 40;
  if (B.exitCd <= 0 && (vt.hp < vt.T.hp * 0.25 || B.noDriver > 4 || (goalNear && sd.role === 'rifle' && B.goal.flag && B.goal.flag.owner !== s.team))) { B.exitCd = 4; I.enter = true; }
  return I;
}

/* ---------------- human input ---------------- */
function readPlayers() { for (const p of PLAYERS) p.raw = isNet(p) ? null : devState(p.dev); }
function humanInput(p) {
  const st = p.raw, s = p.sol, I = newI();
  if (!st) return I;
  Object.assign(I, { mx: st.mx, my: st.my, fire: st.fire, alt: st.alt, swapW: !!st.swapW, pickW: st.pickW === undefined ? -1 : st.pickW, enter: !!st.interact, interactSwap: !st.mouse, reload: st.reload, sprint: st.sprint, seatNext: st.seatNext, seatDir: st.seatDir, seatIdx: st.seatIdx, nadeCyc: !!st.nadeCyc, crouch: !!st.crouch, proneT: !!st.proneT, stanceCycle: !!st.stanceCycle, gadget: !!st.gadget, gadgetP: !!st.gadgetP, ads: !!st.ads, jump: !!st.jump, melee: !!st.melee, spot: !!st.spot });
  if (st.mapT && !(s.veh && p.dev.type === 'pad')) { p.mapOpen = !p.mapOpen; sfx('ui'); }
  if (st.mouse) {
    const vw = M.views.find(v => v.p === p) || M.views[0];
    if (vw) {
      const wx = (KB.mouse.x - (vw.x + vw.w / 2)) / vw.cam.z + vw.cam.x, wy = (KB.mouse.y - (vw.y + vw.h / 2)) / vw.cam.z + vw.cam.y;
      let ox = s.x, oy = s.y;
      if (s.veh && s.seat === 0 && s.veh.type === 'tank') { ox = s.veh.x; oy = s.veh.y; } else if (s.veh && s.veh.T.seats[s.seat].role === 'mg') { [ox, oy] = mgPos(s.veh); }
      I.aimA = Math.atan2(wy - oy, wx - ox); I.altDist = Math.hypot(wx - s.x, wy - s.y); p.aimWorld = [wx, wy]; p.aimDist = Math.hypot(wx - ox, wy - oy);
    }
  } else {
    if (st.aim !== null) I.aimA = st.aim;
    else if (st.touch && st.fire) I.aimA = s.veh && s.veh.type === 'tank' && s.seat === 0 ? s.veh.ta : s.veh && s.veh.T.seats[s.seat].role === 'mg' ? s.veh.mgA : s.a;   // tap-fire shoots where you face
    else if (!s.veh && Math.hypot(st.mx, st.my) > 0.3 && !st.fire) I.aimA = Math.atan2(st.my, st.mx);
    I.altDist = 220; p.aimDist = (st.aimMag || 0) * 300;
    if (I.aimA !== null && s.alive) {
      enemiesOf(s, _en); let best = null, bs = st.touch ? 0.3 : 0.13;
      for (const o of _en) { const d = Math.hypot(o.x - s.x, o.y - s.y); if (d > 460) continue; const da = Math.abs(angDiff(I.aimA, Math.atan2(o.y - s.y, o.x - s.x))); if (da < bs && los(s.x, s.y, o.x, o.y)) { bs = da; best = o; } }
      if (best) I.aimA = lerp(I.aimA, I.aimA + angDiff(I.aimA, Math.atan2(best.y - s.y, best.x - s.x)), 0.45);
    }
  }
  return I;
}
/* deploy screen: class, primary variant, spawn point */
const DUI = [];
function pickSpawnDir(opts, cur, dx, dy) {
  const P = o => o.x === undefined ? [WW / 2, WH / 2] : [o.x, o.y], [cx, cy] = P(opts[cur]), L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  let best = -1, bs = -1e9;
  opts.forEach((o, j) => { if (j === cur) return; const [x, y] = P(o), vx = x - cx, vy = y - cy, d = Math.hypot(vx, vy) || 1, c = (vx * ux + vy * uy) / d; if (c < 0.35) return; const sc = c * 1.5 - d / WW; if (sc > bs) { bs = sc; best = j; } });
  return best >= 0 ? best : cur;
}
function deployInput(s, dt) {
  const p = s.player, st = p.raw || {}, opts = spawnOptions(s), K = () => KITS[s.kit];
  s.spawnSel = clamp(s.spawnSel, 0, opts.length - 1);
  const poke = () => { s.deployIdle = 0; sfx('ui'); };
  const changeSlot = (i, d) => { const S = SLOTS[i], n = S.opts(K()).length; if (S.id === 'gad' || n < 2) return; s[S.id] = ((s[S.id] || 0) + d + n) % n; poke(); };
  // bumpers: class · D-pad up/down: loadout slot · D-pad left/right: item in that slot · stick: spawn point on the map
  const kd = st.tabR ? 1 : st.tabL ? -1 : 0; if (kd) { s.kit = (s.kit + kd + KITS.length) % KITS.length; poke(); }
  if (p.dev.type === 'kb' && st.seatIdx >= 0 && st.seatIdx < KITS.length) { s.kit = st.seatIdx; poke(); }
  if (st.dpY) { p.slotSel = ((p.slotSel || 0) + st.dpY + SLOTS.length) % SLOTS.length; poke(); }
  if (st.dpX) changeSlot(p.slotSel || 0, st.dpX);
  if (st.stX || st.stY) { const j = pickSpawnDir(opts, s.spawnSel, st.stX || 0, st.stY || 0); if (j !== s.spawnSel) { s.spawnSel = j; poke(); } }
  const clicks = [];
  if (p.dev.type === 'kb' && KB.mouse.lclick) clicks.push(KB.mouse.lclick);
  if (p.dev.type === 'touch') clicks.push(...TOUCH.taps);
  let deploy = !!st.deploy;
  for (const c of clicks) for (const b of DUI) if (b.p === p && c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h) {
    if (b.act === 'deploy') deploy = true;
    else if (b.act === 'map') { const wx = (c.x - b.mx) / b.k, wy = (c.y - b.my) / b.k; let bj = s.spawnSel, bd = 1e9; opts.forEach((o, j) => { const ox = o.x === undefined ? WW / 2 : o.x, oy = o.y === undefined ? WH / 2 : o.y, d = Math.hypot(ox - wx, oy - wy); if (d < bd) { bd = d; bj = j; } }); s.spawnSel = bj; poke(); }
    else if (b.act.startsWith('kit')) { s.kit = +b.act.slice(3); poke(); }
    else if (b.act.startsWith('slot')) { const [i, d] = b.act.slice(4).split(':').map(Number); p.slotSel = i; changeSlot(i, d); }
    break;
  }
  const ready = s.respawnT <= 0 && (M.ffa || M.tickets[s.team] > 0) && !M.over;
  if (!ready) return;
  if (deploy) { if (NET.role === 'client') netDeployReq(s, opts[s.spawnSel]); else spawnSoldier(s, opts[s.spawnSel]); }
}

/* ---------------- main update ---------------- */
function updateMatch(dt) {
  if (M.over) { M.overT += dt; M.slowT -= dt; }
  const sdt = dt * (M.over ? Math.max(0.25, Math.min(1, 1 - M.slowT * 0.5)) : 1);
  M.time += sdt;
  if (navDirty) { navDirty = 0; buildNav(); }
  M.spotTimer = (M.spotTimer || 0) - sdt; if (M.spotTimer <= 0) { M.spotTimer = 0.5; updateSpotting(); }
  for (const s of M.sol) {
    if (!s.alive) {
      if (M.over) continue;
      s.respawnT -= sdt;
      if (s.player) { if (s.deathT > 0) { s.deathT -= sdt; trackKiller(s); } else if (isNet(s.player)) netDeployHost(s); else deployInput(s, sdt); }
      else if (s.respawnT <= 0 && (M.ffa || M.tickets[s.team] > 0)) spawnSoldier(s);
      continue;
    }
    const I = s.player ? (isNet(s.player) ? netInputHost(s.player) : humanInput(s.player)) : botControl(s, sdt);
    controlSoldier(s, I, sdt);
  }
  for (let i = 0; i < M.sol.length; i++) {
    const a = M.sol[i]; if (!a.alive || a.veh) continue;
    for (let j = i + 1; j < M.sol.length; j++) {
      const b = M.sol[j]; if (!b.alive || b.veh) continue;
      const dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) > 16 || Math.abs(dy) > 16) continue;
      // an online joiner places themselves, so whoever they bump into steps aside the whole way
      const d = Math.hypot(dx, dy), m = 13, fa = a.netAuthT === M.time ? 0 : 1, fb = b.netAuthT === M.time ? 0 : 1;
      if (d < m && d > 0.01 && fa + fb) { const p = (m - d) / (fa + fb); a.x -= dx / d * p * fa; a.y -= dy / d * p * fa; b.x += dx / d * p * fb; b.y += dy / d * p * fb; }
    }
  }
  for (const v of M.vehicles) updateVehicle(v, sdt);
  for (const s of M.sol) if (s.alive && s.veh) updateSeatedPos(s);
  updateProjectiles(sdt);
  updateItems(sdt);
  updateObjectives(sdt);
  updateBounds(sdt);
  for (const c of M.crates) if (!c.live) { c.t -= sdt; if (c.t <= 0) c.live = true; }
  for (const w of M.wrecks) { w.t -= sdt; w.burn -= sdt; }
  if (M.wrecks.some(w => w.t <= 0)) navDirty = 1;
  prune(M.wrecks, w => w.t > 0);
  fxTick(sdt, dt);
  updateCams(dt);
}
/* the purely visual side of a frame: flings landing, smoke, bodies, wreck smoke, particles, feed timers */
function fxTick(sdt, dt) {
  fadePrints(sdt); fadeDecals(sdt); loopsUpdate(dt);
  for (const f of M.flings) {
    f.t += sdt; f.x += f.vx * sdt; f.y += f.vy * sdt; f.vx *= Math.exp(-sdt * 1.2); f.vy *= Math.exp(-sdt * 1.2); f.rot += f.vr * sdt;
    for (const b of MAP.buildings) if (inRect(f.x, f.y, b, 2)) { f.vx *= -0.4; f.vy *= -0.4; f.x += f.vx * sdt * 2; f.y += f.vy * sdt * 2; }
    if (f.t >= f.T) { f.done = true; if (inWater(f.x, f.y)) { sfx('splash', f.x, f.y); part({ k: 'ripple', x: f.x, y: f.y, vx: 0, vy: 0, life: 1, max: 1, sz: 24, drag: 0 }); } else { addCorpse(f.color, f.dark, f.x, f.y, f.rot); for (let i = 0; i < 5; i++) blood(f.x, f.y, f.vx, f.vy); sfx('splat', f.x, f.y); } }
  }
  prune(M.flings, f => !f.done);
  updateSmokes(dt);
  updateCorpses(dt);
  for (const w of M.wrecks) { if (w.burn > 0 && Math.random() < sdt * 18) { part({ k: 'smoke', x: w.x + rnd(-20, 20), y: w.y + rnd(-15, 15), vx: rnd(-8, 8) + 6, vy: rnd(-8, 8) - 4, life: 2.2, max: 2.2, sz: rnd(12, 22), drag: 0.8 }); if (Math.random() < 0.5) part({ k: 'fire', x: w.x + rnd(-20, 20), y: w.y + rnd(-12, 12), vx: rnd(-6, 6), vy: rnd(-6, 6), life: 0.5, max: 0.5, sz: rnd(10, 20), drag: 1 }); } }
  for (const q of M.parts) {
    q.life -= sdt; const dr = Math.exp(-(q.drag || 0) * sdt); q.vx *= dr; q.vy *= dr; q.x += q.vx * sdt; q.y += q.vy * sdt;
    if (q.rot !== undefined) q.rot += (q.vr || 0) * sdt;
    if (q.k === 'smoke' || q.k === 'dust' || q.k === 'steam') q.sz += sdt * 10;
    if (q.k === 'blood' && q.life <= 0 && !inWater(q.x, q.y)) { dgx.setTransform(1, 0, 0, 1, 0, 0); bloodDrop(dgx, q.x, q.y, q.sz, q.rot, 0.92); }
    if (q.k === 'shell' && q.life <= 0) { gx.fillStyle = 'rgba(200,160,60,0.6)'; gx.fillRect(q.x, q.y, 2, 1); }
  }
  prune(M.parts, q => q.life > 0);
  for (const f of M.feed) f.t -= dt; prune(M.feed, f => f.t > 0);
  for (const t of M.toasts) t.t -= dt; prune(M.toasts, t => t.t > 0);
}

/* ---------------- cameras ---------------- */
/* death cam: follow whoever killed you (or the spot they were last seen) before the deploy screen opens */
function trackKiller(s) {
  const k = s.killer; if (!k) return;
  if (k.veh && k.veh.active && !k.veh.dead) { k.x = k.veh.x; k.y = k.veh.y; }
  else if (k.sol && k.sol.alive) { if (k.sol.veh) { k.veh = k.sol.veh; k.x = k.veh.x; k.y = k.veh.y; } else { k.x = k.sol.x; k.y = k.sol.y; } }
}
function focusOf(p) {
  const s = p.sol;
  if (s.alive) { if (s.veh) return [s.veh.x, s.veh.y]; return [s.x, s.y]; }
  if (s.deathT > 0) return s.killer ? [s.killer.x, s.killer.y] : [s.x, s.y];
  const opts = spawnOptions(s), q = opts[clamp(s.spawnSel, 0, opts.length - 1)];
  if (q && q.x !== undefined) return [q.x, q.y];
  return [s.x || WW / 2, s.y || WH / 2];
}
function layoutViews() {
  if (!M) return;
  const humans = M.demo ? [] : LOCALS();
  const old = M.views; M.views = [];
  const mkv = (x, y, w, h, p) => { const o = old.find(v => v.p === p); M.views.push({ x, y, w, h, p, cam: o ? o.cam : { x: WW / 2, y: WH / 2, z: 1 }, shake: 0 }); };
  if (!humans.length || M.cfg.camera === 'shared' || humans.length === 1) { mkv(0, 0, W, H, humans.length === 1 ? humans[0] : null); M.shared = humans.length > 1; return; }
  M.shared = false;
  const n = humans.length;
  const [cols, rows] = n === 2 ? [2, 1] : n <= 4 ? [2, 2] : n <= 6 ? [3, 2] : [4, 2];
  const cw = W / cols, ch = H / rows;
  humans.forEach((p, i) => mkv((i % cols) * cw, Math.floor(i / cols) * ch, cw, ch, p));
}
function updateCams(dt) {
  const humans = M.demo ? [] : LOCALS();
  for (const vw of M.views) {
    vw.shake *= Math.exp(-dt * 8);
    let tx, ty, tz;
    const baseZ = clamp(Math.min(vw.h / 400, vw.w / 560), 0.95, 2.6);
    if (vw.p) {
      const p = vw.p, s = p.sol; [tx, ty] = focusOf(p);
      tz = baseZ * (s.alive && s.veh ? (s.veh.type === 'tank' ? 0.82 : s.veh.type === 'jeep' ? 0.78 : 0.9) : 1);
      if (s.alive) {
        let look = s.veh ? 110 : 70;
        const W_ = !s.veh && s.w ? WPN[cw(s).id] : null;
        if (W_ && W_.scope) { const reach = clamp(p.aimDist || 0, 0, 380); look = 90 + reach * (s.ads ? 1.35 : 1.0); tz *= s.ads ? 0.68 : 0.8; }
        else if (s.ads) { look += 60; tz *= 0.92; }
        tx += Math.cos(s.a) * look; ty += Math.sin(s.a) * look;
        if (s.veh) {
          // pull the camera back and lead it as you pick up speed
          const sp = Math.hypot(s.veh.vx, s.veh.vy), f = clamp(sp / s.veh.T.maxF, 0, 1.2);
          tz *= 1 - 0.3 * f; tx += s.veh.vx * 0.85; ty += s.veh.vy * 0.85;
        }
      } else tz *= 0.8;
    } else if (humans.length) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of humans) { const [x, y] = focusOf(p); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      tx = (x0 + x1) / 2; ty = (y0 + y1) / 2;
      const zFit = Math.min(vw.w / (x1 - x0 + 420), vw.h / (y1 - y0 + 340));
      tz = clamp(Math.min(baseZ, zFit), Math.max(0.32, Math.min(vw.w / WW, vw.h / WH)), baseZ);
    } else {
      M.demoT = (M.demoT || 0) - dt;
      if (M.demoT <= 0 || !M.demoFocus || !M.demoFocus.alive) { const cands = M.sol.filter(s => s.alive && (s.veh || Math.random() < 0.4)); M.demoFocus = cands.length ? pick(cands) : null; M.demoT = rnd(7, 11); }
      if (M.demoFocus) { tx = M.demoFocus.veh ? M.demoFocus.veh.x : M.demoFocus.x; ty = M.demoFocus.veh ? M.demoFocus.veh.y : M.demoFocus.y; } else { tx = WW / 2; ty = WH / 2; }
      tz = baseZ * 0.75;
    }
    const k = 1 - Math.exp(-dt * (vw.p && vw.p.sol && !vw.p.sol.alive && vw.p.sol.deathT > 0 ? 7 : 4.5));
    vw.cam.x = lerp(vw.cam.x, tx, k); vw.cam.y = lerp(vw.cam.y, ty, k); vw.cam.z = lerp(vw.cam.z, tz, 1 - Math.exp(-dt * 3));
    const hw = vw.w / 2 / vw.cam.z, hh = vw.h / 2 / vw.cam.z;
    const EW = WW + SKIRT * 2, EH = WH + SKIRT * 2;           // the camera may follow you into the out-of-bounds band
    vw.cam.x = hw * 2 > EW ? WW / 2 : clamp(vw.cam.x, hw - SKIRT, WW + SKIRT - hw); vw.cam.y = hh * 2 > EH ? WH / 2 : clamp(vw.cam.y, hh - SKIRT, WH + SKIRT - hh);
  }
}
