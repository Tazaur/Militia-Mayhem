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
- Old claude.ai artifact: https://claude.ai/artifact/K4Cde2vTv5iTPRtS3VSsLV (declares the `room` capability).
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
- `build_atlas.py` — legacy full slice of the original uploads (old format: baked colour variants, classic soldiers, 12 turret frames). A current Pillow changes pixels, so avoid it; if ever needed, run it and then `atlas_pack.py` to convert.
- `harness.js` — Node harness that runs the built game headless with stubbed canvas/pads. Run tests from repo root: `node tests/t5.js` (all maps, bots), `t6` (seats), `t7` (sandbag cover), `t12` (menu→lobby→deploy→death cam flow), `t13` (wreck cover). All should end `errs 0`.
- `tests/net/` — Playwright two-browser tests (Chromium at `/opt/pw-browsers/...`, playwright at `/opt/npm-tools/node_modules/playwright`):
  - (stale since the ntfy switch: `t16.js`/`sigserver.js` still emulate PeerJS) `t16.js` direct WebRTC play from `index.html` via the local signalling stand-in `sigserver.js` (`node tests/net/sigserver.js &` first; uses `ws` from /opt/npm-tools).
  - `t14.js`/`t15.js` claude.ai-room mode via `mockroom.js`; they expect `python3 -m http.server 8765` serving the repo root.
  - Pages must be in separate browser contexts (same-context background pages get throttled); messages are relayed through Playwright.

## Online play design (src/5c_net.js)
- Host-authoritative. Host runs the real sim; remote players are `PLAYERS` entries with `dev.type === 'net'`. `LOCALS()` = non-net players (only they get views/HUD/sound/rumble).
- Transport A (default everywhere): WebRTC data channel (unordered, no retransmits). Signalling via ntfy.sh pub/sub (WebSocket subscribe to `mm1-<id>`, HTTP POST to publish; CORS open, no account). Host id `militiamayhem-<code>`; joiner id random. Non-trickle: each side waits up to 2.5 s for ICE gathering and sends one OFFER/ANSWER with candidates embedded; late candidates go as CANDIDATE messages. Host sends ACK on OFFER (no ACK in 8 s = E201 no game). ICE: Google + Cloudflare STUN only, **no TURN**.
- Oct 2026 findings: PeerJS public server (0.peerjs.com) accepts connections but relays nothing; PeerJS TURN (eu-0/us-0.turn.peerjs.com) and openrelay.metered.ca no longer resolve in DNS. A TURN relay now needs a free account (e.g. Metered.ca / ExpressTURN static credentials in `P2P_ICE`).
- Error codes: `NET_E` table in 5c_net.js (1xx matchmaking, 2xx host lookup, 3xx network path/ICE, 4xx data channel, 5xx lobby, 6xx lost host, 7xx WebRTC error). 
etFail(code)` shows a persistent panel with a trace (candidate counts H/S/R per side, mDNS, ICE/gather/link state, relay status, build, browser). Joiners see live step progress in the lobby; the host gets a toast with code + trace for failed joins. `p2pRoom()` mimics the room API (presence/onPeers/leave); state resent every 250 ms, links dropped after 10 s silence. Test overrides: `window.__MM_SIG`, `window.__MM_ICE`.
- Transport B (fallback, only inside a claude.ai artifact if matchmaking is unreachable): artifact `room` capability, named room `mm-<code>`. Games on B show "(CLAUDE.AI ONLY)" in the lobby title; A and B can't see each other.
- Host → clients: presence `{L: lobby info, g: snapshot}` ~20 Hz. Snapshot (`netSnap`) packs soldiers/vehicles/projectiles/items/crates/wrecks/flags/stats as base-64 digit strings, a per-remote-player private block (hp, ammo, cooldowns, messages), and a 0.7 s window of id'd events (explosions, kills, feed, toasts, destroyed statics, whitelisted sounds, smoke pops, per-player pops/sounds). Kept < ~3.9 KB (≈2.2 KB with 22 soldiers).
- Clients: render others 110 ms behind (interpolate), own soldier ~20 ms behind with smoothing and instant local aim; replay events on that timeline; cosmetic tracers from shot counters; local footprints/treads/particles. Input sent as continuous state + edge counters; deploy requests carry loadout + spawn option name.
- Lobby: host's normal lobby; joiners pick colour/team/ready; host starts. No joining mid-match; a leaver's soldier becomes a bot. Max 4 humans total.
- Names: entered before hosting and after typing a code (keypad works with keyboard/pad/touch), saved in localStorage (`store` key `name`), sent in join presence, used as soldier names.

## Status / open issues (as of handover)
- Two-browser tests pass locally (WebRTC from file://, and the mocked room). NOT yet proven between real devices.
- User's real test (PC host, iPhone join, same Wi-Fi) failed because the phone had no working route: iOS Safari won't run a local HTML file; the claude.ai artifact view reported no WebRTC in Safari. Fix in progress: host on GitHub Pages and retest from `https://tazaur.github.io/Militia-Mayhem/` in Safari.
- If it still fails on the same Wi-Fi: ask for the exact message ("NO GAME WITH CODE …" = matchmaking/ID problem; "COULD NOT CONNECT …" = ICE/NAT problem), and test phone on cellular. Likely next step then: a reliable TURN relay (e.g. Metered.ca free tier credentials in `P2P_ICE`) — the "paid relay" was explicitly put on the backburner by the user.
- The "can't play online" screen shows a diagnostic line (WEBRTC / WEBSOCKET / CLAUDE ROOM).
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
