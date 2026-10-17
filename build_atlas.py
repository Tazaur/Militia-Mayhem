from PIL import Image
import numpy as np, json, collections
import os
U=os.path.join(os.path.dirname(os.path.abspath(__file__)),'art','orig')+'/'
def L(f): return np.array(Image.open(U+f).convert('RGBA'))
TANK=L('d20de27a-image.png');TUR=L('892c2399-image.png');DEAD=L('3d9ad270-image.png');BLOOD=L('111d3996-image.png')
JEEP=L('28c24a92-image.png');UI=L('bacaaafa-image.png');SOL=L('4f1b4817-image.png')
C=['red','orange','yellow','green','blue','cyan','magenta','white','black']
sprites={}  # name -> (array, px, py)
EXTRA={}
def crop(a,x,y,w,h): return a[y:y+h,x:x+w].copy()
def tight(arr):
    m=arr[:,:,3]>0; ys,xs=np.where(m)
    return xs.min(),ys.min(),xs.max()+1,ys.max()+1
def add(name,arr,px,py):
    x0,y0,x1,y1=tight(arr); sprites[name]=(arr[y0:y1,x0:x1],px-x0,py-y0)
# ---- tank hulls: align on medical cross (pure red pixels)
def cross(arr):
    r,g,b,a=[arr[:,:,i].astype(int) for i in range(4)]
    m=(r>180)&(g<60)&(b<60)&(a>0); ys,xs=np.where(m); return xs.mean(),ys.mean()
cells={'h0':(0,182,110,62),'h1':(110,120,112,62),'h2':(0,120,110,62),'h3':(110,60,112,62),'h4':(0,60,110,62),'h5':(0,0,110,62)}
pr=crop(TANK,*cells['h0']);px0,py0,px1,py1=tight(pr);cx,cy=cross(pr)
pivx=(px0+px1)/2;pivy=(py0+py1)/2;offx,offy=pivx-cx,pivy-cy
for k,c in cells.items():
    a=crop(TANK,*c);cx,cy=cross(a);add('hull'+k[1],a,cx+offx,cy+offy)
# ---- turret: 12 recoil frames (both columns), sorted by barrel length
tf=[]
for col in (0,1):
    for i in range(6):
        a=crop(TUR,col*128,i*42,128,42)
        m=a[:,:52,3]>0;ys,xs=np.where(m)
        px,py=(xs.min()+xs.max()+1)/2,(ys.min()+ys.max()+1)/2
        tip=np.where(a[:,:,3].any(0))[0].max()
        tf.append((tip,a,px,py))
tf.sort(key=lambda t:t[0])
for i,(tip,a,px,py) in enumerate(tf): add('tur%d'%i,a,px,py)
# ---- emblem layer (black ring + chevron from the grey overlay item), aligned to hull centre
em=crop(TANK,110,0,112,62).copy()
dark=(em[:,:,0]<24)&(em[:,:,1]<24)&(em[:,:,2]<24)&(em[:,:,3]>0)
mask=em[:,:,3]>0;ys,xs=np.where(mask);ecx,ecy=(xs.min()+xs.max()+1)/2,(ys.min()+ys.max()+1)/2
em[~dark]=0;em[dark]=[255,255,255,255]
add('emblem',em,ecx,ecy)
# ---- jeep: cells 88x44 ; order pristine->wreck
jc=[(1,45),(89,45),(89,1),(1,1),(1,89)]
for i,(x,y) in enumerate(jc):
    a=crop(JEEP,x,y,86,42);add('jeep%d'%i,a,43,21)
# ---- blood droplet
add('blood',BLOOD,24,19)
# ---- splats: 66 pitch
spl={'red':(0,0),'orange':(1,0),'yellow':(2,0),'green':(0,1),'blue':(1,1),'cyan':(2,1),'magenta':(0,2),'white':(1,2),'black':(2,2)}
splat={}
for c,(i,j) in spl.items():
    a=crop(DEAD,i*66-1 if i else 0,j*66,66,66); splat[c]=a; add('splat_'+c,a,33,33)
