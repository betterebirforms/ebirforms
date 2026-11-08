# circular avatar: BIR's eagle zoomed out to fit a circle, column removed, red-bordered white gaps filled red
import sys, re, subprocess
from collections import deque, Counter
from PIL import Image
from kit import *
import six2  # patches the emblem to drop the column
from six2 import emblem_nocol as emblem
def body(R,fx,fy,uid,extra=""):
  k=R/826; cx=512-(fx-1282)*k; cy=512-(fy-1282)*k
  return emblem(cx,cy,R,uid=uid)+extra
def islands(inner,uid):
  open("av-probe.svg","w").write(svg(f'<rect width="1024" height="1024" fill="#000"/><defs><clipPath id="p{uid}"><circle cx="512" cy="512" r="512"/></clipPath></defs><g clip-path="url(#p{uid})"><rect width="1024" height="1024" fill="#fff"/>{inner}</g>'))
  subprocess.run(["rsvg-convert","-w","1024","av-probe.svg","-o","av-probe.png"],check=True)
  im=Image.open("av-probe.png").convert("RGB"); W,H=im.size; px=im.load()
  isw=lambda p:p[0]>235 and p[1]>235 and p[2]>235
  seen=set(); comps=[]
  for y in range(H):
    for x in range(W):
      if (x,y) in seen or not isw(px[x,y]): continue
      q=deque([(x,y)]); seen.add((x,y)); pts=[]
      while q:
        a,b=q.popleft(); pts.append((a,b))
        for n in((a+1,b),(a-1,b),(a,b+1),(a,b-1)):
          if 0<=n[0]<W and 0<=n[1]<H and n not in seen and isw(px[n]): seen.add(n); q.append(n)
      comps.append(pts)
  big=max(range(len(comps)),key=lambda i:len(comps[i]))
  PAL={RED:(200,16,46),GOLD:(244,180,0),BLUE:(31,79,184),NAVY:(20,40,107),"bg":(0,0,0)}
  m=Image.new("L",(W,H),255); mp=m.load(); n=0
  for i,pts in enumerate(comps):
    if i==big or len(pts)<20: continue
    S=set(pts); c=Counter()
    for a,b in pts:
      for dx,dy in((2,0),(-2,0),(0,2),(0,-2)):
        q=(a+dx,b+dy)
        if 0<=q[0]<W and 0<=q[1]<H and q not in S and not isw(px[q]):
          p=px[q]; c[min(PAL,key=lambda k:sum((u-v)**2 for u,v in zip(p,PAL[k])))]+=1
    c.pop("bg",None)
    if not c or c.most_common(1)[0][0]!=RED: continue
    n+=1
    for a,b in pts:
      for dx in(-1,0,1):
        for dy in(-1,0,1):
          if 0<=a+dx<W and 0<=b+dy<H: mp[a+dx,b+dy]=0
  if not n: return ""
  m.save("av.bmp"); subprocess.run(["potrace","-s","-t","4","-a","1.0","av.bmp","-o","av.svg"],check=True)
  g=re.search(r'(<g transform="[^"]+"[^>]*>)(.*?)</g>',open("av.svg").read(),re.S)
  return re.sub(r'fill="[^"]+"',f'fill="{RED}"',g.group(1))+g.group(2)+'</g>'
V={"A":(650,1300,1120),"B":(600,1290,1140),"C":(700,1310,1100)}
for key,(R,fx,fy) in V.items():
  inner=body(R,fx,fy,"a"+key); inner+=islands(inner,key)
  for star in ("s","n"):
    extra=""
    if star=="n":  # cover BIR's stars with the band's blue
      k=R/826; cx=512-(fx-1282)*k; cy=512-(fy-1282)*k
      extra=""  # filled below once star positions are known
    out=svg(f'<rect width="1024" height="1024" fill="{WHITE}"/>{inner}')
    open(f"av{key}{star}.svg","w").write(out)
  subprocess.run(["rsvg-convert","-w","360",f"av{key}s.svg","-o",f"av{key}.png"],check=True)
  print(key,"done")
