# Militia Mayhem — handover notes

Read this first. It is the working context from the previous Claude session (Oct 2026).

## The user
- Tazaur. Values directness; dislikes flattery and filler. Short, concrete replies.
- Wants every round of changes deployed (previously: republish the claude.ai artifact each round; now: push to GitHub Pages each round).
- Not a gun expert; supplies his own pixel art.

## What this is
A revival of the user's old top-down 2D combined-arms game: soldiers, tanks, jeeps, MG nests with seats; 1–4 local players
(split / shared screen) plus bots; controller, keyboard+mouse and touch (CoD-mobile style); conquest / TDM / KotH / FFA;
line-of-sight fog; smoke that blocks vision; wrecks as cover; experimental WebAudio sound; and (newest) online play.

Single self-contained HTML (canvas, no frameworks). Source is `src/*.js`, concatenated in filename order by `build.py`.

## Repo / deploy
- GitHub: https://github.com/Tazaur/Militia-Mayhem (public). Intended site: https://tazaur.github.io/Militia-Mayhem/
- GitHub Pages: Settings → Pages → Deploy from a branch → main → / (root). `index.html` at the repo root is the game.
- `python3 build.py` writes `index.html` and `combined-arms.html` (identical) and auto-bumps `version.json`
  (build number shown in the main menu and settings).
  Optional to keep updating; the GitHub Pages site is now the main target.

## Files
- `src/1_core.js` — data (WPN, KITS, SLOTS, colours), canvas helpers, input (padState/kbState/touchState, TOUCH buttons), audio base, settings (CFG, store key `cfg3`), soldier art sets.
- `src/1b_audio2.js` — experimental sound set (SFX2, ear ringing, rocket loops, tank engine, heartbeat music).
- `src/2_maps.js` — seeded deterministic map builder (`mulberry`), decals/footprints canvases, corpses + blood pools, nav grid.
- `src/3_sim.js` — match, spawning, damage, kill, explosion (+`explosionFx`), weapons (+`shotFx/rocketFx/cannonFx/mgFx`), seats, vehicles (+`vehTrackFx/vehDamageFx`), items, projectiles, objectives, `psfx` (per-player sounds), `toast`.
- `src/4_ai.js` — bots, `humanInput`, deploy screen input, `updateMatch` + `fxTick` (cosmetics), cameras, `layoutViews`.
- `src/5_ui.js` — world render, HUD, deploy screen, touch controls, kill feed, minimap, scoreboard.
- `src/5a_icons.js` — vector icons, button badges/hint rows, tactical map.
- `src/5b_fog.js` — line-of-sight vision polygons, remembered world, smoke masks.
- `src/5c_net.js` — online play (see below).
- `src/6_menus.js` — main menu, network menu (host / join-with-code keypad / name entry), settings, lobby (local + online), pause, end screen, main loop (`update`, `runMatch`, `render`).
- `atlas_pack.py` — the atlas tool. Repacks atlas.png/json from the current atlas pixel-for-pixel (no resampling), keeping only what the game draws, one row group per family (vehicles, effects, soldiers, weapon icons, sandbags). Soldier bases + shadows come from `art/art3/sheet.png`, MG / dead turret / sandbags from mounts.py. Idempotent.
- `atlas_m.png` — material atlas, same layout as atlas.png, opaque: R = height above the object's base (4 per px, 0..63 px), G = reflectivity, B = glow. atlas_pack.py carries it per sprite through repacks and auto-generates a first pass (rounded-edge relief from the outline) for sprites that have none; `--remat` regenerates all. Not used by the game yet (WebGL lighting, phase 1).
- `heightmap/index.html` — standalone phone-first material painter (live at /Militia-Mayhem/heightmap/): loads ../atlas.png, ../atlas.json, ../atlas_m.png; 2D paint view + instanced-voxel WebGL2 3D view; per-sprite isolation; pen / erase / ±1 voxel / fill with tolerance / pick; selection is a mask (marquee New / Add / Sub); Copy, Paste, Lift (move in place) float the piece to drag, flip ⇋⇵, turn 45° / 90°, all channels or one; Array drags a selected strip into repeats along an axis (+ gap); a hovering pen / mouse moves the pixel outline; undo spans channels; work kept in IndexedDB (remapped by sprite name if the atlas is repacked); exports atlas_m.png. Drop the exported file in the repo root and run atlas_pack.py.
- `build_atlas.py` — legacy full slice of the original uploads (old format: baked colour variants, classic soldiers, 12 turret frames). A current Pillow changes pixels, so avoid it; if ever needed, run it and then `atlas_pack.py` to convert.
- `harness.js` — Node harness that runs the built game headless with stubbed canvas/pads. Run tests from repo root: `node tests/t5.js` (all maps, bots), `t6` (seats), `t7` (sandbag cover), `t12` (menu→lobby→deploy→death cam flow), `t13` (wreck cover). All should end `errs 0`.
- `tests/net/` — Playwright two-browser tests (Chromium at `/opt/pw-browsers/...`, playwright at `/opt/npm-tools/node_modules/playwright`):
  - (stale since the ntfy switch: `t16.js`/`sigserver.js` still emulate PeerJS) `t16.js` direct WebRTC play from `index.html` via the local signalling stand-in `sigserver.js` (`node tests/net/sigserver.js &` first; uses `ws` from /opt/npm-tools).
  - Pages must be in separate browser contexts (same-context background pages get throttled); messages are relayed through Playwright.

## Online play design (src/5c_net.js)
- Host-authoritative. Host runs the real sim; remote players are `PLAYERS` entries with `dev.type === 'net'`. `LOCALS()` = non-net players (only they get views/HUD/sound/rumble).
- Transport A (default everywhere): WebRTC data channel (unordered, no retransmits). Signalling via ntfy.sh pub/sub (WebSocket subscribe to `mm1-<id>`, HTTP POST to publish; CORS open, no account). Host id `militiamayhem-<code>`; joiner id random. Non-trickle: each side waits up to 2.5 s for ICE gathering and sends one OFFER/ANSWER with candidates embedded; late candidates go as CANDIDATE messages. Host sends ACK on OFFER (no ACK in 8 s = E201 no game). ICE: Google + Cloudflare STUN only, **no TURN**.
- Oct 2026 findings: PeerJS public server (0.peerjs.com) accepts connections but relays nothing; PeerJS TURN (eu-0/us-0.turn.peerjs.com) and openrelay.metered.ca no longer resolve in DNS. A TURN relay now needs a free account (e.g. Metered.ca / ExpressTURN static credentials in `P2P_ICE`).
- Error codes: `NET_E` table in 5c_net.js (1xx matchmaking, 2xx host lookup, 3xx network path/ICE, 4xx data channel, 5xx lobby, 6xx lost host, 7xx WebRTC error). 
etFail(code)` shows a persistent panel with a trace (candidate counts H/S/R per side, mDNS, ICE/gather/link state, relay status, build, browser). Joiners see live step progress in the lobby; the host gets a toast with code + trace for failed joins. `p2pRoom()` mimics the room API (presence/onPeers/leave); state resent every 250 ms, links dropped after 10 s silence. Test overrides: `window.__MM_SIG`, `window.__MM_ICE`.
- Transport B (claude.ai artifact room) was removed in build 63: online play is direct WebRTC only, found through the public game finder.
- Host → clients: presence `{L: lobby info, g: snapshot}` ~20 Hz. Snapshot (`netSnap`) packs soldiers/vehicles/projectiles/items/crates/wrecks/flags/stats as base-64 digit strings, a per-remote-player private block (hp, ammo, cooldowns, messages), and a 0.7 s window of id'd events (explosions, kills, feed, toasts, destroyed statics, whitelisted sounds, smoke pops, per-player pops/sounds). Kept < ~3.9 KB (≈2.2 KB with 22 soldiers).
- Clients: render others 110 ms behind (interpolate), own soldier ~20 ms behind with smoothing and instant local aim; replay events on that timeline; cosmetic tracers from shot counters; local footprints/treads/particles. Input sent as continuous state + edge counters; deploy requests carry loadout + spawn option name.
- Lobby: host's normal lobby; joiners pick colour/team/ready; host starts. No joining mid-match; a leaver's soldier becomes a bot. Max 4 humans total.
- Names: entered before hosting and after typing a code (keypad works with keyboard/pad/touch), saved in localStorage (`store` key `name`), sent in join presence, used as soldier names.

## Status / open issues (as of handover)
- Two-browser tests pass locally (WebRTC from file://, and the mocked room). NOT yet proven between real devices.
- User's real test (PC host, iPhone join, same Wi-Fi) failed because the phone had no working route: iOS Safari won't run a local HTML file; the claude.ai artifact view reported no WebRTC in Safari. Fix in progress: host on GitHub Pages and retest from `https://tazaur.github.io/Militia-Mayhem/` in Safari.
- If it still fails on the same Wi-Fi: ask for the exact message ("NO GAME WITH CODE …" = matchmaking/ID problem; "COULD NOT CONNECT …" = ICE/NAT problem), and test phone on cellular. Likely next step then: a reliable TURN relay (e.g. Metered.ca free tier credentials in `P2P_ICE`) — the "paid relay" was explicitly put on the backburner by the user.
- The "can't play online" screen shows a diagnostic line (WEBRTC / WEBSOCKET).
- Host tab must stay open/visible (hidden tabs throttle; a 40 ms interval keeps the sim going when hidden).
- Waiting on the user for more art ("other stuff"), plus weapon icons for shotgun, HMG, DMR.

## First steps for the new session
1. Confirm push access to Tazaur/Militia-Mayhem; commit this project (source + built `index.html`) to `main`.
2. Make sure GitHub Pages is on (main, root) and the site loads.
3. Ask the user to test PC ↔ phone through the Pages URL and report exact messages.

## Round: scaling / QWERTY / bot names / teams / boarding / skirts
- Menus draw on a virtual surface (min 860x480) scaled by UIS via uiScaled(); UIB entries carry draw scale `k`. HUD/touch are unscaled.
- Name/code entry is a QWERTY pad (padLayout/padNav); E.sel is a key string.
- Leaving joiners become `BOT (NAME)` (botSubName, NET.bn synced in snapshots).
- Host can tap a joiner's team chip; client team requests use counter `tn`.
- CFG.board (ENEMY BOARDING): players may board enemy vehicles; colour/team = lowest occupied seat.
- Map skirt: SKIRT=480 px playable ring outside WW x WH; outOfBounds() > OOB_T (5s) kills ('OUT OF BOUNDS'); empty vehicles wrecked after 10s. drawSkirt in 2_maps.js, countdown in drawViewHUD.
- tests/t17_oob.js covers the OOB kill. Lobby START row is now index 8 (tests press down 8x).