a=crop(DEAD,197,0,59,55);add('gore',a,29,27)
# ---- flung figures (side view)
fl={'red':crop(DEAD,197,53,40,39),'blue':crop(DEAD,197,92,40,38),'green':crop(DEAD,197,130,40,38),'yellow':crop(DEAD,197,168,40,40),'black':crop(DEAD,0,197,40,40)}
# ---- soldiers
walk={'yellow':crop(SOL,0,0,52,23),'green':crop(SOL,52,0,52,23),'blue':crop(SOL,0,23,52,23),'cyan':crop(SOL,52,23,52,23),'magenta':crop(SOL,0,46,52,23),'black':crop(SOL,52,46,52,23)}
stand={}
for i,c in enumerate(['red','orange','yellow','green']):stand[c]=crop(SOL,i*29,69,29,25)
for i,c in enumerate(['blue','cyan','magenta','white']):stand[c]=crop(SOL,i*29,94,29,25)
def key(p):return tuple(int(v) for v in p)
def shift(a,dx,dy):
    out=np.zeros_like(a);H,W=a.shape[:2]
    ys=slice(max(0,dy),min(H,H+dy));yd=slice(max(0,-dy),min(H,H-dy))
    xs=slice(max(0,dx),min(W,W+dx));xd=slice(max(0,-dx),min(W,W-dx))
    out[ys,xs]=a[yd,xd];return out
def learn(src,tgt):
    best=None
    for dx in range(-4,5):
        for dy in range(-4,5):
            t2=shift(tgt,dx,dy);h=min(src.shape[0],t2.shape[0]);w=min(src.shape[1],t2.shape[1])
            eq=(src[:h,:w]==t2[:h,:w]).all(-1)&(src[:h,:w,3]>0)
            sc=eq.sum()
            if best is None or sc>best[0]:best=(sc,dx,dy)
    tgt=shift(tgt,best[1],best[2])
    d=collections.defaultdict(collections.Counter);same=0;tot=0
    h=min(src.shape[0],tgt.shape[0]);w=min(src.shape[1],tgt.shape[1])
    for y in range(h):
        for x in range(w):
            s=key(src[y,x]);t=key(tgt[y,x])
            if s[3]==0 and t[3]==0:continue
            tot+=1;same+=s==t;d[s][t]+=1
    return {k:v.most_common(1)[0][0] for k,v in d.items()},same/max(1,tot)
def apply(src,mp):
    out=src.copy()
    for y in range(src.shape[0]):
        for x in range(src.shape[1]):
            k=key(src[y,x])
            if k[3]>0 and k in mp:out[y,x]=mp[k]
    return out
rep=[]
def isbody(c,p):
    r,g,b,a=[int(v) for v in p]
    if a==0:return False
    mx,mn=max(r,g,b),min(r,g,b)
    if c=='red':return r>90 and g<80 and b<80 and r-g>60
    if c=='orange':return r>170 and 60<g<180 and b<70 and r-g>50
    if c=='yellow':return r>110 and g>110 and b<100 and abs(r-g)<60
    if c=='green':return g>90 and r<110 and b<110 and g-r>50
    if c=='blue':return b>90 and r<90 and g<110 and b-r>50
    if c=='cyan':return g>130 and b>130 and r<130
    if c=='magenta':return r>90 and b>90 and g<90
    if c=='white':return mn>170 and mx-mn<25
    if c=='black':return mx<75 and mx-mn<20 and mx>0
def lum(p):return 0.3*p[0]+0.59*p[1]+0.11*p[2]
def pal(c,arr):
    cs=set(key(arr[y,x]) for y in range(arr.shape[0]) for x in range(arr.shape[1]) if isbody(c,arr[y,x]))
    return sorted(cs,key=lum)
def recolor(src,sc,refs,tc):
    sp=pal(sc,src);tp=[]
    for r in refs:tp+=pal(tc,r)
    tp=sorted(set(tp),key=lum)
    mp={}
    for i,col in enumerate(sp):
        q=i/max(1,len(sp)-1);mp[col]=tp[round(q*(len(tp)-1))]
    return apply(src,mp),len(sp),len(tp)
for c in ['red','orange','white']:
    walk[c],a,b=recolor(walk['yellow'],'yellow',[stand[c]],c);rep.append(('walk',c,a,b))
stand['black'],a,b=recolor(stand['yellow'],'yellow',[walk['black']],'black');rep.append(('stand','black',a,b))
for c in ['orange','cyan','magenta','white']:
    fl[c],a,b=recolor(fl['red'],'red',[splat[c],stand[c]],c);rep.append(('flung',c,a,b))
print(rep)
# pivots: body centroid from a colored sample (yellow) then shared
def bodypiv(a):
    r,g,b,al=[a[:,:,i].astype(int) for i in range(4)]
    m=(al>0)&(r>150)&(g>150)&(b<80)  # yellow body
    ys,xs=np.where(m);return xs.mean(),ys.mean()
