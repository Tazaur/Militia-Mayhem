const fs=require('fs');
const html=fs.readFileSync('combined-arms.html','utf8');
const src=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
const noop=()=>{};
// the same run every time: Math.random seeded (TEST_SEED=n picks another; a failure names its seed)
let seed=(+process.env.TEST_SEED||1)>>>0; global.TEST_SEED=seed; Math.random=()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
function mkCtx(){const grad={addColorStop:noop};return new Proxy({},{get(t,k){if(k in t)return t[k];if(k==='createRadialGradient'||k==='createLinearGradient')return()=>grad;if(k==='createPattern')return()=>({});if(k==='createImageData'||k==='getImageData')return(a,b,c,d)=>({data:new Uint8ClampedArray((c||a)*(d||b)*4)});if(k==='measureText')return s=>({width:String(s).length*7});return noop;},set(t,k,v){t[k]=v;return true;}});}
function mkCanvas(){return{width:0,height:0,style:{},getContext:()=>mkCtx(),addEventListener:(t,f)=>{(L['cv_'+t]=L['cv_'+t]||[]).push(f)},focus:noop,setPointerCapture:noop};}
const L={};global.window=global;global.innerWidth=1280;global.innerHeight=720;global.devicePixelRatio=1;
global.addEventListener=(t,f)=>{(L[t]=L[t]||[]).push(f)};
const cv=mkCanvas();
global.document={getElementById:()=>cv,createElement:()=>mkCanvas(),body:{appendChild:noop},addEventListener:noop,hidden:false};
global.getComputedStyle=()=>({paddingTop:'0',paddingRight:'0',paddingBottom:'0',paddingLeft:'0'});
global.Path2D=class{moveTo(){}lineTo(){}closePath(){}rect(){}arc(){}ellipse(){}addPath(){}bezierCurveTo(){}quadraticCurveTo(){}};
global.localStorage={getItem:()=>null,setItem:noop};
global.Image=class{constructor(){this.width=640;this.height=604;}set src(v){this._s=v;setImmediate(()=>this.onload&&this.onload());}};
let now=0;global.performance={now:()=>now};let raf=null;global.requestAnimationFrame=f=>{raf=f};
const pads=[null,null,null,null];
Object.defineProperty(global,'navigator',{value:{getGamepads:()=>pads},configurable:true});
global.mkPad=()=>({connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
let errs=0;const ce=console.error;console.error=(...a)=>{errs++;if(errs<6)ce('ERR',...a)};
global.errs=()=>errs;
(0,eval)(src+`;global.G={setHook:f=>EVHOOK=f,outOfBounds,get M(){return M},get WW(){return WW},get WH(){return WH},inRect,inWater,get state(){return state},get PLAYERS(){return PLAYERS},CFG,KB,enterCandidate,moveSeat,toWorld,toLocal,enterVehicle,exitVehicle,VT,LOBBY,setState,newMatch,toLobby,startBattle,lobbyJoin,get MAP(){return MAP},spawnOptions,KITS,WPN,changeSetting,DUI,get Mx(){return M},MENU,SET,toMenu,get MATCH_ROWS(){return matchRows()},get UIB(){return UIB},SLOTS,kill,makeSoldier,spawnSoldier,fireWeapon,cw,isEnemy,destroyVehicle,dupName,hurtSoldier,cycleColor,syncLobbyColors,WAVE_GUNS,redeploy,pauseItems,pauseAct,openPause,TOUCH,touchState,addCorpse,botControl,testStart,testRun,testApply,testClear,testState,testSpots,TEST,SCENES,sceneParams,autoControl,botThought,DEV,devSpawnDummy,devSpawnVeh,devClearVehicles,devResetMap,explosion,solidAt,menuAct,devClick,devDamage,shakeAt,vehicleCollide,makeVehicle,devGlass,autoLined,touchState,TOUCH,updateProjectiles,paintCell,rectBox,cellW,houseAt,get NGW(){return NGW},los,genHouse,mulberry,visPoly,sightBox,inPoly,glassOcc,GLASS_OCC,sees,barrelHits,fireCannon};`);
global.step=(n=1)=>{for(let i=0;i<n;i++){now+=16.7;raf(now);}};
global.L=L;global.pads=pads;
module.exports={};