## Netcode round (transport + joiner-owned movement)
- p2pRoom messages are patches `{_q, ...changed keys}`; receiver merges per key and ignores older `_q`. Quiet links get a full resend every 240 ms. `presence(patch, per)` adds per-peer keys (each joiner's own `pv`).
- Host sends fast `g` (S, V, P, F, T, o, E) every 33 ms, about 650 B so it fits in one packet, and slow `gs` (h, ro, nm, bn, I, C, W, R, A) plus `L` every 240 ms as a separate message. Each event is sent in 4 snapshots.
- The client starts a match only once `gs` for that match id has arrived (netRecvSlow / netSlowApply).
- Joiner on foot owns its position: netLocalMove on the client; inputs carry `p:[x,y,vx,vy,jumpT]` and `ca` (correction ack).
  - The host (netInputHost → I.netPos → netAuthMove) follows the report unless it jumps more than 110 px or lands in a building, or host collision pushes it more than 6 px. Then netCorrect bumps s.netCorr (also on every spawn), sent as pv[23].
  - The client snaps to the host position when pv[23] changes (netOwnPos).
  - The host replays joiner reports from a timestamped buffer (p.repBuf, stamped `ct` + min clock gap) 60 ms behind (NET_REP_DELAY, netSample), so arrival jitter doesn't show.
- Lobby picks (colour/team/ready) are held locally for up to 2 s until the host echoes them (want.cT/tT/rT).
- Lag harness: scratchpad pw/lag.js, stress.js, tele.js, veh.js, clag.js (wraps RTCDataChannel.send for delay/jitter/loss per 1.1 KB packet).

## Vehicles + lag compensation round
- Joiner driver owns the vehicle like on foot: netLocalDrive runs vehDrive(v, mx, my, dt, local=true) (drive physics shared with the host's updateVehicle). Inputs carry `vp:[x,y,a,vx,vy,spd,av,tRel]` + `vca`.
  - Host: v.repBuf → netDriveRep / netAuthDrive (replay 60 ms behind, then vehicleCollide). Corrects (netCorrect(v), sent as pv[24]) on a jump > 160 px, inside a building, or a collision push > 14 px. Client snaps in netOwnVeh (NET.vauth / vcorr).
  - vehicleCollide local mode: crushables only slow, other vehicles push us, no damage/sfx (the host decides those).
- Passengers draw the vehicle from the smooth pair (110 ms behind) like everything else; the MG gunner's swivel answers locally (NET.mgV / mgRel).
- Lag compensation: the joiner sends `vt` (its view time on the host clock = now + NET.off - NET_DELAY). The host records ~0.6 s of positions (lagRecord, e.lh) each frame. netTagShots stamps a joiner's new projectiles with `rew = netNow() - vt` (max 400 ms) and moves their origin to the joiner's newest report. updateProjectiles tests soldiers/vehicles/exposed seats at lagAt(e, netNow() - rew). Splash from a joiner's rocket/shell is rewound too (EXP_REW set per projectile in updateProjectiles, read by explosion()). Grenades are not rewound.
- Harness: pw/vdrive.js (driver|passenger smoothness), pw/hit.js (hit rate: host vs joiner, leading aim). ntfy.sh caps anonymous use at 250 messages/day per IP (trace err "RATE LIMITED").
- Own-shot prediction: netPredictShot plays a joiner's rifle shot locally (same gates: mag from pv minus pending, reloadT, weapon rate); the host's echo (sh counter) is skipped while NET.pred > 0; unconfirmed predictions expire after 700 ms. Rockets are not predicted.
- Signalling relays: P2P_SIGS = ntfy.sh, ntfy.envs.net, ntfy.adminforge.de. Every browser listens on all; a send goes to the last relay that worked, moves on at once on refusal (429 = ntfy.sh's 250 messages/day/IP quota) and adds the next relay if one hasn't answered in 1.2 s. Messages carry `mid`, so repeats are dropped. window.__MM_SIG (string or array) overrides.
- Harness: pw/mockntfy.js <port> [429] is a local ntfy stand-in; run harness scripts with MMSIG='["http://localhost:8790"]' to avoid burning real quotas.
- Measured (cell profile, leading aim, 220 px): joiner 80% hits, host 85%, old build 11%. First own tracer 6-12 ms (was ~300 ms).
- Wrecks: stay fully solid for their lifetime (180 s), then fade over the last 2 s (alpha = t/2). Clients count w.t down locally between slow updates.
- Shoving: vehicleCollide shares overlap with other vehicles and wrecks by mass (tank 5, jeep 1.4, wreck = 1.6x its vehicle; nests immovable), turns what it hits on off-centre contact (shove()), and slows the pusher by 5% x its share per step. Measured from rest over 3 s: jeep pushes jeep 54 px/s, tank 17, tank wreck 11; tank pushes jeep 53, tank 24, tank wreck 16. Wrecks are kept out of buildings and mark the bot nav dirty every 30 px moved. tests/t18_push.js.
  - Online: a joiner's local shove moves the other thing only on their screen (o.po, shrinks as the host's picture catches up, netPushOff); the host replaying a joiner's driving (vehicleCollide auth) gives the hit thing the whole overlap. Client wrecks are kept between slow updates and glide (netWrecksSync/netWrecksStep). pw/push.js: 0 corrections, no hitches.

## QoL / lobby round (build 50)
- Seats online: leaving the driver's seat eases the vehicle from our own (ahead) copy back to the host's picture (v.vo, decays over ~0.3 s) instead of jumping; joiners glide between seats (seatFrom/seatT set in the netApplySnaps soldier loop; the own seatT counts down locally and only resyncs to pv[19] on a >0.15 s disagreement). pw/flow.js seatswap: back-jump 32.7 px -> 1.7 px.
- Crash damage between vehicles only on a new contact (v.tch map, 0.4 s) and only from the closing speed along the contact normal, so pushing does no damage. Vehicle HP x1.5 (tank 1350, jeep 390).
- Tank doors: driver at the back [-76,0], gunner either side (anchor + `alts`), riders at the rear corners. nearAnchor/seatAnchor pick the nearest door (enter, bot walk-up, seat hint); exits try every door. tests/t19_tank.js.
- Nest bots: inNestArc() filters targets/firing to the nest's arc. tests/t20_nest.js.
- Engineer gadget is a wrench now (id stays 'torch'; ratchet sfx, cranking wrench in hand, few sparks).
- Fullscreen: isFS()/toggleFullscreen() (webkit fallbacks); icon on the main menu and pause screen, settings row. Host pause shows the game code. Touch HUD has a scoreboard toggle (TOUCH.scoreOn). A cached name skips the name step (✎ on the online menu changes it).
- Mid-match join (lobby row JOIN MID-MATCH, CFG.midjoin, default on; L.mj, cfg[9]): netHostSee -> netMidJoin takes over a bot (dead one first, side with fewer humans; appends a soldier if no bot) and the joiner deploys. netRoster() rebuilds NET.roster/names; joiners apply roster changes in netRosterSync (from netSlowApply, now run at the top of netDecode).
- Reconnect: each tab has NET.cid (sessionStorage) sent as j.id. netBotify remembers NET.left[cid] = soldier index; a returning cid gets that soldier back even with mid-join off (and a new link from a known cid retires the old one). netFail sets err.re for joiners who were in; the error panel shows RECONNECT / CLOSE (netReconnect).
- Back to lobby: couldn't reproduce peers dropping (pw/flow.js lobby, lobby2 pass); hardened anyway: NET.doneMatch ignores snapshots of a finished match.
- Server list: hosts POST {c,n,st,md,mp,nm,mj} to topic mm1-list (netListPub: on change at most every 20 s, else every 3 min; {c,gone} on shutdown or when hidden). The online menu subscribes with since=10m (netListWatch while state === 'netmenu'), netAllHosts merges with claude.ai room hosts, entries older than 400 s drop. Lobby row SERVER LIST shown/hidden (CFG.pub, cfg[10]).
- Harness: pw/flow.js <html> lobby|lobby2|midjoin|reconnect|third|list|seatswap (MJ=0 turns mid-join off). mockntfy now replays history on since= and stamps time.

## Feedback round (builds 51-52)
- Soldiers vs vehicles: pushOutVeh() pushes a soldier on foot out of the hull box (T.hl x T.hw; nests: the circle), host (updateVehicle, now for nests too) and joiner (netLocalMove). The old per-circle push stopped at the first overlapping circle and shoved you into the next one: a persistent walk reached the hull centre. tests/t21_phase.js (16 directions, standing/prone, against a wall).
- Art: art/art4/mounts.png → mounts.py cuts mg / mg_f (firing) / mg_dead / tur_dead, plus bagarc0-2 (used by atlas_pack.py).
- drawMG() draws every mounted MG (nest, tank, jeep) over its gunner; wrecks show tur_dead and mg_dead. Nests draw before tanks/jeeps so turrets stay on top.
- Sandbag crescents: the sheet cells are 171 px apart; the old 196 px crop clipped the intact frame to 120 px and squashed it into a square (1.6x too wide). mounts.bag_frames re-cuts all three (aligned on the intact one) and recomputes bagPts in atlas_extra.json.
- VISION (line of sight) is a match option now: lobby row 'fog', L.cfg[11], match header h[10] → M.cfg.fog; fogViews reads M.cfg.fog only. Removed from Settings.
- Hit markers: hurtVehicle sets src.hitV; vehicles/nests draw four inward right-angle chevrons instead of the diagonal ticks. Online: pv[17] = hitT*100 + 100 when hitV.
- Menus: no bottom hint bars. button({key: [action, dev], keyAt}) / iconButton(..., key, keyAt) / keyTag() pin the key or pad button on the control itself (inside its right end, or left/right/below/above). Lobby slots use that player's own device. Pad LB/RB draw as bumper shapes. New binds prev/next (LB/Q, RB/E), go (START/P), del.
- Lobby fix: Esc on a keyboard is both pause and back; the pause branch used to ready up and start the battle. Now pause only starts when it isn't also back (keyboard start = P).
- Equipment HUD: stance icon removed.
- Tests navigate the lobby with G.MATCH_ROWS.length downs (the row count changed).

## Feedback round (build 53)
- destroyVehicle: crew captured before kill, so a crewed jeep/tank/nest scores and never shows "EMPTY … DESTROYED" (tests/t22_vkill.js).
- Audio: AU.sfx → AU.muf (lowpass) → master; audioTick() drops it to 520 Hz in menus/settings/pause/demo. UI sounds (UISFX) go via AU.ui, never muffled.
- Sniper laser end dot is a red radial gradient. Snow: 5 layers with strong parallax (k 1.3–2.3) and fades to 50% while the camera moves (SNOWCAM).
- Net menu: indexes 0 host, 1 join code, 2 REFRESH (X / R), 3+ games; right arrow walks into the list. netListRefresh() runs on open. netAllHosts only hides your own game while hosting (a joiner kept NET.code after leaving, which hid that game).
- Online text is plain language (NET_E, join steps, toasts); error codes + trace lines stay, under "TECHNICAL DETAILS".
- Duplicate names: host-side dupName(p, raw) by join order → "Also X", "X III", "Another X", "X (but cooler)", "X’s 3rd cousin"…
- Settings: SET_TABS (GRAPHICS, DISPLAY, AUDIO, CONTROLS) as a tab row under the title; LB/RB or Q/E cycle.
- (build 54) MGs draw under their gunner and sit 4 px forward along the aim (mgPos). Gunners use the 'sit' pose. The nest gunner orbits the gun pivot (seatLocal) so they turn with it. Inactive vehicles still call engineUpdate (a wreck's engine used to hum at full volume until respawn). bag_frames zeroes rows from the narrowest row after y=180, so the next crescent on the sheet no longer leaks into bagarc0.

## Atlas without baked colours (build 55)
- Atlas ships ONE soldier per pose (`sol_<pose>`: stand nogun rpg sit dead leg0-2; dark green, pure-white armband) + `nsh_<pose>` shadows. At load, buildTeamSprites() (1_core.js) copies each pose per colour below the shipped atlas with white → CHEX_C[colour], into the runtime canvas BASE; ATLAS['sol_<pose>_<colour>'] slots are registered at script start so lookups work before load. Grit atlas is built from BASE. Use BASE (not IMG) to draw atlas sprites outside spr().
- Turret stripe `bar` and jeep emblem `decal` ship white; tinted(name, colour) maps their grey levels to highlight / colour / shade / tinted metal (colour scaled to full brightness), cached per colour + style.
- Tank turret: `tur` (body + mantlet) and `tur_gun` (cannon, pivot left of the sprite); the cannon is drawn under the body, slid back recoil*33 px (was tur0-11 frames).
- Capture ring is drawn in buildRings() (dark band r 42.6-63.3 at 0.59 alpha, 2 px gaps on the axes, tinted per owner).
- Removed: classic soldiers + the SOLDIER ART setting (CFG.soldiers ignored), full-colour / covert sets, all baked colour variants, keyboard / controller sprites, gore / blood / emblem / ring sprites, orphaned old sandbags. Atlas 640x852 (284 KB) → 384x529 (117 KB); index.html 853 KB → 620 KB.
- HUD icons from art/art4/icons.png (32 px cells, now 96x64) → atlas `ic_enter`, `ic_exit`, `ic_wheel`, `ic_horn`, plus shaded `ic_frag` / `ic_smoke` (SHADED_IC: drawn as painted, untinted, k = s/30). icon(kind) draws them when ATLAS['ic_'+kind] exists: outline kept, white fill painted in the requested colour (artIcon cache), scaled s/26. Enter prompts use 'enter'; driver seat chips and swapping to the driver seat use 'wheel'; other seats keep the vector 'seat'.

## Co-op survival, team colours, pause audio (build 59+)
- atlas.png is the source of truth: atlas_pack.py copies every sprite already in atlas.json pixel-for-pixel and only reads source art for sprites the atlas lacks. Hand-edit atlas.png freely, then `python atlas_pack.py` (repack) and `python atlas_pack.py --sync` (writes icon / mg / mg_f / mg_dead / tur_dead edits back to art/art4/icons.png + mounts.png).
- Colours (6_menus.js): p.pc = the player's own pick. syncLobbyColors() runs every host/local lobby frame: team modes → everyone wears lobbyTeamCols()[team] (LOBBY.tcol, default = the team's first player's pc, never equal to the other team; classic = blue/red, arrows hidden); other modes → own pc, deduped by id. cycleColor → nextColor; host applies via applyColor. Clients send a one-shot pick (NET.want.c + counter cn). newMatch / netMidJoin give humans the team colour.
- Nameplates: 8 px at 0.5 alpha.
- Pause: audioTick fades AU.sfx to 0 while a non-demo match is paused (or settings opened from pause); UI sounds stay on AU.ui.
- CO-OP SURVIVAL (MODES[4], coop: true, team: false): humans on team 0 with their own colours, mhp 200. A fixed pool of 24 team-1 bots (respawnT 1e9) is spawned by updateWaves (3_sim.js): 8 s lead-in, waveSize = (5+3n)·(1+0.5·(humans−1)), concurrency 4+2n(+2/extra human), spawns at spots >520 px from players. WAVE_GUNS: pistols → mp/smg → ak/ar → lmg/dmr → hmg/sniper; rpg secondary from wave 5; nades from wave 3; vehicles from wave 6; M.skill sharpens to wave 10. Limit row = WAVES 10/20/ENDLESS; bots row hidden.
- Down instead of dead (goDown): s.down with s.alive still true, immune, not targeted, bullets pass; a teammate within 28 px for 3 s revives at 50 % (downTick); 30 s bleed-out → kill(). No respawn mid-wave (canDeploy() = wave break); waveCleared revives / heals everyone and lets the dead deploy; startWave force-spawns anyone still on the deploy screen. All humans down/dead → endMatch(1) ("WIPED OUT ON WAVE n").
- Net: snapshot g.WV = [wave, left, brk·10], g.D = [[sol index, bleed s, rev %]] for downed soldiers; the client sets s.down / M.wv from them and stops local input while down.
- Tests: tests/t23_surv.js (team colours + survival). Browser flow: scratchpad pw/flow.js has a 'coop' scenario.

## Build 63
- Forced landscape: on a touch device held upright, resize() sets ROT and turns the canvas 90° with CSS (W/H swapped, SAFE remapped); ptXY(e) maps pointer coords. The rotate-your-phone screen is gone.
- Fullscreen: Safari only allows it inside the tap, so fsGesture() runs from pointerdown (mouse) / pointerup (touch) on UIB entries with `fs: true`; FS_FN only toggles for keys/pads. fsOK() false (iPhone): icons hidden, setting reads SHARE › ADD TO HOME SCREEN.
- Touch sprint: button in the right cluster (at(196,182)), only while moving. Tap = lock; the lock keeps running in the last direction after the stick is let go (TOUCH.lockFree); a new stick touch ends it. The stick-rim auto sprint never fires while prone.
- Pause REDEPLOY (not co-op): redeploy(s) kills with deathT/respawnT 0. Joiners bump NET.rd in presence (`rd`); host compares p.rdN.
- Bodies stay 120 s then fade over 60 (pool still bakes at POOL_T); casings live in M.brass and fade over 15 s (BRASS_T).
- Minimap: enemies (incl. players and enemy-crewed vehicles) only when spotted, heard firing, or seen (fog on: LOS + not smoke within 700; fog off: 300).
- Nameplates hidden behind smoke/walls; smoke fog fully opaque in-cloud; no grenade icon in hand; kill feed right-aligned unless split; deploy screen has no name/skull.
- Bots driving with friendly fire on swerve/slow for teammates on foot ahead (4_ai driver block).
- tests/t24_redeploy.js (redeploy, body/casing timing). Browser: pw/phone.js (portrait phone: rotation, deploy, sprint lock), flow.js 'redeploy' scenario.
- Touch: a stick (move/fire/aim) belongs to the finger that grabbed it until it lifts; extra touches on that side become role 'stray' and are ignored. lostpointercapture also releases a touch.

## Build 65: dev mode (src/5d_dev.js)
- Main menu DEV MODE button (focus 3; down from the cards). `startDev` → `newMatch({...CFG, dev:true, mode:1, bots:0, ...})`, `M.dev`. Local only (refused while networked).
- World size is now variable: `WW/WH` are `let`; `setWorld(w,h)` (2_maps) resizes ground/prints/decals and the nav grid (`NGW/NGH/ASG/ASF/ASS` are `let`). newMatch calls it every match (3000x2000 normally, 48x32 tiles of `TILE=24` in dev).
- Tile yard: `MAP.tiled = {cols, rows, own, rubble, secs, blds}`. A building is a list of sections on the grid; each live section's rect `sec.b` sits in `MAP.buildings`, so collision/bullets/LOS/fog/nav need no changes. `explosion()` ends with `devBlast` (structural multiplier by blast radius `STRUCT_K`: rocket ×1.6, shell ×2, frag ×0.35). At 0 HP `devCollapse` removes the rect, paints rubble tiles, redraws that building's roofs, sets `navDirty`, clears `M.fogMem`.
- `paintGround` hands off to `paintDevGround` when `MAP.tiled`; building shadows are skipped there.
- Dummies: `s.dummy` soldiers get `newI()` instead of `botControl`, respawn in place after 1.5 s (`devReviveDummy`), log TTK from the first hit at full HP (`devHit`/`devKill`).
- Panel (right; backquote toggles): spawn dummy/jeep/tank/nest at a range ahead of last aim, god mode, inf ammo, dummy respawn, line of sight, grid, sections, reset map, heal, log. Clicks are taken in pointerdown (`devClick`) so they never fire.
- Test: tests/t25_dev.js. t12 now checks down → DEV MODE.

## Build 69: grayscale fog; dev yard walls
- Fog: the remembered view (FOG_OUT) is desaturated with a `saturation` composite fill plus a light dim (was a dark tint). FOG_OUT gets the skirt and a backdrop first so the blend never paints over transparent pixels. Every map.
- Height-aware sight was tried in build 67 and removed: sight is occlude-or-not.
- Dev yard is now 48x32 tiles of `TILE=32` with a `SUB=16` wall grid (`MAP.tiled.cell`, `sc x sr` cells: C_OUT/C_FLOOR/C_WALL/C_WIN/C_RUB). The old section rects/roofs/materials are gone.
- `genHouse(R, maxW, maxH)`: rectangle or L outline; rooms by guillotine cuts (3-4 rooms, each >= ROOM_MIN 36 cells and >= 5 a side; the L's inner line is the first cut); one 2-cell door per cut (fewest doors that connect everything); front door (south if possible) and back door on the opposite side; 1-2 windows of 2-3 cells per room on outside walls. Openings keep 2 plain wall cells either side so no wall cell is left alone. Then random transpose/flips. Lots in `DEV_LOTS`; `DEV.seed` (NEW HOUSES button rerolls).
- Wall art: art/walls16.png (embedded by build.py as `WALLS_SRC`): corner, straight, window-middle / tee, cross / end. Piece and rotation come from which 4-neighbours are WALL (`WALL_BY_MASK`); windows don't count, so a wall beside a window draws an end; windows always use the middle piece. Painted into the ground canvas (`paintCell`).
- Sections: straight runs of wall/window cells (corners/junctions join their row's run), cut to <= 6 cells; each live one is a rect in `MAP.buildings`. Windows: `b.glass` - block movement, not sight/bullets (`los`, bullet traces, scope laser, net trace skip glass). `MAP.sight` = merged runs of standing wall, used by `visPoly` instead of `MAP.buildings` (dev only; normal maps don't set it).
- Collapse: cells -> rubble, neighbours repainted (walls next to the hole become ends), `devSight()`, `navDirty`, `M.fogMem = null`.

## Build 71: breakable glass, ramming, junction strength, touch AUTO fire
- Tile sheet (art/walls16.png) row 2 now: end, crumbled end (`CRUMB_T`, joins left like `end`), rubble (`RUB_T`). (2,1) is the broken window `WIN_BROKE`.
- Windows: intact (hp == mhp) draws `WIN_T`, anything less draws `WIN_BROKE`. `devGlass(sec)` takes 1 hp, once, from an intact window. It is called by a bullet/rocket/shell crossing it (3_sim updateProjectiles: `gl`/`gt`), a grenade passing it (updateNade no longer bounces off glass), and a soldier vaulting it (soldierCollide skips glass while `jumpT > 0.04`, and the landing extends while over glass).
- Sections: corners, tees and crosses (a wall cell with wall both across and along) are 1-cell sections with `junc` = number of joins, hp `JUNC_HP` 200/260/320. Straight sections: 30 + 20 per cell (max 150).
- Rubble cells draw `RUB_T`, rotated and flipped per cell by hash. A wall with ≤1 wall joins next to rubble draws the crumbled end, with its jagged side away from what still stands.
- `devDamage(sec, v, x, y)` is the single damage path (blasts, rams, glass). Collapse plays `sfx('crumble')` (rumble plus falling bricks), or 'glass', with 3 dust and 5 debris per cell.
- Ramming: `devRams(v)` runs at the top of vehicleCollide (host/offline only, before the push-back, so a fallen section lets the vehicle through). `RAM[type]` gives wall damage, self damage and speed kept, per unit of speed, with a 0.25 s cooldown per section.
  - Jeep at 200: about 90 to the wall, about 200 to itself, stops.
  - Tank at least 50 effective speed × 2.6: one hit drops a straight or a corner, a tee or cross takes two; about 12 to itself, keeps 80% of its speed.
- Touch AUTO (`TOUCH.auto`, saved as `autofire`): a button at the fire stick cycles ON / OFF / RNG. On foot only; vehicles always behave as ON.
  - ON: as before.
  - OFF: the drag only aims.
  - RNG: the drag aims and fires when `autoLined(s, a)` (4_ai) finds an enemy within the gun's reach (≤420 px) inside the cone `atan(r/d) + 0.04`, with los and no smoke.
  - In OFF and RNG, holding without a drag fires after 150 ms, so starting a drag doesn't shoot.

## Build 72-73: dev yard roofs
- Build 73: the roof covers the whole house, walls and windows included, and is drawn above them.
  - Wall cells are held up by their own section; window cells by the nearest wall.
  - Out of sight it is drawn solid from `ROOF_G`, a grey, dimmed copy painted alongside `ROOF_C`; applyFog no longer draws it.
  - The two roof sight polygons use `visPoly(..., pad = SUB)`, so the wall you're looking at shows.
- `devRoof()` (after devSections) gives every house floor cell `TL.roof[k] = 1` and `TL.rsec[k]` = the wall section holding it up.
  - It runs Dijkstra from every non-glass wall cell at once, with a random 1–2.6 cost per floor cell.
  - So each section's patch is connected to that section through its own tiles (no floating roof when a neighbour falls), and the borders are ragged rather than nearest-wall.
- When a wall section collapses, `devRoofFall(sec)` sets its tiles to `roof = 2`. paintCell then draws the rubble tile over that floor, and dust/debris spawn.
  - Soldiers whose cell is under the falling roof take 50–75% of their max hp (kind 'roof', wname 'ROOF'). Vehicles take 120 (jeep) or 40 (tank).
  - Logged as "ROOF n TILES DOWN".
- Drawing:
  - `ROOF_C` is a world-sized canvas of shingle tiles, with a dark edge where the roof meets anything but a wall.
  - applyFog draws it into the remembered view, so out of sight it is opaque and greyed.
  - `devDrawRoof` (drawWorld layer 4) draws it on a temp canvas, then uses destination-out with two sight polygons from the eye:
    - with glass see-through (`MAP.sight`), 0.7: 30% of the roof is left where it is seen through a window;
    - with glass blocking (`MAP.sightD`), a further 2/3: 10% is left where it is seen directly.
  - With vision off the same applies, and the roof is opaque elsewhere.
- `visPoly(ex, ey, R, walls)` now takes an optional wall list.
- Build 74: fog memory (`FOGK`) is full resolution with no smoothing on tiled maps (set when the memory is created), so walls in shadow stay crisp. Other maps keep half resolution.
- Build 75: in-sight roof opacity is by distance from the eye. `roofOp(d)`: 0 within 60 px, rising linearly to 0.35 at 120 px and staying there; +0.1 when seen through glass. It is a radial-gradient destination-out per eye: the glass-see-through polygon first (keep op + 0.1), then the direct polygon (keep op / (op + 0.1)). Out of sight it stays opaque grey.
- Build 79: roofs fall as a cascade.
  - `TL.rdist` is the hop count from the holding wall. `devRoofFall` queues tiles in `DEV.roofQ` at `rdist × ROOF_STEP` (0.07 s), and devTick lands them with `devRoofTile`.
  - Each landing tile spawns a real smoke-grenade cloud, `popSmoke(x, y, { tint: 'brown', op: 0.5, quiet: true })`. It blocks sight like grenade smoke, for 18 s.
  - Each landing tile also throws debris, plays 'crush', and calls `shakeAt(x, y, 2.5, 420)`. `shakeAt` is a new shared helper, which explosions and the tank cannon now use too.
  - Anyone under a landing tile is hurt once per fall.
  - RESET MAP clears smoke.
  - The rubble tile (sheet cell 2,2) was redrawn in the wall palette.
- Build 79: roofs fall as a cascade.
  - `TL.rdist` is the hop count from the holding wall. `devRoofFall` queues tiles in `DEV.roofQ` at `rdist × ROOF_STEP` (0.07 s), and devTick lands them with `devRoofTile`.
  - Each landing tile:
    - spawns a real smoke-grenade cloud, `popSmoke(x, y, { tint: 'brown', op: 0.5, quiet: true })`, which blocks sight like grenade smoke for 18 s;
    - throws debris and plays 'crush';
    - calls `shakeAt(x, y, 2.5, 420)`, a new shared helper that explosions and the tank cannon now use too;
    - hurts anyone under it, once per fall.
  - RESET MAP clears smoke. The rubble tile (sheet cell 2,2) was redrawn in the wall palette.
  - Fog memory covers roofs too. `fogMemory` keeps `m.rc`, a copy of `ROOF_G` that only updates inside the sight polygons; devDrawRoof uses it as the out-of-sight base.
  - devCollapse no longer resets `M.fogMem`, so collapses out of sight stay unseen until looked at.
- Build 80: roof fade constants are `ROOF_CAP = 0.7` (opacity at 120 px and beyond, was 0.35) and `ROOF_GLASS = 0.15` (extra through glass, was 0.1).
- Build 81: roof dust uses `popSmoke` options `T` (seconds; dust uses 6-15 random) and `shade` (0-3; `SPR.puffB` is now an array of [light, dark] puff pairs). Build 82 fix: `devDust(x, y)` is the collapse dust; falling roof tiles spawn it only on even row + even column, collapsing wall cells (devCollapse, not glass) on the (i+j) even checkerboard. `blastReaches(x, y, tx, ty, d)`: explosions skip soldier damage when a non-glass wall blocks the line (start nudged 4 px toward the target); the effects still play. `clearPath` (any building, glass included) gates `enterCandidate` seats by their door anchor. `barrelHits(v, a)` (pivot to `BARREL` = 96 px): the turret won't step into a wall unless it's already in one, and `fireCannon` with the barrel in a wall spawns the shell at the pivot so it hits that wall.

## Cleanup pass (build 84)
- Shared helpers (use these, don't re-inline): `localSols()`, `viewSols(vw)`, `posOf(s)` (1_core); `engineStop(v)` / `engineOff(v)` (classic + exp engine); `turretPivot(v)`; `vehCircles(v, out, pose)`; `toLocal` (wreckLocal removed); `BLAST` table for shell/rocket; `fullW(id)`, `refillRes(s, frac)`; `stepFx` (local + net walking fx); `pullTrigger(s)`; `bodyPose(s)`; `fadeLayers(dt)` (prints + decals); `WEATHERS`, `cfgPack/cfgUnpack`, `readRoster` (net); `rematch()`.
- Fixed: adjacent walls double-pushed vehicles; exiting a vehicle through a wall; shell/rocket splash on a miss now always hits vehicles; laser composite leak (red dot never drew, 'lighter' stayed on); shadow pose ignored handT.
- Lasers use segment tests instead of a 150-step march; A* uses a closed stamp array and caches f in the heap.
- Build 90: roof fade 0 within 100 px, rising to ROOF_CAP 0.7 at 200 px. Smoke clouds are cached: each cloud composites its puffs into a pooled 160 px canvas (`smokeCache`, redrawn every 0.3 s for the drift) and is drawn as one image. Grenade smoke picks a grey shade per puff (`SPR.puffs.grey/brown`). No smoke on the tactical map. Dev panel: drawn over touch controls; tap off closes it; pad View toggles it and, while open, it takes the pad (D-pad/stick move, ‹› adjusts range, A press, B close) — `devInputs`/`devPad`; pad/touch players start with it shut.
- Build 91: smoke grows with an ease-out over SMOKE_GROW = 4 s (r = R(1-(1-t/4)^2)). smokeRays(c): 8 rays (length R) from the centre at birth, every ~2 s and after 12 px of drift; the shortfalls push the centre away from walls (tx/ty, eased at 1.5/s, capped by the free distance that way); smokeCache pulls puffs back from walls (smokeFree interpolates the rays) and shrinks the base haze.
- Build 92: ONE line-of-sight rule (3_sim, above smokeStr): hard = MAP.sight walls (glass see-through; normal maps set MAP.sight = non-glass buildings) + wrecks; soft = smoke rings SMOKE_RINGS [[1,.1],[.83,.35],[.67,.65],[.5,1]] (fraction of c.r -> occlusion) x smokeStr(c) (fade in/out x op, dust = 0.5), clouds add to 1, thinned within SIGHT_NEAR [10,60] px of the eye. `sees()` (>= SIGHT_MIN 0.5) is used by bots (targets, vehicles, auto-fire, aim help), spotting, recon, names, minimap, fog memory. `los()` is now only blasts. drawSmokeFog paints the same rings (disc + tangent cone per ring, additive on the low-res mask) and the same near bubble, so the mask equals smokeOcc. With vision on, units in smoke are faded by the mask (smokeHides only culls at < 2 %); vision off: hidden under SIGHT_MIN. Trees and hay no longer block sight (still stop blasts). Wrecks are in visPoly and drawn into the remembered view (drawWreck).
- visPoly pad now goes straight in through the hit face (was along the ray: slanted cuts on walls/roofs). Setting GRAPHICS > OUT OF SIGHT (CFG.fogLook grey / partial / dark) via fogLook(); ROOF_G is ROOF_C + fogLook.
- Build 96: LoS rebuilt as layers (supersedes the ROOF_G / MAP.sightD / m.rc / ROOF_GLASS / devDrawRoof notes above).
  - Hard layer: `visPoly(ex, ey, box, walls, pad)` is exact: front faces only, rays a hair (VIS_EPS) either side of each corner + the view box corners, the box edges close it; a ray slipping past a corner adds the corner itself. Pad = SUB in the dev yard, 5 elsewhere (wrecks max 5). Live drawing is clipped to it.
  - Soft layers: `softOcc = min(1, smokeOcc + glassOcc)`; glassOcc = GLASS_OCC 0.25 per window (MAP.glass) the line crosses, either way. sees / sightK / smokeHides / fog memory use softOcc. `softMask(g, ex, ey, box)` paints the same on FOG_MASK (1/FOG_MS = 1/10 res): smoke rings, near-eye hole (SIGHT_NEAR [24, 96], smoke only), then each in-box window + its shadow behind. `drawSoftFog` (was drawSmokeFog) multiplies a second eye's mask in (FOG_MASK2) and overlays the remembered view through it.
  - Roofs are part of the remembered world: `roofView(vw, ...)` (5d) makes this frame's faded roof (ROOF_V, world space); applyFog stamps it into the memory with ground + decals; drawWorld draws it in sight (inside the clip, before the soft mask). Memory starts with ROOF_C (unseen houses roofed). fogLook applies at display only, so the setting needs no repaint.
  - Cloud sprites thin to SMOKE_KEEP 0.25 around this view's eyes (drawSmokes(vis, vw), SMOKE_HOLE temp), so the near-eye thinning shows.
- Build 100: no separate junction sections (JUNC_HP gone). Corners / tees / crosses go with the run along their row (wallRuns); a wall section left with one cell joins the smallest wall section next to it, so a section can bend: s.bs = its rects (each in MAP.buildings, b.sec = s), cx..ch = bounding box, s.n = cells, hp 30 + 20 n. secNear(sec, x, y) / secCells(sec, f) replace sec.b. The SECTIONS overlay outlines cell edges.
- Anti-crawl: drawWorld snaps VOX / VOY to whole device pixels; the soft fog mask sits on a world-fixed grid (offset floor + 1, fraction shifted on upscale, mask is 2 px bigger). Frame-to-frame shimmer moving 0.27 px/frame: ~8600 px -> ~190 (only the player sprite).
- visPoly points are ordered by their own angle (corner points by the exact corner angle).
- Build 102: dev panel SIGHT LINES (DEV.sightDbg, devSightDbg): per eye the faces visPoly tests (orange), rays to every vertex, the outline (cyan), hits (white) and exact corners (yellow, [x, y, 1]); visPoly returns P.faces.
- Build 104: visPoly rebuilt on the vertex rules: every corner of each solid shape (sight rects, wrecks) clipped to the view box (clipBox; where a wall crosses the box edge is a corner) + the box's 4 corners gets one ray; dropped if something is hit more than VIS_TOL (1 px) short of it; an outer corner (shape wholly to one side of the ray) extends past it to the next other-shape face or box edge (unless another shape touches it within 1 px); corner + extension are one unit in the angle sort (far point first when the shape lies further round). No pad on points: each outline edge lying on a wall face (geometric, 0.5 px) gets a strip pad px into the wall (P.strips); polyPath draws polygon + strips, all wound positive (pathPos). ~28-64 points per eye (was ~160-260).

## Build 105
- Wall strips go half way into the wall (pad SUB/2); corners where the outline turns between two faces get a square, so corner walls show in sight.
- Out of sight a tiled house is remembered as its whole roof (ROOF_C stamped into memory): no walls under it, no ROOF_NEAR/FAR fade. roofView is only the live, faded roof in sight.

## Build 106
- A strip's very ends (no wall face beyond) are cut at 45 degrees; an edge shorter than the pad gets a shallower strip, still 45.

## Build 107
- Wrecks no longer block sight (sightBlocked, visPoly). They still block movement, bullets and blasts (los), and are still drawn in the remembered view.

## Build 109
- Craters (scorch) burn into the ground canvas: permanent for the match (decals still fade).
- MAP.glass in the dev yard = intact window sections only (devSight reruns when a window cracks).
- raySeg counts a hit at a segment's very end (u slack 1e-6): rays through the seam of two touching sections no longer slip through and extend (bleed probe 3 -> 0 of 25k wedges). VIS_TOL 2.
- Grid smoke (experimental, dev GRID SMOKE): popSmoke(x, y, { grid }) -> gridSmoke: nearest-first fill of open 16 px tiles (8 ways, no diagonal squeeze), GS_N 90 tiles, GS_STEP 0.3 s per tile, density 1 -> GS_EDGE 0.15 by (d/dmax)^2. Sight: thickest tile crossed (gridOcc, DDA) in smokeOcc; fog mask per pixel from gridOcc (gridMask); drawn as 1 px/tile scaled x16 smoothed (8 px blend). Net 'sm' carries the grid flag.

## Build 111
- Grid smoke is one field (M.gsf, 16 px tiles), not per-cloud: emitters (grenade SMK_NADE 70, dust SMK_DUST 5 x op x T/10, brown) put SMK_EMIT 15 % of what's left into their tile per S-tick (10 Hz). Tiles >= SMK_MIN 0.5 bleed ~SMK_BLEED 35 % (random) to their 4 neighbours, a quarter each; walls/intact windows keep it (smokeSolid, by tile centre; dirty on devSight), cracked windows pass SMK_LEAK 25 %. Random ticks: 10 % chance a tick to lose 0.035. Overlaps just add. Grenade: blocks a line ~14 s, ~100-120 tiles, gone ~26 s.
- Sight: fieldOcc = sum of min(1, amount) x tiles crossed x SMK_K 0.5 (two thick tiles block), DDA in the box of smoky tiles; part of smokeOcc. Mask: fieldOcc per tile centre over the view box, a tile a pixel, smoothed (fieldMask). smokeAny() guards.
- Drawn as a tile-a-pixel image x16 smoothed (8 px blend): per-tile grey drifting on two slow waves, brown share mixed in, an offset dark shade under it, thinned near eyes. 40 dusts: 0.03 ms per S-tick, +0.6 ms draw.
- Soft fog now goes after roofs, fire and tree canopies (drawRoofs shared; also drawn into the remembered view), so smoke/windows fade everything in sight alike. In sight the remembered view is the world now + the dev yard's live roof (rv), so smoke in a room never shows the roof.

## Build 116
- Grid smoke spreads only downhill: a tile's neighbours lowest first, a share (~SMK_BLEED/4, random) goes only if it leaves that neighbour no higher than the tile after passing; no minimum, a tile goes when under SMK_DEL 0.01. Random-tick loss 0.01 (wider, thinner field: blocks ~14 s, gone ~20 s, ~280 tiles).
- Grid dust ignores op (full thickness, amount SMK_DUST x T/10).
- Smoke image and field mask clear and upload their whole canvas: smoothing read stale pixels past the drawn part (the line at the field's edge).

## Build 117
- Grid smoke tile alpha follows haze, 1 - e^(-SMK_VIS x amount) with SMK_VIS 3 (0.3: 60%, 0.5: 78%, 1: 95%), instead of linear in amount. LoS sums along the line, so thin-looking tiles used to block sight while the soft fog showed floor and sandbags through them.

## Build 118
- Grid smoke drawn as soft puffs (the clouds' sprites) instead of a tile image: one per checkerboard tile (an off tile gets one when no neighbour has smoke), radius SMK_PUFF 1.5 tiles + SMK_GROW 0.9 per tile of room (f.R, Chebyshev distance to the nearest solid tile less one, capped 3, built in smokeSolid), scaled 0.6-1 by thickness. Walls/intact windows cut out of the puff canvas; the radius rule keeps a puff short of the far side of any wall. Shade = the puff canvas blacked, 0.28 alpha, offset (4, 6). 40 dusts: drawWorld about 1.6 ms (0.5 without).

## Build 119
- Grid smoke: tile look f.V eases to its thickness at SMK_IN 2.5/s (reset to 0 when a tile turns on), so smoke swells in; puff alpha x (SMK_SMALL 0.5 .. 1) by radius / 3 tiles, so small wall-squeezed puffs are fainter.
- The field reaches SMK_OUT 16 tiles past every map edge (tile i covers world x from (i - SMK_OUT) x GS); fieldOcc shifts its inputs, smokeSolid / smokeEmit / drawSmokeField offset indices. fieldMask unchanged (world tiles).

## Build 126
- Grid smoke random tick loses SMK_RT_D 0.008 + SMK_RT_K 0.05 x min(amount, SMK_RT_A 1): one grenade in an 80-tile room lasts about 37 s (was 73), open air about 20 s (was 24, blocking 9 s).
- Stack cap: an emitter only adds while the 13x13 tiles round it (SMK_CAP_R 6) hold under SMK_CAP = 3 grenades (210); the rest is lost. 5 stacked = 3 stacked.
- Cracked windows are open tiles that take SMK_WIN 0.2 instead of SMK_BLEED 0.35 (SMK_LEAK gone, nothing limits flow out of them).

## Build 129
- Dev panel SMOKE VALUES (DEV.smokeDbg, devSmokeDbg): grid smoke tiles in view tinted by amount, the scale moving with the view: thinnest tile in view blue, thickest red, log between; amount printed when a tile is 18+ screen px.

## Build 134
- Grid smoke is the only smoke: the cloud smoke (M.smokes, rings, smokeRays, smokeCache, SMOKE_RINGS) and DEV.gridSmoke are gone. popSmoke(x, y) = grenade (net event 'sm'), popSmoke(x, y, { dust, T, quiet }) = dust. SMK_NADE 120 (open air blocks about 13 s, room about 48 s life); SMK_CAP = 3 x SMK_NADE.
- Dev panel backdrop height comes from last frame's layout (DEV.ph), so rows never hang off. SIGHT LINES + SMOKE VALUES share a row. SMOKE VALUES numbers always drawn, about 11 px on screen.

## Build 137
- New map OUTSKIRTS (MAPNAMES[4], 3072x2048): 24 tiled houses (genHouse, placed left and mirrored 180°, stampHouse) on a road cross, flags A/B/C, bases, crescents, trees, hay. Tiled helpers shared with the dev yard: newTiled(w, h, seed), stampHouse, tiledFinish (sections, roofs, posts), tiledClear (statics out of houses), paintTiled (houses over normal ground). Roof / rubble randomness uses TL.seed (fixed per map, so online clients match).
- tiledTick (fxTick, host and clients, any tiled map): wall hit flashes + roof-fall queue; devTick no longer does it. Wall damage is host-authoritative online: devDamage sends 'sd' (section, hp x10), clients apply it; roof falls only hurt on the host.
- Tiled nav: NC = SUB (setWorld's 3rd arg), one nav cell per wall cell built from TL.cell: navS 0 open / 1 wall / 2 window (vaultable, +5 cost). lineFree checks ±6 px either side on the fine grid; astar cap 24000 there. Wrecks are marked per wreck in buildNav.
- Bots: vault windows on their path (botFollow sets I.jump within 28 px); MAP.posts (floor cell just inside each window / doorway, a = facing out) used by findCover and by campers (campPost, CAMP_P 5% of new goals, 15-30 s, prone until a target shows). Cover is walked to by path when > 40 px.
- Bot smoke: hurt (hp < 50) or pushing on across open ground under fire -> throwNade(s, d, 'smoke') at 35-50 % of the distance (I.smoke). throwNade's 3rd arg: true frag only, 'smoke' smoke only.
- Return fire through smoke: botHeard (hit by, or hearing unseen fire within 520 px not behind a wall) stores a guess off by 15 % of the distance; for HEARD_T 2.5 s with no target the bot turns to it and fires bursts.
- rectsIn / rectsOnSeg: 128 px bucket grid per rect list (buildings, sight, glass), rebuilt when the list's length changes; used by collision, bullets, nades, sight, glass, rams. OUTSKIRTS 7.3 -> 1.6 ms/frame in the 14-bot test.

## Build 138
(139: front wells pulled in to y 15, so a straight tyre is hidden and only a turned one shows; build.py version hash now includes atlas_extra.json)
- Jeep v2 art (art/art4/jeep.png, imported once by atlas_pack.py while extra.jeepV != 2): jeep0-3 = 100/75/50/25 % hp (by hp fraction, not hullFrame), jeep4 wreck (no decal). Hood decal white when empty, team colour when occupied, 70 % alpha on jeep3. EXTRA.jeepStar = hood centre, EXTRA.jeepWells = [[24,15],[-22,15]] front / rear well centres (mirrored in y): a straight tyre is hidden under the body, only a turned one shows.
- drawJeepWheels: front tyres (jeep_tire) drawn under the body, turned by jeepSteer (tan d = turn rate x wheelbase JEEP_WB / forward speed from draw-to-draw motion, clamp JEEP_LOCK, eased; works for joiners). Wrecks: w.bw (-1 none, 0/1 front, 2/3 rear) = broken-off jeep_wheel, JEEP_BW 60 %; sent in the wreck type byte (1 + 2*(bw+1)).
- Jeep top speed scales to JEEP_SLOW (70 %) with health. Gunner seat / MG mount moved -27 -> -22.
- Grenades: swap only when both kinds remain; when one runs out the selection jumps to the other.
- Exposed crew vs bullets hitting the vehicle: victim = crew on the shot's line on through the vehicle (segCirc r 9), not only within 13 px of the hull hit, so a nest gunner can be shot from the front (60 % gate as before).

## Build 140
- Jeep v3 art (art/art4/jeep.png replaced; atlas_pack imports once while extra.jeepV != 3): new frames, decal, tyre, broken wheel jeep_wheel + flattened jeep_flat, and the mounted MG (mg / mg_f / mg_dead) now from this sheet everywhere (mounts.png no longer supplies them; --sync only writes tur_dead back). mg_f's pivot puts it 2 px kicked back from mg; the glow sits 31 px out.
- Hit flash: FLASH (1_core) > 0 makes spr / sprC / img draw the art a second time with 'lighter' (lit()), so only the art's pixels brighten; drawVehicle sets it from v.hitFlash (0.45), crew are drawn with it off. The white rectangle is gone.
- Wreck shadow: the live vehicle's rounded rect (VT hl / hw, radius 8, offset 4 / 6).
- Wall crashes (vehicleCollide, solid() helper for every solid push): jeep damage JEEP_CRASH (0.0024) x (|spd| - CRASH_V 140)^2: about 0-1 below 160, 11 head-on at top speed (was 8-10 / 28).
- Tyres: wells at y 16. Broken-off wheel: wreckWheel(w) puts it on the ground 3 px out past its well (w.bx / by / ba), so it stays when the wreck is pushed; bf = flattened (50 %). Net type byte 1 + 2 * (bw + 1 + 5 * bf); joiners place it when they first see the wreck.

## Build 141
- Tracers: SPR.tracer (tracer(L, coreRows) in 1_core: white-hot head at x = L, orange core fading to the tail, 3 rows of glow) for rifle 26 / MG 34 / heavy 42 px, drawn normally (additive went lime on grass) through sprC (new sx arg), stretched by min(1, distance from p.ox / oy / L) so the streak grows out of the muzzle.
- MG flash: flashAt(x, y, r, lr) - lr swaps the core for SPR.flashSoft (softDot stops arg: gentle falloff, no hard white disc) and adds a flickering pool of light (SPR.light, radius lr x 0.85-1.12): 'color-dodge' at 0.6 then 'lighter' at 0.2, so the art under it brightens. drawMG uses r 8, lr 32 (64 px).

## Build 142
- Point lights with height-aware shadows (src/5e_light.js). light(x, y, r, h, k, skip) queues one for this frame (skip = its source, which doesn't shade it); lightFx(x, y, r, h, T) fades over T s; drawLights(vis) (drawWorld, after the low particles) adds burning wrecks, keeps the LMAX 10 strongest visible and draws them.
- drawLight: height patch of LC 4 px cells over the light's box (non-glass buildings + tree trunks 255, vehicles / wrecks / bags / hay their LH height, nest = ring of bags); rays keep the lowest (h - height) / distance passed, a cell at D, hc high is lit while that >= (h - hc) / D, so lower things throw shadows that end, walls' don't; walls themselves stay dark. Intensity 0.5 (1 - D/r)^1.3 + 0.5 (1 - D/40)^2, drawn smoothed (soft edges) with color-dodge 0.6 then lighter 0.2.
- Sources: MG flash r 120 at MGH (jeep 32 / tank 44 / nest 22); tank cannon r 220 h 44; explosions (explosionFx) r 2.2 x blast, h 50, 0.35 s; burning wrecks r 110 h 34, flickering. About 1 ms for a firing MG + a burning wreck. flashAt's pool arg became soft (just the soft core).

## Build 143
- Sun (src/5e_light.js, phase 1 of the material lighting): CFG.sun (settings › GRAPHICS › SUNLIGHT, default on; needs WebGL + MAT_SRC, else the old look). drawWorld sets SUNNOW = sunOn(); while on, the old offset shadows are skipped (drawShadowLayer, wreck / tree / hay / fence / crate shadows, non-tiled building shadow polygons).
- drawSun(vw, vis, hidden), after vehicles / projectiles and before the killer glow / particles / point lights: sunHeights draws a half-res (HS 0.5) height canvas HC with 'lighten' (highest surface wins): non-glass buildings SUNH.wall 40 px, tree canopies 56 → 36 px dome, hay 14, fences 9, crates 10, nest bags 10; atlas sprites via hspr(n, x, y, a, base) = matSpr (atlas_m.png R + base x 4, opaque where atlas alpha >= 128, cached per name|base) lifted by SUNB (turret 12, gun 16, tank MG 20, jeep MG 8, crew 12 / 3, standing soldier 7). Same hidden-soldier filters as the frame, so shadows don't give anyone away.
- GL pass (WebGL1, one fullscreen triangle, drawn twice side by side into GC 2w x h): slope vs the sun (normal from the height gradient, wrapped lambert 0.45) and a 24-step jittered march toward the sun (SUN.az -2.36 = up-left, el 0.7 rad) with soft penumbra; left = shade (tinted SUN.tint, multiplied in), right = highlights h / (1 + h) (colour-dodged, x (1 + h), so dark paint isn't greyed). SUNDBG 1 / 2 / 3 shows heights / shade / highlights.
- build.py embeds atlas_m.png as MAT_SRC (in the version hash). Auto first pass: jeep body 14 px.
- Known: the out-of-sight memory (fog) has no sun shading yet.

## Build 144
- Point lights in the sun pass (phase 2): lightsNow(vis) collects the frame's lights (LFX fades, burning wrecks, light() calls; top LMAX 10 by k x r) and empties the queue; with SUNNOW, drawSun sends them as uniforms PL[i] = (x, y in height-buffer px, reach, height in world px), PK[i] = strength, and drawLights (CPU patches) is skipped; sun off: the old CPU drawLight as before.
- Shader per light: drawLight's falloff (spill + hot core), a slope term (normal · direction to the light, relative to flat ground, mixed 0.7) and an 11-step jittered march from the pixel to the light against the heights (soft, so lower things throw shadows that end, walls block what's below their top). Warm colour (1, 0.84, 0.59). It lifts the shade map (lights fill sun shadows), adds to the highlights x 0.6 (dodged), and a third map GC[2w..3w] adds x 0.45 ('lighter'; dodging alone turned grass lime). The third map is only drawn while a light is in view.

## Build 145
- atlas_m.png: Tazaur's hand-painted pass from heightmap/ (jeep bodies: bed 2 px, seats 5, hood 10, windshield + MG post 21; jeep tyres 11 px; sandbag arcs reshaped; boom0 / smoke3 glow).
- Parts stack (hpart): each starts on top of what's already under its rest point (pivot, or the MG mount 4 px behind mgPos, or the seat): hUnder reads the painted heights (atlas_m) of the parts kept so far (hull, turret, jeep body), max within 1 px. Computed now: tank gun / turret 12, tank MG 22, jeep MG 21 (its post), crews on their seats. SUNB keeps only the leg / tripod minimums (stand 7, nest MG 4). Repainting a hull / post moves what sits on it.

## Build 146
- More point lights (light(), so both the sun shader and the CPU path): infantry gunfire (r = flash x 9, 14 px up, k 0.6-0.8, at the flash), soldiers firing from a seat (r 90, 18 px), rocket exhaust in flight (r 80, 14 px), vehicles burning below 25% hp (r 100, 30 px, the wreck flicker). Already lit: cannon, mounted MGs, explosions (lightFx), burning wrecks. LMAX 10 keeps the strongest (k x r).

## Build 147
- No shadow pop-in at the screen edge: the height buffer HC reaches past each view toward the sun by the longest shadow (64 px / tan(el) ~ 76 world px x zoom); the view sits at P = (px, py) inside it (VOX / VOY shifted while heights draw, uniform P in the shader, V = GC height), R clamps to the padded rect, lights offset by P. Height culling widened by the same length (far = vis with r + L). HC only grows. Only the sun side is padded (shadows come in from there), so the extra fill / upload stays small.

## Build 148
- Height spans: HC G = 255 - bottom x 4 (R = top), so a pixel is a span bottom..top ('lighten' keeps the highest top and the lowest bottom). The sun and point-light marches block only where the ray is inside a span (blk), so something with an air gap under it throws a shadow that starts away from its base; walls / hulls run from the ground. (G was reflectivity in matSpr; nothing read it yet: phase 3 needs another home for it.)
- Every part / shape: a start and an add. Start = the top of what it rests on (hUnder) + SUNP[name].lift (air gap); add = px taller than painted (SUNP[name].add, or o.add). SUNP keys: sprite name less its frame digits, or the SUNH shape name (wall, tree, hay, fence, crate, nest). Now: tur_gun lift 4 (gun at 16, floating past the hull). Soldiers: legs as add 7 (solid from the ground), a jump lifts them off it (SUNB.jump 4 x jumpK); the jeep gunner stands in the bed (add 7).

## Build 149
- atlas_m.png repaint: soldiers (stand / nogun / rpg / sit) 13 px (standing: + 7 legs = 20), tank gun 6 px barrel / 8 muzzle brake (at 16: 16..22, under the turret top 23), turret 11, jeep tyres 6.

## Build 150
- Draw order from height: drawWorld collects everything standing on the ground into one list (`at(z, draw, post)`), z = its top in px as the sun pass has it (ZH / SUNH / solZ in 5e_light.js; particles by kind: PZ in 5_ui.js), sorted low to high (ties keep push order). No manual layers: jump dust (3) lands behind the jumper (20), prone men (4) under sandbags (9), roofs at 40, canopies at 56. Vehicles stay one entry (own internal order).
- The light composite now runs after the whole lit list, so roofs and canopies are lit/shadowed (trees shade roofs, flashes light them). Clip for it = sight polys + visible roofs (one Path2D, `FP` built once per frame). `post` entries draw over the light: fire, boom, smoke, steam, flash/spark/ring (added), killer glow.
- Fake shadows left under SUNNOW gone: flag pole, med/ammo items and grenades are in the height pass (grenade a span at its arc height).
- Grain: sun march uses interleaved gradient noise (not white noise) and quadratic steps (fine near the foot, coarse far out), so small things' shadows are solid. Same cost.
- polyPath accepts a Path2D. drawRoofs takes the list from roofsIn(vis).

## Build 151
- Height painter (heightmap/) redesign: rows = menus (File / Edit / View / Settings dropdowns) + undo/redo; sprite + channel; views; context row (only the tool's options + quick selection / paste actions); value row; tool bar (Pen, Erase, Fill, Select, Array, Pick) at the bottom. Inline SVG icons (ICONS, `data-i`).
- Set / Nudge toggle for Pen, Fill and selection Apply: Set writes `st.val`, Nudge adds signed `st.nud` (to the value before the stroke, once per pixel). Nudge range in Settings (±8/16/32/63 for height). The +1 / −1 tools are gone (old prefs map to Pen + Nudge).
- Hold still on the canvas (Settings: off / 0.3 / 0.5 / 0.8 s) takes back the stroke and picks the value (optionally all channels, vibrates), switching to Set. Pick tool uses the same pickAt.
- Pen / mouse hover: outlines the button under it and shows a tooltip (TIPS, or the button's title moved to data-tip) after 0.45 s. View menu: art overlay, mask, pixel grid, readout, layout, fit.

## Build 152
- Height painter: Settings → Pen check… shows the live pointer / mouse events (type, pointerType, buttons, pressure), whether hover arrives, any-hover / any-pointer media and the UA. For the S Pen hover not reaching the page. Known causes (research): Chrome on Android stops sending stylus hover to a tab after its file chooser opens (Import PNG) or a PWA switch, until a new tab (reload doesn't help); installed-app pages never get it; autofill services (1Password) kill hovers; Samsung Air View features can swallow hover.

## Build 153
- Height painter: art overlay button back on the top bar (next to the channels). Context and value rows are fixed height and only hide their contents (visibility), so the views never shift when the tool changes.
- 3D view Lit look (default; Channel = the old tinted view, toggle on the 3D view): sun + hemisphere sky ambient, reflectivity mirrors the sky with fresnel and a sun highlight that sharpens with it, glow emits and blooms (MSAA scene + glow target, glow blurred twice at half res, added with a soft shoulder). Scene menu (sun button on the 3D view): sky presets Game / Clear day / Overcast / Dusk / Night, sun turn, sun height, reflection and bloom strength. Art off = plain grey to judge materials alone.

## Build 154
- New atlas_m (hulls 38–39, jeeps 37, turret 11, gun 8, windshield reflectivity, MG glow). Standing soldiers got `SUNB.stand = 18` added (gone since build 235: they stand on their walk underside) to their painted height (solid from the ground, no gap); prone uses the art as is.
- Heights come from the art, not tables: `matData()` (material + colour alpha, no WebGL needed), `artH(n, lx, ly)` (painted height at a sprite point, stepping back toward the pivot past its edge), `artMax(n)`. `partsOf(o)` builds a soldier's / vehicle's / wreck's stacked parts once a frame (hpart collects instead of drawing; sunHeights draws them via hParts); `partH`, `topOf` (crew left out).
- Spawn heights: `gunH(s)` (muzzle: stand 25, prone 7; seated crew from their seat on the stack), `handH(s)` (grenade start: 26 / 8), `mgH(v)`, `canH(v)`, `shotZ(p)` (projectile height, cached on first use). Lights, draw order (bullets by their height, vehicles / wrecks by topOf, sandbag arcs by artMax), muzzle / exhaust / trail / burning smoke (`part.z`) all use them. MGH and the old ZH entries are gone (ZH keeps body / item / shot fallback / smoke).
- Grenades start at the hand (`h0`) with vh lowered so they land when a ground throw would (range unchanged); drawn lifted by their height above the hand-to-landing line (`nadeY`), so no jump at the throw.
- Smoke and dust are lit: the smoke field's puffs (`smokePuffs`, shared by the look and the heights) and smoke / steam / dust particles go into the height buffer as noise-bumped domes (`dome(top, base, variant)`, 32 px, cached) as tall as they're thick (field: opacity × SMK_HT 40; particles: from their spawn height, rising). B = 255 marks haze: its shadows are 35 % strength (shader `blk` returns how much a pixel blocks). Clipped off walls. The smoke field is now in the draw queue at ZH.smoke (60) before the light; its fake offset shadow only without the sun. Smoke / steam particles are lit (PZ mode 0).

## Build 155
- Sun heights on the GPU: no second Canvas 2D drawing of the world and no per-frame texture upload. sunHeights now only fills instance lists (HL.a MAX blended, HL.w walls written over, so smoke haze doesn't leak into them; HL.t trees MAX) with `hq` / `hbox` / `hspr`; `sunDrawHeights` draws them instanced (ANGLE_instanced_arrays) into the height texture HT through a framebuffer with EXT_blend_minmax MAX, and the light shader samples HT. One height program, kinds: 0 sprite (atlas R + base / add, opaque where atlas.png alpha ≥ 128), 1 box, 2 disc (radial top, bottom), 3 ring arc (nest bags), 4 haze dome (procedural value noise, B = 255). matSpr, the HC canvas and the dome canvas cache are gone. Needs both extensions (near universal); without them the sun is off (old look). SUNDBG 1 still shows the heights (shader Q 3).
- Headless frame 12.1 → 10.2 ms in the smoke + vehicles test.

## Build 156
- Materials on the GPU: a material pass (depth test, highest top wins) writes MT (R reflectivity, G glow, B water) from atlas_m G/B, plus water (0.75, ripples), ice (0.45), bridges (0) and swimmers. The composite: reflective paint mirrors the sky (`SUN.sky`, `skyRain` in rain) and glints with the sun along its slope; water ripples (value-noise normals); glow brightens its art ×1.5 and blooms (12 golden-angle taps, only when something glows); point lights scatter in rain. SUNDBG 5 shows MT. Shader hash is the fract hash (no big sin: it split between cells).
- Smoke back to the 153 look (154's lit haze domes looked thin, see-through and murky): the smoke field draws over the light again (after soft fog), solid; smoke / steam particles back to PZ mode 1. Volume without the light: each puff sprite is a sunlit billow (`softDot(..., lit)`: bright sunward, darker far side, in its own alpha) and the field's silhouette laid on itself stepped away from the sun (`SMK_SELF`) shades its far side. Its ground shadow is its silhouette offset `SMK_DROP` away from the sun, with or without the sun. hazeHeights, SMK_HT, PUFF_*, ZH.smoke and height kind 4 are gone.
- Rain wet ground / puddles tried and dropped (blotchy grey on grass).

## Build 157
- Shadow fix (tank barrel): the shadow march (`blk`) reads the height texture unblended (texel centre). Linear blending of a floating thing's span (barrel 38–48) with the ground made phantom low spans at its edges, which cast a shadow bridging the hull's and barrel's. Shadow darkness is now relative to the blocker's own thickness too (`th`, `d / min(soft, th × 0.35)`), so thin things (barrel, flagpole) shade fully, and the sun march has 32 steps (was 24) so they aren't skipped far out. Frame 9.5 → 10.0 ms headless.

## Build 158
- Settings → Graphics → SUN SHADOWS: RAY MARCH (default) / SWEEP (`CFG.shadows`). Point lights march in both.
- March: steps only as far as the tallest thing in view could reach (`HMAX`, tracked in `hq`, uniform MXH = min(64, HMAX + 1)) with 8–32 steps by that length, and stops once in full shadow. Headless frame 10.0 → 6.4 ms.
- Sweep (`sunSweep`, program SP, ping-pong textures ST / FS on unit 4): each buffer pixel holds the span of heights blocked from the sun here (hi RG, lo BA, two bytes each). Pass N = 0 reads the span 1 px sunward lowered by DH (= tan el / K per px); then N = 1, 2, 4… joins each pixel's span with the one N px sunward lowered N·DH, until it reaches the tallest shadow (log2 passes, 2 reads each). Spans that meet merge; ones that don't keep the lower (ground receivers). The light pass shades a pixel if its height is inside (0.75 soft edge). Crisp, no dither; floating things keep their gap. Headless (software GL) 7.4–7.7 ms vs march 6.2–6.5; real GPUs may differ (bandwidth vs loops).

## Build 159
- Dev panel in tabs (`DEV.tab`, DEV_TABS): SPAWN (range, dummies + respawn, vehicles, smoke / dust ahead), PLAYER (god, ammo, heal, kill, HP ±10 %, kit cycle via giveLoadout, stance, vehicle HP), GFX, WORLD (reset, new houses, time scale `DEV.ts` 0–2× applied in `frame`, weather clear / rain / snow live, grid, sections, clear log). The log shows on every tab but GFX.
- GFX: sunlight + march / sweep; VIEW cycles SUNDBG (normal, heights, shade, highlights, glow + lights, materials, sun shadows only (CP Q 5: LT.r), point lights only (Q 6)); sun direction (15° steps) and height (5° steps, 10–81°) live on `SUN`; layer switches `DEV.L` via `devOff(k)` (shade, highlights, lights + glow, smoke, particles, roofs, soft fog) plus line of sight; overlays: sight lines, smoke values, HITBOXES (soldier hit circles from the shared `solHitR`, now also used by the bullets; vehicle / wreck boxes; shots), LIGHT POINTS (`DEV.lp` from lightsNow: reach, height, strength), HEIGHTS (solZ, gunH, topOf, mgH, canH, shotZ), STATS (fps, update / draw ms via `devTime`, sun mode, light-buffer size, height quads `DEV.nq`, tallest, counts, time scale, screen size).

## Build 160
- Sweep keeps two records per pixel (SP): RG = the skyline of grounded blockers (bottom < 1; max of t − d·DH, 16-bit), B / A = one floating span (8-bit each, merge as before). The P sweep shades when under the skyline or inside the span. Fixes the turret / barrel shadow being swallowed near the hull shadow (one interval used to keep only the lower of two that didn't meet).
- Fog shadows: CP Q 7 = the shade without point lights, rendered as a fourth map (GC is w×4) when fogged; `sunFog(P)` (called from drawWorld after drawSun) draws it into FOG_TMP, cuts out the sight polys + roofs (destination-out) and multiplies it over the remembered world. Units out of sight cast nothing (`unseen(o, r)` in sunHeights tests the point r toward each eye, since a hull blocks sight itself), so shadows don't give them away. The dev views branch (Q 3–6) is now bounded at < 6.5.
- Light loop local `D` renamed `dl` (it shadowed the uniform `vec2 D`). Dev diagnostics: frame exceptions → devLog in red; with STATS on, `gl.getError()` after drawSun → devLog. The lights layer switch now also drops the point lights from the GPU pass.

## Build 161
- Tiled roofs in the light: each frame sunHeights writes the roof cells (TL.roof === 1, row runs as HL.t boxes) into the height texture's B channel only (span(0, 64, 1): MAX raises B alone). B used to be haze opacity / scatter, which was unused, and it now means "a roof slab ROOF_Z [36, 42] is over this pixel". blk (march and point lights) and the sweep init treat the slab as a blocker, so the roof casts a shadow onto the ground and onto the rooms under it (sun still reaches in through windows below the slab). It is never the lit surface.
- CP `roofA`: on a roof pixel (B, nothing above ROOF_Z), the roof's visible fraction comes from the view's eyes (uniform E[2] / EN, roofOp as in roofView; Q 7 / out of sight: 1). The shade mixes toward 1 by that fraction, and the highlights and the add map are scaled by 1 − fraction, so a roof reads as a flat top in the sun and the walls' shadows no longer land on it.
- Dev views (SUNDBG) draw over the whole screen (no sight / roof clip), so roofs and the fog memory no longer show through them.

## Build 162
- Height texture split by what stands on the ground: R = grounded top (bottom < 1 px), G = floating top, A = 255 − floating bottom (MAX: the highest top, the lowest bottom), B = roof flag; cleared to 0. `span()` in HP picks the channel; hh = max(R, G). In blk a grounded thing is solid from the ground up (d = top − z, so no soft foot and no light lip at the base) and a floating one keeps its own span. Something floating over something lower (a barrel over sandbags) no longer merges into one solid column, which removes the bridge. Sweep init reads R as the skyline and G / A as the floating span. Limit: two floating things stacked at one pixel still share one span.
- Point lights: the slope term is the whole factor, `clamp(dot(N, ld) / max(ld.z, 0.15), 0, 2)`, with no flat 30 % share, so faces turned away from a flash stay dark.
- `unseen` (sunHeights) counts a vehicle as seen if any of its `vehCircles` (centre, or the point r toward an eye) is in sight, so a half-hidden jeep keeps its heights and its shading.
- fadeLayers: a canvas alpha filter (an SVG feFuncA, slope 1 − a, intercept −FADE_CUT 0.007, applied by a self-copy) instead of a destination-out fill. The fill's 8-bit rounding stuck at alpha ≈ 9 (a ghost); the filter reaches 0. Without canvas filters it falls back to the fill.
- Dev: LB / RB (st.tabL / tabR) change tab in devPad. STATS shows `S.dg`: GC size against the drawing buffer, the maps drawn, and the add flag, for diagnosing the phone-only flat lighting.

## Build 163
- Sight mask on the GPU (sunMask): KT on texture unit 5 (framebuffer FK, program KP). R = the sight fans (each visPoly as a fan from its eye, plus the wall strips); G = the roof rects. It is drawn before the heights. The light composite is no longer clipped by a canvas Path2D; a complex clip with blend-mode draws is the suspected cause of the phone losing all shading when walls or roofs are on screen. Out of sight (FG on, R + G < 0.5), CP drops point lights from Q0 and outputs black for Q1/Q2 (no highlights or glow), and the roof shows in full. Q7, sunFog, S.fog and the fourth map are gone; GC is back to w × 3.
- HP: unit sprites (p2 = HSEEN, set while soldiers and vehicles go in) are discarded outside the mask's R, so the hidden part of a half-seen jeep neither shows nor casts, and the seen part keeps its shading.
- Point lights: the shading direction is `vec3(v / K, max(lh, dl * 0.5))`, so a flash below an object's top still lights the side facing it.
- Nest MG: `SUNB.mgNest = SUNH.nest`; it rests on its bags, so no bridge under the gun.

## Build 164
- Vision as an overlay, nothing clipped: the world, the light and the effects are drawn whole; applyFog only builds FOG_OUT (the memory) and `vw._fog`. Last (after smoke and lasers, before tags), `fogOverlay(vw, H)` lays FOG_OUT over the view: multiplied by the sun's shade map (S.fog = map 0's rect), then a hole cut with one destination-out fill of H (sight polygons + the roof rects). The world clip, the roof entry's clip juggling and applyFog's save/clip are gone. Dev views (SUNDBG) skip the overlay.
- `sightNear(vw, o, r)` (5b_fog): a unit counts if it or its shadow (SIGHT_SHADOW 40 px / tan(el), away from the sun, sampled every max(r, 10) px; vehicles by vehCircles) reaches the sight. The same test culls the unit's sprite (drawWorld) and its heights (sunHeights), so a tank's shadow can show before the tank.
- Out of sight on the GPU (sunMask KT, unit 5, now read by P and CP via TX): unit sprites are flagged in the height texture (HP: B 0.25, p2 = HSEEN). `hv(p)` gives the shown height: a flagged pixel out of sight reads as the ground, so a hidden unit casts but shows no relief (its pixels sit in its own shadow). Out of sight, P skips the point lights, and CP zeroes pl and reflectivity and outputs black for Q1 and Q2.
- Sun shadows: the sweep only. The ray-march branch, uniforms T / D / SW / MXH, the CFG.shadows setting (menu and dev row) are removed. Point-light shadows still march (12 steps).

## Build 165
- Shadows split by memory: height list `u` holds what the out-of-sight memory doesn't keep (soldiers, vehicles, nest bags, crates, items, flags, nades: `HLA = HL.u` while units go in). HT gets every list. With vision on, HTS (unit 7, framebuffer FBS) gets only a, w, t (walls, trees, roofs, hay, fences, sandbags, wrecks), and it has its own sweep (pair SS / FSS, read on unit 6). `sunSweep(..., T, FS, u, hu)` takes the pair and units.
- P: out of sight (mask), `hv(p, ou)` reads HTS and the shadow comes from the static sweep. In sight it uses HT and the full sweep. The memory overlay is shaded only by remembered things, and unit shadows appear only in sight. The B 0.25 unit flag and HSEEN are removed. The fragment shader now uses all 8 texture units (0–7), the WebGL1 minimum.

## Build 166
- `PIPE` hook (1_core): `pipe(k, o)` calls `PIPE` when set; no-op otherwise. Hooks across drawWorld (queue entries carry `k` labels via `AK`), drawSun (mask, heights lists, HT/HTS/MT, each sweep pass, light, GC maps, composites) and fogOverlay (copy/shade/hole/draw).
- `guide/`: the field manual (phone-first): `index.html` (system map, one-frame timeline, code browser), `art.js` (loads ../atlas.png, atlas_m.png, atlas.json; the layers stack and HEIGHTS view, part stacking ported from 5e_light), `sys.js` (19 system pages with live demos, variables and formulas), `data.js` (1099 top-level definitions with comments and cross-references, generated from src at build 231). Both 3D views share one camera (CAM) and one controller (orbit on #stage: drag turns/tilts, pinch/wheel zooms, tap selects, ⟲ resets). HEIGHTS uses the heightmap editor's WebGL2 renderer (guide/vox.js: instanced boxes, sky + sun, reflections, glow bloom, MSAA) plus a per-instance angle so parts turn; the stack's sun shade is a one-pass sweep, redone every frame. A snapshot, not kept in sync. Served at /Militia-Mayhem/guide/.

## Build 167
- `sightNear(vw, o)`: per drawn part (`sightParts`: partsOf → a circle round the whole sprite, shadow length = its top / tan(sun el)), swept from the sun, tested with `circleSeen` (circle vs sight polygon: inside or within r of an edge). Replaces collision circles + eye-ward point, which culled vehicles still poking past a corner. SIGHT_SHADOW gone.
- Memory keeps what fell out of sight: `fogKeep('wall'|'roof', o)` from devCollapse / devRoofTile adds it to the view memory's `wall` / `roof` set when not seen; applyFog drops entries once seen (`FOG_KEEP` tests). sunHeights draws remembered-only things into the new list `HL.r` (HTS only), and statics / sandbag arcs whose remembered state differs from now go now → `u`, remembered → `r`. So out-of-sight shadows match the memory picture.

## Build 168
- Shade memory works like ground memory (craters): when fog is on, the light pass P and map pass CP run again with FG=1 (HTS heights / SS sweep, no point lights) into GC map 3 (x = 3w; GC is 4w wide). fogOverlay writes map 3 into the view memory's `m.s` (world space, FOGK) clipped to the sight polys, builds FOG_SH from map 3 with `m.s` over it, and multiplies the out-of-sight picture by it. So the memory keeps the shading as last seen, partly seen areas included.
- Removed: the sight mask (sunMask / KP / KT / FK / hid uniforms), `fogKeep` / FOG_KEEP, and `HL.r`. sunHeights is back to current-state statics and arcs.
- Tiled roofs fade only while an eye is under a roof (`TL.roof === 1`). `vw.rf` eases 0↔1 at 4/s; the CP roofA uses `mix(1, a, RF)`. From outside, roofs are solid like the memory, which fixes walls showing through Outskirts roofs.

## Build 169
- Settings › Graphics › BUILDING CLEAR LOS (`CFG.clearLos`, on by default). When on, the tiled roof fades round the eyes from anywhere (the pre-168 look). When off, it fades only from inside a house (build 168).

## Build 171
- (Build 170 was the same as 169; the version counter double-bumped.)
- Light maps sit 2 × 2 in GC (`at(n)`; the CP's `O` is a vec2 GL offset). Four in a row reached ~9500 px on a phone, past the 8192 GPU limit.
- Shade memory streaks: canvas drawImage with smoothing blends a source rect's outer texel with its GC neighbour. The memory write now skips map 3's outer texel ring. It is also one draw (no clearRect), since the map is opaque.
- Ground memory ghosts (inner walls and sight-ray lines on remembered roofs): ground, decals and roof were each drawn under the anti-aliased sight clip, so lower layers leaked a(1−a) through along clip edges every frame. Now they're composed in FOG_NOW first and laid in with one clipped draw.

## Build 172
- Point lights: `light()` multiplies every reach by `LSC` (2). The shader's shadow march steps ≤ 5 buffer px (8–40 steps), so a bigger light doesn't step over walls. The canvas fallback (`drawLight`) grows its cells with reach (≤ 24 a side), so a big light costs what a small one did. LT's point-light channel is dithered (8-bit rings showed in the dark).
- Spot lights: `light(..., d)` with d = [cos, sin, cos half-angle]. In the shader that's `PD[i]` (soft-rimmed cone, `spotK` on the CPU).
- Flashlight: `s.lamp` (keyboard L, hold D-pad up, touch button next to score). lightsNow lights it from state (`LAMP`, from the gun tip, off in vehicles), so one out of sight still throws its beam in. Net: the client sends input counter 14; snapshots pack lamp into the kit char (bit 32).
- Night: `SUN.el` may go below the horizon (dev WORLD › DAYLIGHT, −30°…81°). Shadows use `sunEl()` (≥ 10°). `sunTone()` gives the colours: low sun golden (GOLD) with a purplish shade (DUSK). Below the horizon, sunlit and shade both go to NIGHT, so only point lights light things. The CP shader has a new LI uniform (sunlit colour, roofs too).
- Bots: `visibleTo` lets darkness shorten sight: `SEE_DARK` to `SEE_DAY` by `litAt(x, y)` (daylight plus blasts, fires, muzzle flashes, and flashlights in whose cone and sight it is). A lit flashlight always gives you away.
- Dev: grid and sections off by default; sun controls moved to WORLD.

## Build 173
- Point lights twice the reach again: `LSC` 4 (blasts and flashes light a whole room), `LAMP.r` 85. The shadow march takes 6 px steps (8 to 64 steps), so walls still stop them. The canvas fallback cell size grows with reach (`r/24`).

## Build 174
- Settings reworked: a table `SETS` of rows, either choices (`o`) or sliders (`lo`/`hi`/`st`). Tap a slider's bar to set it; ‹ › and the pad step it. Tabs: GRAPHICS (FILTER, DYNAMIC LIGHTING, ROOF FADE, FULLSCREEN, SPLIT SCREEN), FOG OF WAR (STYLE preset, DESATURATION, DARKNESS, EDGE SHADOW, EDGE WIDTH), PERFORMANCE (RENDER RESOLUTION scales `DPR`; LIGHTING QUALITY sets `HS` from `LIGHT_Q`), HUD (FPS COUNTER, MINIMAP, TEAM COLORS), AUDIO (MASTER / EFFECTS / MUSIC volume, SOUND MIX), CONTROLS (adds FLASHLIGHT).
- Fog of war: `CFG.fogD/fogK/fogE/fogW`, with presets in `FOG_PRESETS` (1_core). The old `fogLook` choice is migrated once. `fogEdge` strokes the sight polygons in 6 rings on FOG_OUT, so the shadow sits only outside sight (EDGE ONLY: no tint far from the edge).
- Volumes replace the sfx/mus toggles (`sfxVol`, `applyMute`). At 0 that sound is off entirely (sfxOn / musOn).
- `devTime` always runs; `drawFps` draws the counter when `CFG.fps` is set.

## Build 175
- Point lights and flashlights are near-white (`PLT` in the CP shader; canvas fallback 255/245/220).
- Shadows grow down to 5° (`SUN_MIN`); the sun fades out from 6° to -6° (`sunTone` day), so there is no frozen span. The buffer pad is capped at 720.
- Dev WORLD > DAY CYCLE (`DEV.cyc`, `dayCycle`): the sun runs a day in 10, 4 or 1 min, -30° to 75°, from east to west.

## Build 176
- Dev VIEW HEIGHTS: one ramp (`hr`) of the top height, from dark blue at 0 to red at 64, roofs included. It is hatched in the underside's colour where a floating span (G over R) has a gap under it.
- Dev PIVOTS + SEATS (`DEV.piv`): pivots with heading in white (soldiers, vehicles, wrecks). Mounts in cyan: turret pivot, MG and barrels, gun tips. Seats in yellow (initials; drivers get an arrow), the nest arc as a wedge, and entry anchors (hollow).

## Build 177
- Settings TOUCH tab: BUTTON SIZE (`CFG.tSize`, scales drawTouch's k), OPACITY (`tAlpha`; drawTouch wraps drawTouch_ in one globalAlpha), FIRE STICK FROM EDGE / BOTTOM (`tFireX/Y`; the action arc follows it), LEFT FIRE BUTTON (`tLfire`), DRAG TO AIM (TOUCH.auto). Long tab names shrink to fit.

## Build 178
- Bullets fall: `p.z` starts at shotZ and loses `p.fall` px/s, which is start height x rnd(BULLET_FALL 0.8..2), so prone shots keep their range. Sandbags (`bagBlocks(p, s, z)`), hay, vehicles and wrecks only stop a bullet below their top (LH.bag, LH.hay, topOf); walls and trees always do. At 0 the bullet goes into the ground (dirt). Standing fire at bags: all pass up to 250 px, about 70% at 350, 45% at 450. Soldiers are hit at any height.
- Settings: core tabs (VIDEO, AUDIO, HUD, CONTROLS) sit in the title row, with their pages as sub-tabs under them (`SET_TABS` nested; `SET.sub`). Q / E or LB / RB step through every page (`setPage`).

## Build 179
- Dev FLASHLIGHT POOL (`DEV.lampX`, `lampPool`): a ray along the aim (walls, trees, hay, bags, vehicles) sets where the beam meets the ground, 60 to 260 px, eased (`POOL`, `s.poolD`). The beam tilts down from gun height. The shader gets the slope of the lower edge as spot w - 1: steeper (near ground) is dark, raised things nearby are lit, and the ground past the upper edge fades out (the far end of the pool). `S.pd` takes a 4-value d as is.

## Build 180
- Vehicle undersides: the hull and jeep bodies sit 5 px up (`SUNP` lift) and each has an `under` part (`under_tank`, `under_jeep`): heights-only atlas slots (greyed art, same silhouette and pivot; no damage states) whose painted heights hang DOWN from the body's base (height kind 4, `hund`). Tracks / wheels reach the ground; light passes between them. atlas_pack.py `undergen` paints a first pass (tracks along the sides, wheel discs at `jeepWells`); repaint them in the heightmap editor. `topOf`, fog sight shapes skip `q.u` parts. Heights view hatches only where there's air under a floating span. Heightmap editor: View › Stack the underside (3D) shows the body on its lift with the underside hanging below it (`STACK` mirrors SUNP).

## Build 181
- Undersides are one stack: any part with an `under_<part>` atlas slot (`underOf`; `under_hull`, `under_jeep`) stands on it, as high as its deepest painted pixel, so the clearance follows the paint (no `SUNP` lift for hull / jeep; `jeep4: { under: false }` keeps the wreck in the dirt). Everything above stacks as before (`hUnder` at each part's rest point), and gun / MG / cannon / fire lights read the parts (`partH`, `topOf`). First pass is rounder: wheels deepest under the axle, tracks angled up over their last 12 px. The heightmap editor pairs by the same name rule and reads the clearance live from the underside's paint (`stackOf`, `deepest`).

## Build 182
- Atlas settings: atlas_m.png carries them. Under the sprites: the underside pool (`_pool` in atlas.json, 128 rows, heights only) and the settings strip (`_cfg`, last 4 rows): a JSON string, 2 bytes of length then UTF-8 over the strip's G / B bytes (R is 6-bit in the editor). `{ under: { part: [x, y, w, h, px, py] } }`, x / y inside the pool. The game reads it in `matData` (`atlasCfg`, `ATLAS_CFG`) and adds `ATLAS['under_' + part]`; atlas_pack.py carries the pool and strip over row for row (`cfg_read` / `cfg_write`; it moved the old under_hull / under_jeep slots in once).
- Heightmap editor: an Under toggle on any part (allocates a pool rect the size of its first frame, writes the settings as an undoable stroke; off asks first), and an Under / Part button to switch between a part and its underside in both views. The underside shows its part's art as a guide. The 3D view orbits below the horizon.

## Build 183
- Heightmap editor ART mode (channel 3; the art's R G B A are channels 3..6 in `CH`, so undo, selection, copy / paste / array, revert and the saved work all take them; `touch` keeps `COL0` / `COL` in step). Loaded exactly through WebGL unpremultiplied (`exactPx`) and exported with its own PNG encoder (`pngRGBA`, CompressionStream), so an untouched export is byte-for-byte the same pixels (semi-clear ones too). File › Download / Share atlas.png; Import in Art takes an atlas.png.
- Art tools: pen / erase / fill / select / array / pick, plus Shade (moves colours along their palette row, once per pixel per stroke), Blur (3x3 tent, alpha-weighted), Gradient (drag; selection or the area you start in; main → second colour, through their palette row when both are in one, optional 4x4 ordered dither). Alpha lock, grid lock (2–16 px cells, drawn). Palette bar: two swatches (tap again = colour picker), swap, rows (prefs), menu: from this sprite (top 64 colours, rows by hue, dark → light), add / new row / remove / sort / clear. Selection menu in Art: shade lighter / darker, fill, clear.
- Fullscreen button (where supported; iPhone: Add to Home Screen, now marked web-app capable).

## Build 184
Editor: an underside is an inverted heightmap. Unpainted (0) pixels sit at the part's base (the ceiling), not the floor; painted ones hang down. The underside draws inverted from its deepest pixel even with Stack off.
Its guide (greyed copy of the part's art, also its paint mask) follows art edits live: a part pixel -> guide pixel map, refreshed in touch.
Add / Remove underside moved off the toolbar into the Edit menu (the Edit under / Edit part switch stays).

## Build 185
An underside only counts under the art of the state it carries: hund draws over the overlap of the frame and the underside (pivots lined up, whole px: shift), discards where the frame has no art, reads the underside p1/p2 (uv) away. A state with other edges never shadows from paint past them. Editor: the underside guide (and paint mask) is every state's art (GSRC: guide px -> its frames' px); the 3D stack shows it only under the stacked state's art, lined up the same way; deepest (the lift) counts all paint, as the game.

## Build 186
Undersides span every state: size / pivot = the union of the part's frames' bounds, pivots lined up (whole px; fitOf). atlas_m migrated (hull 111x62 @56,32; jeep 87x44 @43,21), paint kept on the pivot; the editor refits any that don't fit on load / import (fitUnders, one undoable stroke). Editor: the state worked on (st.from: the last part state open) drives the underside's guide, its 3D stack, and Edit part goes back to it.
Per-state undersides: the settings' off list (states without it; jeep4, the wreck, was the hard-coded SUNP jeep4.under); the game's underOf reads it, the fit spans only the states with it (jeep 87x43). Editor Edit menu: Give / Take <state>'s underside (refits, one undoable stroke), Remove underside (all states).

## Build 187
User art drop: atlas_m (jeep heights repainted, jeep underside painted, new under_jeep_tire: the steering tires stand on it) and atlas.png (jeep0 touch-up).

drop.py: an art drop in one command, python drop.py <png> [<png>] (the opaque one is atlas_m): checks size + settings strip, puts the files in, builds, tests, notes the changed sprites in CONTEXT, commits, pushes, waits for Pages. --check: dry run; --no-push.

## Build 188
Dev panel broke the day cycle: DEV.ph was both the cycle's phase and the panel's laid-out height (written every frame while open). The panel's is DEV.panH now. DAY CYCLE row shows the cycle's clock (dayClock: ph 0 = 6:00, noon at pi/2).

## Build 189
Out-of-sight shadows are lit now, from heights as last seen. Each fog memory has a GL height texture the size of its picture (`memOf` in 5e_light: the map at FOGK, NEAREST, depth+stencil FBO), first filled with the whole map as it starts (sunHeights over everything, lists a/w/t). Each frame `memStamp` marks the sight polygons in the stencil (fans from each eye, strips from their first corner; program PP writes 0 so the seen area clears), then redraws the kept lists (a MAX, w over, t MAX = `hKept`) there. `memRecall` (program RC, unit 5) reads it back into HTS over the view box, and the memory's light / sweep (FG, SS) runs from that with the current sun. fogOverlay multiplies map 3 directly; the stale shade picture (m.s, FOG_SH) is gone. So shadows out of sight follow the day, and a thing that changed unseen (tree dead, wall broken) keeps casting until you look. Height-list helpers split out: hBegin / hInst / hUp / hDraw. Checked headless: no GL errors, FBO complete, unseen dead tree stays in memory and clears when seen.

## Build 190
Vehicle lights. The flashlight toggle (L / D-pad hold / touch lamp button) in a vehicle toggles `v.lights` (not nests; netted as vehicle flag 16). `lampsOn(f)` in 5e_light is every beam that's on: flashlights, a jeep's two headlights (front corners of jeep0's art, 55% of its height), a tank's spotlight on the turret's side (tur art's side + 2 px, turns with the turret, 4 below the top). All are the flashlight's light (LAMP, spot cone, the experimental pool too). `lightsNow`, `litAt` and the bots' `visibleTo` (lights give you away) use it. Tail lights: `drawTailLights` (5_ui), two small red glows at the art's back corners, added after the light pass, stronger in the dark.
Experimental flashlight (dev FLASHLIGHT POOL): the beam is now a round cone in 3D (shader: `PD.w > 1`, the 2D wedge skipped), tilted so its top edge lands where the aim meets something (`lampPool`: 1 + tan(atan(h / D) + cone)). On the ground it's a closed oval, longer and thinner the lower the lamp (prone).

## Build 191
Coloured point lights. `light(..., c)` takes a colour (none: `LCOL`, warm white); the light pass P now does only point lights: LT is RGB the lights' colour sum / 4, A scatter / 4 (P skipped, LT cleared, when there are none). The sun's slope (lam) and shadow (sh) moved into the map shader CP (it already read the heights; SWT / SWS / HS bound there), so the memory's map (FG) no longer needs its own P pass. Haze tint follows the light colour there. The 2D fallback draws `l.c` too. Tail lights are real lights now (`TAIL`, `tailLights` in 5e_light: red spots 7 × LSC reach, 1.2 rad cone, shining back from the art's back corners at half its height); the drawn glow is gone. Rule (user): lights are always real lights, never drawn glows.

## Build 192
Three light kinds: sun, point, spot. Spotlights (flashlight, headlights, tank spotlight) are all the 3D-cone beam now (the old dev FLASHLIGHT POOL toggle is gone; the shader's 2D wedge removed; `lampsOn` always passes `lampPool`). Tail lights are point lights (no cone): `TAIL` r 14, k 0.35, 3 px over the hull part's base (`q.b`, its floor), 1 px behind the art; the jeep's straddle the spare tire (`TAIL.jeep`, art px [5.5, 10] / [5.5, 32]), the tank's at its back corners.
Fix: the lamp toggle ran after `controlSoldier`'s vehicle early return, so vehicle lights never toggled from inside on any device (the build 190 check set `v.lights` directly). Now before it. Checked headless on a touch phone viewport: tap toggles in the driver seat, and a second-finger tap while holding the stick at speed 105 toggles too.

## Build 193
Night through smoke / windows. The remembered view FOG_OUT (shown through the soft mask in sight: smoke, windows) was unshaded, so at night it showed day-bright; only fogOverlay multiplied it. `fogShade(vw)` (5b_fog) multiplies the memory's shade map into FOG_OUT once a frame (flag on vw._fog) before drawSoftFog or fogOverlay use it. The smoke itself was drawn after the light pass, unlit: now `drawSmokeField` lights it with the frame's shade map (`_sun.lit`, map 0: sun / night / point lights): smoke over black × shade (SMK_L), then the scene cut by the smoke's alpha (destination-out) and that added (lighter), clipped to the view: exact at thin edges too. Without the sun pass: as before.

## Build 194
Turret shadow cut off in a band around the hull's shadow (again): since undersides, the hull stands on its underside, so it is a floating span and fought the turret / barrel for the sweep's one floating slot (the lower kept). SP now folds any span reaching the ground or the skyline (lo <= max(g, 0) + 0.5) into the skyline (`fold`: lossless, receivers are >= 0), on the first pass, both sides of a join, and the result; the slot is left for what truly floats.

## Build 195
Aim ray (3_sim `aimRay(x, y, a, max, skip, all)`): the first thing along an aim past AIM.min (30 px: what's right in front is shot over), up to max, 10 px steps: walls (glass seen through), vehicles, wrecks; `all` adds trees / hay / bags (lamps). Shared by guns and lamps (lampPool's own ray is gone).
Every projectile has a height now (shells and rockets were a flat 99, so they flew over every vehicle and wreck; the MG from a tank's height cleared a jeep at any range). `shotFall(p)`: if the aim ray meets something lower than the muzzle within AIM.max (320), the shot loses height to reach its middle there; else a bullet falls at its random rate, a shell / rocket meets the ground at the end of its flight. Tank vs jeep at 120..600 px: cannon direct hit every time, MG 15/20.
Mounted lamps are fixed (FIXED: tilt + half-angle; `lampD(a, fix)`): jeep headlights 0.42 / LAMP.cone, the tank spotlight narrow and near level (0.17 / 0.24) at turret top + LAMP.post (8), so its lower edge clears the hull (it used to run into it: a striped penumbra). Flashlights still dip at what they're aimed at.
Point light shadow march: 5 px average steps, packed toward the light (t = mix(u, u(2-u), 0.6)).
Dev: LIGHT POINTS draws a spotlight as its direction, cone sides and the ground ellipse with tilt / reach (no reach circle); AIM RAYS (new toggle) draws each player's gun aim ray (dim inside AIM.min; red where it aims down at something, with the heights).

## Build 196
Soft light shadows blend instead of dithering: LT is LINEAR and CP reads it as 4 taps at (±1, ±1) px (a 4 x 4 footprint), so the jittered march's half-shadows average out (dev view POINT LIGHTS still shows the raw single tap). Tank spotlight back to catching its hull a little: FIXED.tank tilt 0.3, half-angle 0.28.

## Build 197
Light cost trimmed: the point light march back to 6 px average steps (the packing toward the light kept: free); CP's 4-tap LT blur skipped when no point lights (uniform LB = S.pk[0] > 0; LT isn't read at all then, i.e. all day).

## Build 198
Shots fly the aim ray (dev AIM RAYS = where they go). aimRay starts at the muzzle (10 px steps) for walls, vehicles, wrecks, trees; only low cover (`lowCover`: bags, hay) is skipped inside AIM.min, and shots skip it the same (bagBlocks' own-cover radius and hay's are AIM.min from p.ox; shotFall sets ox / oy for shells and rockets). Guns now pass all: a bag or hay bale past AIM.min lower than the muzzle is aimed down at and hit (standing rifle: bag 20 px 0/20 shot over, 60 px 20/20, 150 px 19/20, 300 px 11/20 with spread); something taller than the muzzle (nose against a jeep) stops the ray where the shots hit it. Overlay labels: red aimed down (heights), orange TALLER THAN z: HITS AT d, white FALLS ON.

## Build 199
Flashlight pools centre on what they hit: lampPool's tilt is max(open: top edge at POOL.max, `midTilt(h, D, cone)`: the tilt whose ground oval's middle is D), so up close the oval's middle sits on the contact (past ~140 px for a standing gun the open pool already reaches it). Fixed lamps keep their tilt.
Splashback (SPLASH r 30, k 0.3, back 8): every beam (flashlight, headlights, tank spotlight) casts aimRay to its reach (LAMP.r x LSC, skipping its own vehicle: o.v) and puts a dim warm point light SPLASH.back px in front of what it hits, at the beam's height there (under the thing's top), k x (1 - d / reach)^1.5; distance and fade eased (o.sd, o.sk). A jeep nosed up to a wall is lit by its own headlights.
Tail lights brighten (k x 1 + 1.8 b, reach x 1 + 0.4 b) while slowing by more than TAIL.dec (20 px/s²) or reversing, fading over 0.25 s (`brakeK(v)`, from v.spd: joiners see it).

## Build 200
Spotlights fan out: the shader's cone is measured as lateral / vertical angles off the beam's middle (sd: its side, up = a x sd), the lateral limit SPOT_FAR (0.5) wider on the far side (dv > 0: above the middle, landing further), soft rim (1 - |(dh, dv)|) / 0.25. POOL.min 60 -> 12 (a flashlight's pool pulls right in against a wall). Splash 13 px back from the hit, k 0.45. Tail lights 3 px behind the art (jeep 3.5, tank -3).
Settings › FOG OF WAR: a preview under the sliders (`fogPreview`): the frame behind the menu (`fogSnap`, before the menu dims it), its middle 1:1, with a vision cone from the middle cut in; outside it fogLook + fogEdge exactly as in a match. The sliders take ~56% of the body there.

## Build 201
- All lights dim with daylight: x(1 - 0.6 * sin(sun el)/sin(75deg)), 40% at noon (DAY_DIM).
- Fog preview snapshot taken right after the world draw, so pause menu / HUD no longer show inside it.

## Build 202
- Smoke no longer lit by the ground shade map (it carried the relief of what is under it: vehicles showed through). smokeLight: 1/4-res canvas, daylight (sunTone li) with static shadows (walls, trees) cast down to SMK_Z 14 px, blurred; point lights per puff (smokeLamps: lightAir = the shader falloff + 3D spot cone, walls block; one flat colour a puff, stacked by puff alpha, added).
- Fog of war settings preview removed.
- Sprint latches: touch rim / pad LS-click start it, it holds until the stick returns to the middle.

## Build 203
- DAY_DIM 0.1: lights fall to 10% at noon.

## Build 204
- Lasers drawn under the smoke (were over it: a bot in smoke showed its laser).

## Build 205
New tank art (art/art4/tank.png, imported once by atlas_pack.py, extra.tankV 2): hulls hull0..3 (100 / 75 / 50 / 25 %, hullFrame) and the wreck hull4 (was hull5); turret + barrel whole (tur / tur_gun) and battered under half HP (tur1 / tur_gun1, turFrame), tur_dead now the dead turret with its bent barrel. Pivots: hull 4 px ahead of the turret ring, turret on its ring, other frames laid on the first by outline; barrel 3 px under the mantlet. BARREL 96 → 88 (the new muzzle), recoil KICK 33 → 20, gunner seat moved to the cupola (-8, 5). Materials first-pass (atlas_pack FRESH; hull / turret reflectivity 40, was 90): to be painted in the editor. The turret's team stripe (bar) is off until the tank's decals come.

## Build 206
Editor (heightmap): the draw loop survives errors (reschedules first, toasts once); the readout hides off the atlas (Art mode threw on a cursor above the canvas → frozen). Import PNG at any other size = a piece floating on the sprite (move, flip, turn, ✓): Art its RGBA; heights a grey PNG into the channel you're on (Height /4), a coloured one as atlas_m H/R/G. Undersides data driven: settings `use: { sprite: what it stands on }` (under_<name> in the pool, any sprite, itself; none = the ground), older under + off read as the same; menu "Stands on", "New underside" (named part, part2...; the part's states on nothing take it too), "Delete underside". Pool rects fit every sprite on them. Game: USE from the settings (old format derived), underOf reads it, a stood-on sprite's depth counts all its pixels (artMax(n, true)). drop.py checks use targets exist.

## Build 207
Editor: heights are bound to the art. A pixel's art going fully clear (erase, clear, lift, revert, import) zeroes its H/R/G in the same stroke (put; not in the settings strip; the pool has no art), so no orphan heights (magenta) are left. Clips grabbed from the atlas carry their heights in Art mode too (blank hts; flip / turn keep it): moving / arraying art moves its heights. Imported pieces (art only) leave the heights under them.

## Build 208
The atlas carries its own table (atlas_table.py): atlas_m's last 16 rows, G / B bytes, the bottom row first (so it's found at any size): { v: 2, rows, pool: [y, h], spr: { name: [x, y, w, h, px, py] }, under, use }. build.py makes atlas.json from it (and refuses a bad one); drop.py takes a resized atlas (both PNGs), checks the table, reports new / removed / moved sprites; atlas_pack.py writes it (64 free rows above the pool; sprites it doesn't know carried in a row of their own). Migrated: 384x800, every sprite pixel-identical. Game: atlasCfg reads it bottom-up.
Editor: the table loads from atlas_m (atlas.json no longer read). Sprite button / menu: the atlas pops up, tap a sprite to open it; "Stands on" the same (plus The ground / Itself). Sprite menu: New sprite from PNG (trimmed to its art, into free space; the atlas grows above the pool when full, not undoable), Rename, Set the pivot (tap; crosshair shown), Fit to its art, Delete (undoable). Saved work remembers the file it's based on (base): a grown atlas restores; a changed file carries sprites by name, the editor's own into free space. The table's rows can't be painted.
Fix: drop.py had a quoting error since build 206 (wouldn't run).

## Build 209
Editor: work saved on the older atlas (722 rows) crashed the load (the carry-over wrote pixels before COL existed: "Cannot set properties of null"). COL made with COL0 at load; tested with a real pre-208 save (paint carried, undersides kept).

## Build 210
Editor: art edits touch only the art again (build 207's binding undone: erasing art leaves its heights). Moving / arraying art carries its heights only when asked (float bar, Art: "Art only" / "Art + heights", st.artAll). Stray heights (no art over them; not the pool, the table, or a sprite something stands on): View "Show stray heights" toggles the magenta; File "Remove stray heights" (one undo step); exporting atlas_m offers it when there are any. Lift and an imported piece float on their own (pasteStart(lift, c)): the copied clip stays.

## Build 211
Art drop (drop.py): new sprites: track0, track1, track2; rect / pivot: mg_dead; atlas.png: hull0, hull1, hull2, hull3, hull4; atlas_m.png: hull0, hull1, hull2, hull3, hull4, jeep_tire, pool.

## Build 212
- Tank tracks are their own parts (track0 / track1, the right one; the left is it mirrored), centred off the hull's pivot by `TRACK` (5_ui.js, measured from the art they were cut from), drawn under the hull. Each side rolls by how far it moved (turning moves the sides opposite ways), a frame every 2 px (links 4 px apart; track1 is track0 rolled 2): `tracks(v)`.
- They stand on under_hull (the atlas's `use`): `hpart` takes `at` (the part's pivot off its underside's) and `fy` (drawn mirrored); `hund` lines the underside up on the hull, not the track's pivot, and a mirrored frame reads the (unmirrored) underside back the right way round (shader: kind 4 with p2 past 2). One underside shared costs one small quad per part, clipped to that part's art; no recompute.
- Wrecks: no tracks; at most one torn track2 at a rear corner (`w.tr` -1 left / 1 right / 0 none, sent online in the wreck's type byte).
- Editor: Sprite menu "Pivot to its centre".

## Build 213
Art drop (drop.py): atlas.png: no paint change; atlas_m.png: tur, tur1, tur_dead, tur_gun, tur_gun1.

## Build 214 (GL)
GL merged with main up to build 213 (atlas table, editor, tank tracks, art) and now numbered with it: GL builds continue main's build numbers (the old GL-only 1-7 are retired). Next: GL replaces the original at the site root once confirmed.

## Build 214: GL is the game
The webgl branch merged into main: the site root is the GL renderer (GX, src/0_gx.js: Canvas2D on WebGL2, falling back to plain 2D without WebGL2). gl/ and gldeploy.sh are gone; one build-number sequence (GL's own 1-7 retired, 214 is the first root GL build).

## Build 215
- Vehicle hit boxes come from the art: the build measures every sprite's opaque bounds off its pivot (`BOUNDS`, `artHalf(n)`); VT.tank / jeep take hl / hw from hull0 / jeep0 and their push circles fill that box; wrecks from hull4 / jeep4 (`wreckBox`, also used by the net unpack). Tank 126 x 67 (was 104 x 56), jeep 85 x 43. Tread marks under the tracks (TRACK.y).
- The tank's driver faces where the turret points (updateSeatedPos: s.a = v.ta, as the MG gunner faces v.mgA), so the camera's look-ahead and their sight follow the turret; the speed lead still adds the driving direction.
- Page title: Militia Mayhem (no "GL").

## Editor (after build 215)
- heightmap/: the 2D view draws the art with its real alpha over a background (st.bg: dark grid, light grid, white, black; View menu or the swatch button on the 2D view). Height modes are clear where there's no art.
- Art layers, the editor's own: slot s = CH[3 + 4s .. 6 + 4s] (slot 0 the file's art); LAY { order, name, hid, act } saved with the work. COL0 = the visible layers stacked (comp / blend); export, strays, fit and free space read COL0; tools, alpha lock and clips use the active layer (ACH). Add / duplicate / merge down / move / rename / delete are undo steps (an undo entry carries the order and names, `ly`); hide and the active layer aren't.
- Bars: fixed rows, no horizontal scroll down to ~375 px. The options row always shows (a hint when a tool has none); selection actions sit on the Select tool (others show its size and deselect); the value row dims instead of hiding; menus on low bars open upward.

## Build 216
- Vision memory only takes what's actually seen: before the sight polygons stamp the world-as-now into the memory, `fogCut` removes what smoke and windows hide (softMask per eye, world-space, low res), so tread marks / decals laid in smoke aren't remembered (and so not shown through the smoke) until seen.
- Aimed shots at exposed crew: bullets carry their aim angle (`aa`, before spread). A shot stopped by a vehicle whose line runs through an exposed crewman hits him for sure if the aim line went through his hit circle (+4 px; lag-compensated position), else the old 60 % chance. Spread that takes the shot off him still hits the hull.

## Build 217
- Dev: a dummy spawned on a vehicle gets in (the free seat whose door is nearest, instantly, any team's vehicle; "VEHICLE FULL" when none) and respawns back into it while it stands (devSpawnDummy / devReviveDummy, dummySeat).

## Build 218
- Sight from off screen: the box the sight polygons are worked out in (`sightBox`) always takes in every eye, so a player whose aim look-ahead pushes them off screen still sees into the view (before, every ray from outside the box met its near edge first: the whole view was occluded). Used by applyFog and the dev sight-line debug.

## Build 220
- Dev: a dummy boards the first vehicle on the line from you to where it would spawn (devVehOnLine), looking at least 6 tiles out (as far as vehicles spawn), so spawning a vehicle and then a dummy without moving always boards it, whatever the dummy range.

## Build 221
- Dev: build 220's dummy line-boarding reverted; vehicles now spawn at the selected range (DEV.range), same as dummies, so a dummy spawned after a vehicle lands on it and boards.

## Build 222
- Tank decals (art/art4/tank_decals.png; atlas_pack imports once, extra.tankDecV 1): the rear-deck chevron (decal_hull, centre EXTRA.tankStar from the hull pivot) and the barrel's two stripes (decal_gun, EXTRA.tankBar from the gun pivot), white, the jeep decal's grey bands (atlas_pack `bands`). vehSkin draws every vehicle decal from one table (VDECAL: jeep hood, tank hull, gun): tinted like the jeep's (white empty, team colour aboard), 70 % on the last damage frame (jeep3 / hull3 / tur_gun1), none on the wreck. The gun is now drawn skinned (sprC + vehSkin).
- New tank husk (art/art4/tank_husk.png): hull4 replaced (chevron burnt in; laid on hull0 by outline; old material carried where both overlap, CARRY), and tur_dead's bent barrel replaced by the one with burnt stripes.

## Build 223
- Tank chevron (decal_hull) redrawn: new art in place in atlas.png (same size and pivot, the grey bands applied) and art/art4/tank_decals.png.

## Build 225 (224 was a local rebuild, never released)
- Undersides folded into their sprite: the sprite quad (kind 0) reads its underside's depth at an offset (undQ, the old hund geometry) and writes one span, base minus depth up to its top. No separate underside quads (kind 4 gone) or `q.u` parts; instances are 20 floats (i4: the underside's box in the frame's uv).
- Sun-shadow channels (hLayers / sunLayers in 5e_light.js): floating parts (base > 0) wait in HL.f. Two of them go in different channels when their sun-aligned footprints, stretched by their shadow, overlap and their spans can't merge (same object: ranges don't touch; different objects: bases differ). Channel 0 → a/u as before; the others → HL.x (HL.k: kept copies for the memory), each its own heights (unit 8), sweep over its regions (unit 9, sunSweep now takes a list of boxes), resolved into a MAX shade mask (unit 10) that CP reads (SWL, LY). Cap 4 channels. Fixes the turret/gun/MG/jeep shadow bridging and notches.
- Units 8+ belong to the GL renderer between frames (its textures and samplers): L2u rebinds 8–10 and clears their samplers before use. Layers off if fewer than 11 units.
- Point-light shadows still read the merged heights (HT), so they can still bridge.

## Build 226
- hLayers: parts of the same object share a channel only if partsMeet (walks the smaller sprite's painted px, samples the other's: every px both paint, their spans meet; bottoms at their bases). The whole-part range test let the tank MG (48–51) share with the turret (top 48) while its barrel reaches over the turret's lower edge: it bridged. A tank now usually runs hull | turret+gun | MG.

## Build 227
partsMeet results cached by the pair's relative pose (names, offset in A's frame to 1/4 px, relative angle to 1/200 rad, fy, bases/adds), Map PMC cleared past 4096. Profile, 12 tanks, day, fog off (headless ANGLE): sunHeights CPU 223 0.08ms / 226 1.29ms / 227 0.23ms (0.30 with all turrets spinning); drawSun incl. GPU 0.21 / 1.52 / 0.44ms.

## Build 231
(228-230: local cache attempts, never released.) partsMeet uncached again: a walk is ~2us, and a pose cache's misses on a turning turret cost as much as the walks. Instead: exact early accept when even each part's lowest painted px reaches the other's base (artMax(n, 0, 1): lowest painted height, cached per sprite), and hLayers skips the check for a part whose channel is already ruled out. Channels identical to 226 over 24 pose sets (12 tanks). Profile, 12 tanks, day: sunHeights CPU 223 0.08ms / 231 0.22ms, still or spinning; drawSun incl. GPU 0.21 / 0.39ms.
- Build 232: the hull no longer stands on `under_hull` (atlas_m table: `use` drops hull0–3; only track0/track1 use it). Its painted depth was only ever under the tracks, so the hull's span duplicated theirs there. `vehParts` gives the hull `min` = its tracks' base (hpart returns its part), so it floats at the underside's depth (13 px) as before; the guide stacks it the same way.

## Build 233
Art drop (drop.py): atlas.png: hull4, tur_dead; atlas_m.png: tur_dead, sol_leg0, sol_nogun, sol_rpg, sol_sit, sol_stand, pool.

## Build 235
- Two stances only (standing 0, prone 1): crouch is gone from the input (C / Z / Ctrl and gamepad B toggle prone), sim (hit r [9, 4.5], blast [1, .6], spread [1, .45], speeds), bots (`SEE_DAY = [1e4, 240]`, `SEE_DARK = [150, 70]`), net, dev menu, tests and the guide.
- Animations in the atlas table: `anim: { name: { f: [[frame, fy], ...], rest } }` (frames are sprites or `under_<name>`, fy -1 mirrored); a sprite stands on one as `use: anim_<name>`. `underOf(n, t)` returns [underside, fy] (step t, null = rest); `hpart` takes `t` (step) and `flat` (no underside), and passes `fy * fyU` into `q.un` so undQ maps a mirrored underside like a mirrored frame. atlas_table.check knows anim.
- Soldier walk: `sol_walk` = under_sol_stand (stride), under_sol_nogun (neutral), under_sol_stand mirrored, neutral; rest = neutral. sol_stand / sol_nogun / sol_rpg stand on it; `solStep(s)` = walkT / `SUNB.step` (4.5 px a frame, two frames a footstep) while moving. `SUNB.stand` / `solAdd` are gone: `solBase(s)` (jump gap + the underside's depth, 21) feeds solZ / handH / gunH. Prone and seated crew are `flat`.
- Jeep gunner stands: drawn in the stand pose at `jeepGunner(v)` (12 px behind mgPos, in the bed), and in the height pass `sol_stand` there on his legs (bed 18 + 21). Was sol_sit at the post's point + 18.
- Hull `use` stripped again (the editor's saved table had re-added hull0–3 → under_hull).
- Heightmap editor: Sprite menu › Animation: new from the open sprite, add frames (picker), mirror / rest / reorder / remove per frame, delete, Play (3D view, the sprite on it, at walking speed). Stands on lists animations. Rename / delete keep the frames in step; strays keep animation frames. Fixed: menus' left position was inside a comment.
- Guide: HEIGHTS soldier walks (WALK), jeep gunner standing; sys.js stance demos and tables are stand / prone.

## Build 238
- Recorder (`src/5f_rec.js`): Settings › Video › Performance › RECORDER. ON wraps every global function (self / with-calls time, calls; ones over 1000 calls a frame are let go after the first second, so overhead stays small), hooks GL / Canvas2D methods (draws, KB uploaded, texture uploads, framebuffer switches, sync points, per-method counts), logs events (sfx, explosions, kills, spawns, enter / exit, state changes, toasts, long tasks, errors). Per frame: dt / update / draw / entity counts; per second: functions, GL methods, GPU stages (FPS counter 3), heap; the 40 slowest frames with their functions. OFF (or 10 min) saves to IndexedDB `mm-rec` (newest 5) and shares / downloads `mm-rec-b<build>-<date>.json`.
- Viewer: `perf/index.html` (/perf/): reads `mm-rec` (same origin) or a file; summary, timeline (tap a second), functions, slowest frames, GL / canvas calls, events, settings.

## Build 240
- GX bind cache: `GXB.tb` / `GXB.ts` hold what units 8–14 have bound; `gxBindSlots` sends only changes (reset when `gxBindTarget` re-sets state after `gxYield`, i.e. after the light's own GL work; lightComp's unit 8 bind writes it). Title battle: bindTexture 638 → 64 a frame.
- Translucent strokes batch: `gxStrip` proves a stroke covers each px once (one sub-path, an end on its start = closed, butt / square caps, joins within the miter limit or under 20°, no inner fold, no non-neighbour segments within the width; ≤ 64 points) and `gxStripOut` draws it as one mitred strip, no stencil, no flush. Else the stencil path as before. Pixel-identical to it (1 px in 38 400 on a test sheet). The soldiers' team rings were ~18 flushes a frame: bufferData 158 → 27, drawElements 91 → 13.

## Build 243 (from the first phone recording: Adreno 740, 1764×822, 50.8 fps avg, 5.7 % of frames over 34 ms, 162 long tasks of ~100 ms)
- The long tasks were the minimap: `groundMini` read the ground back (readPixels: a full GPU stall) and un-premultiplied 640 × 427 px in JS, every time the ground changed (craters, wrecks: every 1–2 s once fighting starts). Now `surfMini` downscales on the GPU (halved step by step, 3000 → 1500 → 750 → 640) and `surf2D` reads it into a pixel buffer behind a fence, collected on a later frame once signalled (only the very first waits); opaque rows are copied straight. The HUD stays on the 2D layer, so it still needs a 2D copy.
- `fieldOcc` (the smoke on a sight line; ~8 500 calls a frame from fieldMask) allocated 5 arrays a call: now none, and it stops once the line is fully blocked (exact: the result is capped at 1).
- `gxDisc` (round caps / joins, ~230 a frame) takes unit circles from tables (`GXCIR`) instead of cos / sin per vertex.

## Build 245 (second phone recording, b243: the 2D minimap copy still cost 3–10 ms a frame in fights — a readback is a GPU round trip in Chrome however it's fenced)
- In-game minimap: its backing and the ground are drawn on the GL screen under the HUD (`onGLHere`: GL in the HUD's current transform), from `surfMini(ground)`; flags / markers stay on the 2D layer over it. No readback in play (surf2D: 0 calls). The split dividers moved onto GL too (else they'd show over the minimap). The tac map and the menu's preview sit on 2D panels: they keep `groundMini` (surf2D).
- `fieldOcc` skips empty 4 × 4-tile blocks (`f.Bk`, rebuilt at the end of each S-tick from `act`; `f.BW` its width): exact (0 of 200 000 random lines differ, max 2e-13), ~3× faster for an eye in smoke.

## Build 246
- Settings › VIDEO › PERFORMANCE › PRESET (ULTRA / HIGH / MEDIUM / LOW / LOWEST; `QUALITY` in 1_core, like FOG_PRESETS): sets res, lightQ, sun and the shadow rows; any row changed after reads CUSTOM (`qualPreset`). Default = HIGH (the old defaults).
- New page VIDEO › SHADOWS: DYNAMIC LIGHTING (moved from GRAPHICS), FLOATING SHADOWS (`shLay` false: hLayers puts everything in the first channel, no sunLayers sweeps), SHADOW LENGTH (`shLen` 64 / 32: the sweep's reach and the buffer's sunward pad), SHADOWS OUT OF SIGHT (`shMem` false: no fog memory sweep / map 3), LAMP SHADOWS (`shPt` false: P's march skipped, uniform MQ 0).
- Headless laptop GPU per frame: ULTRA 11.4 · HIGH 7.2 · MEDIUM 6.0 · LOW 4.8 · LOWEST 4.6 ms. LOWEST's sprites are 3.7 ms: the legacy drop-shadow layer (SHC, a 2D canvas) uploaded every frame — next: drop shadows on GL.

## Build 247
- New preset LOW between MEDIUM and the old LOW (now VERY LOW): res 90 %, lighting MEDIUM, sun shadows kept (merged channels, no out-of-sight sweep), spotlights only, no reflections.
- Settings › VIDEO › LIGHTS page: LIGHTS (`lights` 'spot': lightsNow keeps only lights with a cone `d` — flashlights, headlights; no muzzle flashes, blasts, fires, tail lights), REFLECTIONS (`refl` false: CP uniform RFL 0 — no sky mirror / glints / reflective dimming; no glow bloom BL; the add map skipped unless point lights or rain).
- Headless laptop GPU: ULTRA 12.3 · HIGH 7.8 · MEDIUM 6.7 · LOW 5.2 · VERY LOW 3.8 · LOWEST 2.7 ms.

## Build 248
- fieldMask (the smoke's sight rays for the fog's soft mask) kept for the frame per eye (SMK_MC, keyed by eye, box, cell, M.time): fogCut and drawSoftFog each cast the full set before — half the rays at every setting.
- PERFORMANCE › FOG QUALITY (`fogQ` 'low': fieldMask cells 2 × 2 smoke tiles, a quarter of the rays; fogEdge 3 rings instead of 6). SMOKE DETAIL (`smk` 'low': smokePuffs draws the first smoky tile of each 2 × 2 at 1.35 × the radius instead of the checkerboard; no self-shade passes; no smokeLamps). Both LOW on presets LOW and below.
- Laptop headless in smoke, HIGH vs LOW interleaved: drawSmokes 0.43 → 0.28 ms, fieldMask 0.31 → 0.17 (it was ~1.1 before the cache).
- Skipped, measured no gain: "units whole or hidden" fog mode (they're drawn whole already; the overlay's hole costs the same). The beam's splash light was already dropped by LIGHTS › SPOTLIGHTS ONLY (it has no cone).

## Build 252
- Minimap markers (the sight line per enemy) worked out every MINI_DT 0.5 s into M._mm, drawn each frame from it; your own dot follows you live. The ground picture was already throttled (surfMini).
- FOG QUALITY LOW also stamps the fog memory every other frame (applyFog, vw._fmF).
- LOWEST's drop shadows rebuilt (drawShadowLayer): each part of a soldier / vehicle (partsOf) drawn as a black silhouette, smeared from its base to its top along the sun (SHD.kMax 0.45 px per px up), into SHG (a GL surface, mkG) at a quarter resolution (DPR swapped while drawing), scaled up smoothed (the softening, no blur pass). SHC stays a 2D canvas for the menus' soldiers (uiShadowLayer). Laptop GPU LOWEST 4.6 → ~2.5–3 ms.

## Build 253
- drawSkirt's dashed map edge stroked only where it's in the box (each side its visible part, lineDashOffset from strokeRect's run round the edge so the dashes don't move): it built every dash round the whole map, twice a frame (the world and FOG_OUT), whenever the view reached past an edge. Laptop 0.22 → 0.065 ms; applyFog 0.35 → 0.23.
- Measured and skipped: caching the statics' sun heights (sunHeights is 0.12 ms on the laptop, ~5 static boxes in view; the cost is the units' parts, which move).

## Build 254: Sound Lab (sound/index.html) and data-driven sounds (src/1c_sfx.js)
- The modern sound set is now data: SFXD (one-shots) and ENGD (engines) in src/1c_sfx.js, played by sfxRun / sfxOut / sfxVoice and engBuild / engSet / engStop. Same recipes as before (GUN2, the sfx2 switch, metal(), crackle() and engineUpdate2's numbers were translated 1:1; the car's sub is now also scaled by hearing).
- A preset is { v, p, pr, rv, bs, lp, th, in, nd, L: [layers] }; a layer is a tone (t), noise (n), FM (f) or crackle (c) voice; keys left out take SFXK's defaults. The header comment in 1c_sfx.js lists every key.
- sfx2(name) plays SFXU[name] (sent from the Sound Lab, localStorage mmgl.sfxlab, any name, either sound mix) else SFXD[name] (modern mix), else returns false → classic code. Engines: SFXU.eng_tank / eng_car else ENGD. The music's thump / burst are sfxVoice calls now.
- sound/index.html loads ../src/1c_sfx.js directly, so the lab plays exactly the game's code. Library, undo, A/B compare, offline-rendered waveform, autosave (localStorage mmsfx.lab). Export lines "name: { … }," paste straight into SFXD / ENGD.

## Build 255: crackle fix, Sound Lab scope pinned + live
- sfxRun's crackle grains lacked k:'n', so they went down the oscillator path and threw (non-finite filter cutoff) — explosions / cannon / wall crack lost their crackle and any layers after it in 254. Fixed.
- Sound Lab: the waveform sits in the (now one-line) sticky header with length + peak; it redraws while a slider is dragged (one offline render in flight, the latest settings drawn next; B cached).

## Sound Lab: "Plays when" (no game build)
- sound/index.html PLAYS: per game sound name, when the game plays it (read off every sfx / psfx call in 3_sim, 4_ai, 5c_net, 5d_dev, 6_menus). Shown as a dropdown under "Plays as". Keep it in step when a sound call is added or moved.

## Build 256: sound events + rules (src/1d_sev.js), Sound Lab EVENTS tab
- Every game sound is now an event: ev(name, x, y, ctx). EVD lists the 54 events (group, description, fields, flags a = a soldier does it → me/ally/bot; n = host-only, forwarded). SEVD = the default rules (reproduce the old sounds exactly). A rule: s sound | fx 'deafen', v, p pitch, dl delay, th min gap, who ('' at the spot / 'pl' only that player / 'ui' no position), F falloff (SEVF: screen | world | flat, mu muffle, rd reverb, pan), if condition (gates {g:'and'|'or', c, n} / tests {f, op, v, n}), off.
- 1b_audio2.js: ev / evPlay / evSend / evNet; SEVU = mmgl.sevlab (the lab's "Send to game"), live via storage event. Hearing loss = deafen() (SEVX.deafen params), replaces earRing.
- Net: 'n' events go host → clients as ['e', idx, x, y, sol, team, ...fields] (120 ms per event+soldier); clients evaluate their own rules. NETSFX / 's' / 'ps' / psfx are gone; 'b' and 't' no longer play sounds (soldier.hit / flag / waves / soldier.down are events). explosion() got a cause param (kind stays the damage type), sent as 'x' a[5] (EVBOOM).
- hear(x, y, F) / sfxOut(..., F) take the rule's falloff; WPN[k].id = k.
- Lab: sound/events.js = the EVENTS tab (tabs in the header): event picker, test values, rule cards (sound or hearing loss, who, volume / pitch / delay / gap, condition builder, custom falloff + curve, deafen params), send / export. Sounds tab "Plays when" is derived from the rules (tap → that event); "Plays as" takes new names.

## Build 257: audio crackle fixes, Sound Lab MIX tab (sound/mix.js)
- Cause #1: the old master chain (two compressors with auto make-up gain, no ceiling) let overlapping blasts reach the DAC past 0 dBFS (firefight +3.3 dB / 531 samples, barrage +3.9 dB / 1658): hard clipping = crackle. Now auChain(c) in 1c_sfx.js (game + lab): master 0.85 → ear lowpass → one glue comp (AU_COMP −16 dB 3:1) → AU_TRIM 0.9 → soft ceiling (ceilCurve: linear to CEIL_T 0.7, tanh to CEIL_C 0.95, ×0.25 pre-scale so it reads ±4, oversample 4x) → fin. Reverb send highpassed at 180 Hz. Measured: 0 overs in every scene, booms same loudness.
- Voices: linear attack from 0 (≥1.5 ms) instead of exp from −80 dB (a step); noise sources loop (a random start late in the 2 s buffer used to cut long tails dead); sounds start sfxT(A) = currentTime + A.la (baseLatency + 4 ms) so attacks are never in the past; aHold() (cancelAndHoldAtTime or fallback) for every glide from the current value; square LFO chops (engine, rocket sizzle) lowpassed; fades instead of hard stops (loopsKillAll, rain, engStop); slider volumes glide.
- Nodes: sound heads carry .k (their nodes), disconnected when the longest voice ends; env disconnects onended; A.nv counts sounds playing; sfx2 skips quiet sounds past 48 and all past 80. engSet throttled to 25 Hz.
- Lab MIX tab: BUS/OUT peak meters with hold, latching BUS>0 / CEIL / CLIP lights, GR + voice count; bypass switches (drive, tone, shelf, verb, comp, ceil, legacy = build-256 voices, oldchain); stress scenes; "Measure offline" renders the scene now vs build 256 and counts overs. Scope marks where a sound alone passes full scale.

## Build 259: roof collapse stutter (gxPart region uploads), roof tiles' ev() shadowing
- Phone recording b257: every 300–420 ms freeze = a roof coming down (800–1100 tiles over ~1 s). Each tile repainted cells of ROOF_C (a map-sized 2D canvas, 3072×2048 on OUTSKIRTS) and its _gv bump made gxSrc re-upload the whole canvas next frame (applyFog draws ROOF_C every frame): ~25 MB a frame, the GPU fell behind. Not audio.
- gxPart(c, x, y, w, h, fn) (0_gx.js): fn draws on 2D canvas c only inside the rect; gxSrc then uploads just the union of those rects (gxSubUp, through a scratch canvas) when nothing untracked drew since the last upload, else the whole canvas as before. paintRoofCell uses it; paintRoof (whole repaint) calls roofCell directly. Headless: 14-tile fall 7 full uploads → a few 48–128 px patches; texture == canvas pixel for pixel.
- devRoofTile's param `ev` (the fall record) shadowed the global ev() since build 256: every tile threw (rest of that frame's update skipped, nobody under the roof hurt). Renamed `fall`.

## Build 263: stamped ground (src/2b_ground.js) and the map editor (mapedit/index.html)
- A stamped map is `{v:1,id,name,w,h,base,stamps:[{t,soft,r?,p:[x0,y0,...],off?}]}`: a base texture, then polygons drawn in order (gPath: corners rounded by r px), each revealing texture t by world position through a mask blurred by `soft` px (gMask: polygon at 1/0.5/0.25 scale, 3 box blurs).
- Textures: atlas sprites `tex_<name>` (colour from atlas.png, heights/material from atlas_m.png), else GTEXP placeholders (grass, dirt, sand, rock, snow, asphalt, mud). gTex caches per atlas load state.
- gBake(G, colourCtx, materialCtx, rect) bakes everything or just a rect; the editor re-bakes only the dirty box while dragging. In game, paintStamped() bakes the ground into gx and the material map into GMAT (a GSurf); sunHeights draws GMAT as one full-map hq quad (HL.g, texture unit 1) before the atlas lists so ground heights shade. gStampAdd(s) stamps one more polygon (for destruction later).
- Maps: maps/*.json are minified into the page by build.py as `GMAPS`; the editor's "Send to game" writes localStorage mmgl.maplab (this browser only). Both list as `g:<id>` in MAPNAMES; buildMap's g: branch auto-places flags (A/B/C), crescents, 20 trees.
- mapedit/index.html loads ../src/2b_ground.js directly (2b_ground must not need game globals at load). Phone-locked UI: Map menu (new/settings/duplicate/open/send/export/import/delete), undo/redo, View (colour/material, outlines), Select/Draw/+Shape/layers, texture picker, Edge slider, order/hide/duplicate/delete. Saves in localStorage mmgl.mapedit.

## Build 264: roads, skirt and scale guide in the map editor
- Road stamps: `{k:'path',t,soft,r,wd,l:[[x,y,...],...]}`: open lines (l[0] main, the rest branches starting on it), all stroked wd wide into one mask (so junctions blend), interior corners rounded by r (gPath). gLines(s) = s.l || [s.p]; gOk(s) says if it bakes.
- Editor: one slider with chips (Edge / Round / Width); ⑂ Branch snaps its first tap to the road; handles are [line, index]; canvas follows #wrap via ResizeObserver (the bar's rows change: before, taps were off when a shape was selected); 480 px skirt drawn like the game (base texture + red tint); scale guide (tank, jeep, soldier at true size + ruler, View menu).