wpx,wpy=bodypiv(walk['yellow']);spx,spy=bodypiv(stand['yellow'])
print('pivots walk',wpx,wpy,'stand',spx,spy)
for c in C:
    add('walk_'+c,walk[c],wpx,wpy);add('stand_'+c,stand[c],spx,spy)
    f=fl[c];x0,y0,x1,y1=tight(f);add('fling_'+c,f,(x0+x1)/2,(y0+y1)/2)
# ---- UI: ring, keyboards, pads
ring=Image.fromarray(crop(UI,124,124,256,256)).resize((128,128),Image.LANCZOS);add('ring',np.array(ring),64,64)
kb=[(504,2),(693,2),(504,73),(693,73),(504,144),(693,144),(504,215),(693,215),(504,286)]
pad=[(882,2),(882,89),(882,176),(882,263),(693,286),(813,350),(504,357),(624,373),(744,437)]
for i,c in enumerate(C):
    k=Image.fromarray(crop(UI,kb[i][0]-1,kb[i][1]-1,187,69)).resize((94,35),Image.LANCZOS);add('kb_'+c,np.array(k),47,17)
    p=Image.fromarray(crop(UI,pad[i][0]-2,pad[i][1]-2,120,85)).resize((60,43),Image.LANCZOS);add('pad_'+c,np.array(p),30,21)

# ================= second asset drop =================
CR=L('753dc6ef-image.png'); GL=L('7c1e1402-image.png'); ST=L('e6fde630-image.png'); BR=L('5ee3dbad-image.png'); SB=L('4948b42c-image.png')
FA=L('3ea96d23-image.png'); FB_=L('17bd8b7f-image.png'); FC=L('e8d65146-image.png'); FDd=L('461b4999-image.png')
# real crawl frames for red/orange replace the recolors
walk['red']=crop(CR,0,92,52,23); walk['orange']=crop(CR,52,92,52,23)
for c in ['red','orange']: add('walk_'+c,walk[c],wpx,wpy)
# crouch (8 colours) + white by palette recolor
crouch={}
order=[['red','orange'],['yellow','green'],['blue','cyan'],['magenta','black']]
for r,pair in enumerate(order):
    for k,c in enumerate(pair): crouch[c]=crop(CR,k*52,r*23,52,23)
crouch['white'],_,_=recolor(crouch['yellow'],'yellow',[stand['white']],'white')
cpx,cpy=bodypiv(crouch['yellow'])
for c in C: add('crouch_'+c,crouch[c],cpx,cpy)
# gunless (8) + real black-with-gun standing frame
nog={}
for i,c in enumerate(['_bk','red','orange','yellow']): nog[c]=crop(GL,i*29,0,29,25)
for i,c in enumerate(['green','blue','cyan','magenta']): nog[c]=crop(GL,i*29,25,29,25)
nog['black']=crop(GL,0,50,29,25)
stand['black']=nog.pop('_bk'); add('stand_black',stand['black'],spx,spy)
nog['white'],_,_=recolor(nog['yellow'],'yellow',[stand['white']],'white')
gpx,gpy=bodypiv(nog['yellow'])
for c in C: add('nogun_'+c,nog[c],gpx,gpy)
# jeep hood decals (star + stripes) and tank front-plate bars, white generated by greying
def whiten(a):
    b=a.copy().astype(float); l=0.3*b[:,:,0]+0.59*b[:,:,1]+0.11*b[:,:,2]
    for i in range(3): b[:,:,i]=np.clip(l*1.25+30,0,255)
    b[:,:,3]=a[:,:,3]; return b.astype(np.uint8)
dec={}
for i,c in enumerate(['red','orange','yellow']): dec[c]=crop(ST,16+i*16,2,16,17)
for i,c in enumerate(['green','blue','cyan','magenta']): dec[c]=crop(ST,i*16,23,16,17)
dec['black']=crop(ST,0,44,16,17); dec['white']=whiten(dec['cyan'])
bars={}
for i,c in enumerate(['red','orange','yellow','green','blue','cyan','magenta','black']): bars[c]=crop(BR,7+i*7,0,7,38)
bars['white']=whiten(bars['cyan'])
for c in C:
    a=dec[c];x0,y0,x1,y1=tight(a);add('decal_'+c,a,(x0+x1)/2,(y0+y1)/2)
    a=bars[c];x0,y0,x1,y1=tight(a);add('bar_'+c,a,(x0+x1)/2,(y0+y1)/2)
