import base64,json
atlas=base64.b64encode(open('atlas.png','rb').read()).decode()
meta=open('atlas.json',encoding='utf-8').read()
walls=base64.b64encode(open('art/walls16.png','rb').read()).decode()
mat=base64.b64encode(open('atlas_m.png','rb').read()).decode()
import glob
js='\n'.join(open(f,encoding='utf-8').read() for f in sorted(glob.glob('src/*.js')))
extra=open('atlas_extra.json',encoding='utf-8').read()
# automatic version stamp: the build number goes up by one whenever the game's source or art actually changes
import hashlib,os,datetime
h=hashlib.sha1((js+meta+extra+atlas+walls+mat).encode()).hexdigest()
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
<title>Militia Mayhem GL</title>
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
const ATLAS_SRC="data:image/png;base64,{atlas}";
const WALLS_SRC="data:image/png;base64,{walls}";
const MAT_SRC="data:image/png;base64,{mat}";
{js}
</script>
'''
open('combined-arms.html','w',encoding='utf-8',newline='\n').write(html)
open('index.html','w',encoding='utf-8',newline='\n').write(html)
print(len(html))
