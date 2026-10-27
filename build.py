import base64,json
atlas=base64.b64encode(open('atlas.png','rb').read()).decode()
# atlas.json comes from the atlas's own table (atlas_m's last rows, atlas_table.py): the two PNGs are the whole atlas
import numpy as np, atlas_table
from PIL import Image
_M=np.array(Image.open('atlas_m.png').convert('RGB')); _T=atlas_table.read(_M)
if _T:
    _bad=atlas_table.check(_T,_M.shape[1],_M.shape[0])
    if _bad: raise SystemExit('atlas table: '+'; '.join(_bad))
    json.dump(atlas_table.meta(_T,_M.shape[1],_M.shape[0]),open('atlas.json','w'))
meta=open('atlas.json',encoding='utf-8').read()
walls=base64.b64encode(open('art/walls16.png','rb').read()).decode()
mat=base64.b64encode(open('atlas_m.png','rb').read()).decode()
import glob
js='\n'.join(open(f,encoding='utf-8').read() for f in sorted(glob.glob('src/*.js')))
extra=open('atlas_extra.json',encoding='utf-8').read()
# every sprite's art (its opaque px) off its pivot: [x0, x1, y0, y1], so what's sized by the art (vehicles' hit boxes) follows it
_A=np.array(Image.open('atlas.png').convert('RGBA'))[...,3]; _B={}
for _n,_r in json.loads(meta).items():
    if _n[0]=='_': continue
    _ys,_xs=np.nonzero(_A[_r[1]:_r[1]+_r[3],_r[0]:_r[0]+_r[2]])
    if len(_xs): _B[_n]=[round(float(v),2) for v in (_xs.min()-_r[4],_xs.max()+1-_r[4],_ys.min()-_r[5],_ys.max()+1-_r[5])]
bounds=json.dumps(_B,separators=(',',':'))
# automatic version stamp: the build number goes up by one whenever the game's source or art actually changes
import hashlib,os,datetime
h=hashlib.sha1((js+meta+extra+atlas+walls+mat).encode()).hexdigest()     # bounds: made from atlas
st=json.load(open('version.json')) if os.path.exists('version.json') else {'build':14,'hash':''}
if st['hash']!=h: st['build']+=1; st['hash']=h; st['date']=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime('%Y-%m-%d %H:%M')
json.dump(st,open('version.json','w'))
js=f"const VERSION={{build:{st['build']},date:'{st['date']}'}};\n"+js
js=js.encode('ascii','backslashreplace').decode('ascii')
html=f'''<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Militia Mayhem</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Chakra+Petch:wght@500;600&display=swap" rel="stylesheet">
<style>
/* Single look by design: a sunlit battlefield in the original game's cartoon palette. */
:root{{--field:#0c140a;--sand:#f2e6c4;color-scheme:dark}}
html,body{{height:100%;margin:0;background:var(--field);overflow:hidden;overscroll-behavior:none;-webkit-user-select:none;user-select:none}}
#g{{position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;image-rendering:pixelated}}
#c{{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none;cursor:crosshair;image-rendering:pixelated}}
</style>
<canvas id="c" tabindex="0" aria-label="Militia Mayhem, a top-down battle game for 1 to 4 local players"></canvas>
<script>
const ATLAS={meta};
const EXTRA={extra};
const BOUNDS={bounds};
const ATLAS_SRC="data:image/png;base64,{atlas}";
const WALLS_SRC="data:image/png;base64,{walls}";
const MAT_SRC="data:image/png;base64,{mat}";
{js}
</script>
'''
open('combined-arms.html','w',encoding='utf-8',newline='\n').write(html)
open('index.html','w',encoding='utf-8',newline='\n').write(html)
print(len(html))