# where the star sits on the jeep and the front plate on the tank (sprite-local, from pivot)
def white_centroid(a):
    m=(a[:,:,0]>200)&(a[:,:,1]>200)&(a[:,:,2]>200)&(a[:,:,3]>0); ys,xs=np.where(m); return xs.mean(),ys.mean()
jarr,jpx,jpy=sprites['jeep0'];sx,sy=white_centroid(jarr);EXTRA['jeepStar']=[round(sx-jpx,1),round(sy-jpy,1)]
# sandbag crescents: full / damaged / destroyed, scaled to game size, with collision points along the curve
SC=0.37
bagframes=[('bagarc0',392),('bagarc1',196),('bagarc2',0)]
full=None
for n,x in bagframes:
    a=crop(SB,x,0,196,196); im=Image.fromarray(a).resize((int(196*SC),int(196*SC)),Image.LANCZOS); a=np.array(im)
    if n=='bagarc0': full=a
    add(n,a,a.shape[1]*0.62,a.shape[0]/2)
m=full[:,:,3]>200; ys,xs=np.where(m); pts=[]
_,bpx,bpy=sprites['bagarc0']
x0,y0,x1,y1=tight(full)
for k in range(8):
    ya=y0+(y1-y0)*k/8; yb=y0+(y1-y0)*(k+1)/8; sel=(ys>=ya)&(ys<yb)
    if sel.sum()>3: pts.append([round(xs[sel].mean()-x0-bpx,1),round(ys[sel].mean()-y0-bpy,1)])
EXTRA['bagPts']=pts
# fire / smoke / dust frames
fx={'fire0':(FA,55,1,45,47),'fire1':(FA,104,1,22,23),'fire2':(FA,1,52,31,32),'fire3':(FA,54,51,39,39),'fire4':(FDd,1,1,39,39),'fire5':(FDd,44,1,22,23),
    'boom0':(FB_,68,4,52,52),'boom1':(FB_,68,64,53,49),'boom2':(FC,68,4,52,52),
    'smoke0':(FA,3,4,47,43),'smoke1':(FB_,4,4,57,54),'smoke2':(FC,4,4,57,54),'smoke3':(FC,69,63,47,43),
    'dust0':(FB_,3,67,56,52),'dust1':(FC,3,67,56,52)}
for n,(sh,x,y,w,h) in fx.items():
    a=crop(sh,x,y,w,h);x0,y0,x1,y1=tight(a);add(n,a,(x0+x1)/2,(y0+y1)/2)
# ================= new soldier design (sheet 3): standing + prone legs + death =================
import colorsys
NS=np.array(Image.open('art/art3/sheet.png').convert('RGBA'))
GREENS=[(29,30,17),(71,74,37),(112,119,52)]
WHITE=(255,255,255)
# ---- team colours for the new soldier art ----
# One main colour per team. Every shade is that colour scaled by a brightness value, so all shades of a colour keep
# exactly the same R:G:B ratio. Change a main colour here, or the brightness steps, and every sprite follows.
FC_MAIN={'red':(224,44,38),'orange':(240,124,22),'yellow':(232,204,32),'green':(44,192,54),'blue':(52,92,242),'cyan':(34,204,228),'magenta':(204,54,204)}
FC_SHADE=[0.28,0.55,0.82]          # brightness for the artist's dark / mid / light green (light also colours the armband)
PLAY=['red','orange','yellow','green','blue','cyan','magenta']
MARK=FC_MAIN                        # armband sets use the main colour at full brightness
def shade(c,k): return tuple(min(255,round(v*k)) for v in FC_MAIN[c])
def ramp_for(c): return {g:shade(c,k) for g,k in zip(GREENS,FC_SHADE)}
def swap(a,mp):
    o=a.copy()
    for (src,dst) in mp.items():
        m=(a[:,:,0]==src[0])&(a[:,:,1]==src[1])&(a[:,:,2]==src[2])&(a[:,:,3]>0); o[m,0],o[m,1],o[m,2]=dst
    return o
GRAYS=dict(zip(GREENS,[(24,24,24),(50,51,50),(84,86,82)]))
def recolor(a,setname,c):
    if setname=='fc': r=ramp_for(c); r[WHITE]=r[GREENS[2]]; return swap(a,r)          # full colour: uniform + armband take the colour ramp
    if setname=='ab': return swap(a,{WHITE:MARK[c]})                                   # armband: only the band changes
    g=dict(GRAYS); g[WHITE]=MARK[c]; return swap(a,g)                                  # covert: grey uniform, coloured band
