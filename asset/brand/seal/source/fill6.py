# s6a's crop without the squircle, rendered at 2048; every white region except the swirl's central field is an island
from kit import *
import subprocess
from PIL import Image
from collections import deque, Counter
R=900; k=R/826; cx=512-(1360-1282)*k; cy=512-(1020-1282)*k
open("s6a-sq.svg","w").write(svg(f'<rect width="1024" height="1024" fill="{WHITE}"/>'+emblem(cx,cy,R,uid="a")))
subprocess.run(["rsvg-convert","-w","2048","s6a-sq.svg","-o","s6a-sq.png"],check=True)
im=Image.open("s6a-sq.png").convert("RGB"); W,H=im.size; px=im.load()
def isw(p): return p[0]>235 and p[1]>235 and p[2]>235
lab={}; comps=[]
for y in range(H):
  for x in range(W):
    if (x,y) in lab or not isw(px[x,y]): continue
    q=deque([(x,y)]); lab[(x,y)]=len(comps); pts=[]
    while q:
      a,b=q.popleft(); pts.append((a,b))
      for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
        n=(a+dx,b+dy)
        if 0<=n[0]<W and 0<=n[1]<H and n not in lab and isw(px[n]): lab[n]=len(comps); q.append(n)
    comps.append(pts)
big=max(range(len(comps)),key=lambda i:len(comps[i]))
print("white regions",len(comps),"central",len(comps[big]))
PAL={RED:(200,16,46),GOLD:(244,180,0),BLUE:(31,79,184),NAVY:(20,40,107)}
fills={}
for i,pts in enumerate(comps):
  if i==big or len(pts)<30: continue
  S=set(pts); border=Counter()
  for a,b in pts:
    for dx,dy in((3,0),(-3,0),(0,3),(0,-3)):
      n=(a+dx,b+dy)
      if 0<=n[0]<W and 0<=n[1]<H and n not in S and not isw(px[n]):
        p=px[n]; border[min(PAL,key=lambda c:sum((u-v)**2 for u,v in zip(p,PAL[c])))]+=1
  col=border.most_common(1)[0][0] if border else RED
  if col==RED and (min(p[1] for p in pts)>1700 or min(p[0] for p in pts)>1600): fills.setdefault(col,[]).extend(pts)
  print("island",len(pts),"→",col, min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts))
frag=""
for col,pts in fills.items():
  m=Image.new("L",(W,H),255); mp=m.load()
  for a,b in pts:
    for dx in(-2,-1,0,1,2):
      for dy in(-2,-1,0,1,2):
        if 0<=a+dx<W and 0<=b+dy<H: mp[a+dx,b+dy]=0   # grow 2px so the fill tucks under neighbours' antialiased edges
  m.save("isl.bmp"); subprocess.run(["potrace","-s","-t","4","-a","1.0","isl.bmp","-o","isl.svg"],check=True)
  s=open("isl.svg").read(); import re
  g=re.search(r'(<g transform="[^"]+"[^>]*>)(.*?)</g>',s,re.S)
  frag+=re.sub(r'fill="[^"]+"',f'fill="{col}"',g.group(1)).replace('<g ','<g ',1)+g.group(2)+'</g>'
# potrace's canvas is 2048 → scale to 1024
open("s6a-fill.frag","w").write(f'<g transform="scale(0.5)">{frag}</g>')