rot=lambda a: np.ascontiguousarray(np.rot90(a,1))   # artist draws facing down; engine faces right
# artist's 32px grid: body cells, death (32x64), prone legs; shadows sit 128px to the right
CELLS={'stand':(0,0,32,32),'nogun':(32,0,32,32),'rpg':(0,32,32,32),'sit':(32,32,32,32),'dead':(64,0,32,64),
       'leg0':(0,64,32,32),'leg1':(32,64,32,32),'leg2':(64,64,32,32)}
# body pivot = centre of the torso/helmet on the unarmed frame, shared by every body cell (grid aligned)
nog=crop(NS,32,0,32,32); m=np.zeros(nog.shape[:2],bool)
for g in GREENS[1:]: m|=(nog[:,:,0]==g[0])&(nog[:,:,1]==g[1])&(nog[:,:,2]==g[2])&(nog[:,:,3]>0)
ys,xs=np.where(m); bx,by=xs.mean()+0.5,ys.mean()+0.5          # down-facing cell coords
def piv(pose,w,h):
    if pose.startswith('leg'): ox,oy=bx,by+16                     # legs cell sits 16px above the body cell (from the prone mock-up)
    elif pose=='dead':
        d=crop(NS,64,0,32,64); ys2,xs2=np.where(d[:,:,3]>0); ox,oy=(xs2.min()+xs2.max()+1)/2,(ys2.min()+ys2.max()+1)/2
    else: ox,oy=bx,by
    return oy, w-ox                                               # after rot90: x'=y, y'=w-x
for pose,(x,y,w,h) in CELLS.items():
    base=crop(NS,x,y,w,h); sh=crop(NS,x+128,y,w,h); px,py=piv(pose,w,h)
    if sh[:,:,3].any(): add('nsh_'+pose,rot(sh),px,py)
    for c in PLAY:
        for st in ['fc','ab','cv']: add(f'{st}_{pose}_{c}',rot(recolor(base,st,c)),px,py)
EXTRA['newBody']=[round(float(by),1),round(float(32-bx),1)]

# ---- weapon icons (sheet 4): white fill, black outline, facing right
GUNS=np.array(Image.open('art/art4/guns.png').convert('RGBA'))
for name,(x,y,w,h) in {'ar':(14,10,44,16),'lmg':(67,4,58,27),'br':(13,39,47,19),'sniper':(64,39,64,17),'smg':(17,73,33,15),'rpg':(66,72,61,18),'ak':(12,105,46,16),'pistol':(70,105,18,12),'mp':(100,106,23,15)}.items():
    c=crop(GUNS,x-1,y-1,w+2,h+2); add('wi_'+name,c,(w+2)/2,(h+2)/2)
tips={}
def tip_of(name):
    arr,px,py=sprites[name]; op=arr[:,:,3]>0; cols=np.where(op.any(0))[0]; x=cols.max(); ys=np.where(op[:,x])[0]
    return [round(float(x+1-px),1),round(float(ys.mean()-py),1)]
for nm in ['stand','crouch','walk']: tips[nm]=tip_of(f'{nm}_red')
for pose in ['stand','rpg']: tips['n_'+pose]=tip_of(f'fc_{pose}_red')
EXTRA['tips']=tips
# ---- pack (shelf)
items=sorted(sprites.items(),key=lambda kv:-kv[1][0].shape[0])
W=640;x=y=rowh=0;meta={};places=[]
for n,(arr,px,py) in items:
    h,w=arr.shape[:2]
    if x+w+1>W:x=0;y+=rowh+1;rowh=0
    places.append((n,x,y));meta[n]=[x,y,w,h,round(float(px),1),round(float(py),1)];x+=w+1;rowh=max(rowh,h)
H=y+rowh;atlas=np.zeros((H,W,4),np.uint8)
for n,x,y in places:
    arr=sprites[n][0];atlas[y:y+arr.shape[0],x:x+arr.shape[1]]=arr
Image.fromarray(atlas).save('atlas.png',optimize=True)
json.dump(meta,open('atlas.json','w'));json.dump(EXTRA,open('atlas_extra.json','w'))
print('atlas',W,H,len(meta))
# preview
bg=Image.new('RGBA',(W,H),(40,120,40,255));bg.alpha_composite(Image.fromarray(atlas));bg.resize((W*2,H*2),Image.NEAREST).save('atlas_preview.png')

