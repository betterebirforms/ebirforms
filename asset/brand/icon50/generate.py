# 50 icons from one geometric kit on a 1024 grid, centre (512,512). Every mark is built from constructed primitives:
# circles, arcs, regular polygons, n-point stars, ray fans, tapered annular sweeps, superellipses, and the form glyph.
import math, os
NAVY="#1B2F7A"; BLUE="#3554B5"; SKY="#6E8BE0"; RED="#D7263D"; GOLD="#F5B700"; CREAM="#FFF8E7"; WHITE="#FFFFFF"; INK="#0F1B47"
C=512
def P(pts): return " ".join(f"{x:.1f},{y:.1f}" for x,y in pts)
def pol(r,a): a=math.radians(a); return (C+r*math.cos(a), C+r*math.sin(a))
def at(cx,cy,r,a): a=math.radians(a); return (cx+r*math.cos(a), cy+r*math.sin(a))
def circle(r,f,cx=C,cy=C,stroke=None,sw=0): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{f}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def ngon(n,r,f,rot=-90,cx=C,cy=C): return f'<polygon points="{P([at(cx,cy,r,rot+360*i/n) for i in range(n)])}" fill="{f}"/>'
def star(cx,cy,r,f,n=5,k=0.42,rot=-90): return f'<polygon points="{P([at(cx,cy,r if i%2==0 else r*k,rot+180*i/n) for i in range(2*n)])}" fill="{f}"/>'
def scallop(R,amp,n,f,cx=C,cy=C): return f'<polygon points="{P([at(cx,cy,R+amp*math.cos(n*math.radians(t/2)),t/2) for t in range(720)])}" fill="{f}"/>'
def gear(R,d,n,f): return f'<polygon points="{P([at(C,C,R if (i//2)%2==0 else R-d,i*360/(4*n)) for i in range(4*n)])}" fill="{f}"/>'
def superellipse(r,nexp,f,cx=C,cy=C):
    pts=[]
    for i in range(360):
        t=math.radians(i); c,s=math.cos(t),math.sin(t)
        pts.append((cx+r*math.copysign(abs(c)**(2/nexp),c), cy+r*math.copysign(abs(s)**(2/nexp),s)))
    return f'<polygon points="{P(pts)}" fill="{f}"/>'
def sq(f,rx=230): return f'<rect width="1024" height="1024" rx="{rx}" fill="{f}"/>'
def rays(cx,cy,r0,r1,n,spread,f,start=-90,wk=0.28):
    s=""
    for i in range(n):
        a=start+(i-(n-1)/2)*spread; w=spread*wk
        s+=f'<polygon points="{P([at(cx,cy,r0,a-w),at(cx,cy,r1,a),at(cx,cy,r0,a+w)])}" fill="{f}"/>'
    return s
def sector(r0,r1,a1,a2,f,cx=C,cy=C):
    n=max(8,int(abs(a2-a1)))
    o=[at(cx,cy,r1,a1+(a2-a1)*i/n) for i in range(n+1)]; inn=[at(cx,cy,r0,a2-(a2-a1)*i/n) for i in range(n+1)]
    return f'<polygon points="{P(o+inn)}" fill="{f}"/>'
def sweep(R,a1,a2,w,f,head=0.5,cx=C,cy=C):
    n=120; o=[];inn=[]
    for i in range(n+1):
        t=i/n; a=a1+(a2-a1)*t; ww=w*(t/head)**0.8 if t<=head else w*((1-t)/(1-head))**0.6
        o.append(at(cx,cy,R,a)); inn.append(at(cx,cy,R-ww,a))
    return f'<polygon points="{P(o+inn[::-1])}" fill="{f}"/>'
def form(cx,cy,w,f,line,lines=4,notch=True):
    h=w*1.32; x=cx-w/2; y=cy-h/2; n=w*0.26; t=h*0.1
    s=f'<path d="M{x:.1f} {y:.1f} h{n:.1f} v{t:.1f} h{w-2*n:.1f} v{-t:.1f} h{n:.1f} v{h:.1f} h{-w:.1f} z" fill="{f}"/>' if notch else f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{w*0.06:.1f}" fill="{f}"/>'
    for i in range(lines):
        lw=w*0.62 if i<lines-1 else w*0.38
        s+=f'<rect x="{x+w*0.19:.1f}" y="{y+h*(0.32+0.6/lines*i):.1f}" width="{lw:.1f}" height="{h*0.055:.1f}" rx="{h*0.02:.1f}" fill="{line}"/>'
    return s
def check(cx,cy,s,f,sw):
    return f'<path d="M{cx-s*0.45:.1f} {cy:.1f} l{s*0.3:.1f} {s*0.3:.1f} l{s*0.6:.1f} {-s*0.62:.1f}" fill="none" stroke="{f}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
def e_glyph(r,f,bar,cx=C,cy=C):
    # an "e": ring opened at the lower right, crossbar on the diameter
    w=r*0.36
    return sector(r-w,r,20,330,f,cx,cy)+f'<rect x="{cx-r+w*0.2:.1f}" y="{cy-w*0.32:.1f}" width="{2*r-w*0.4:.1f}" height="{w*0.64:.1f}" fill="{bar}"/>'
def stars3(r,deg,f,size=30,cx=C,cy=C): return "".join(star(*at(cx,cy,r,d),size,f) for d in deg)
def tricolor_ring(r0,r1,gap=4,rot=0):
    return sector(r0,r1,150+rot,270-gap+rot,BLUE)+sector(r0,r1,270+rot,390-gap+rot,RED)+sector(r0,r1,30+rot,150-gap+rot,GOLD)

I=[]
add=I.append
# — family 1: the seal, simplified (scallop + swirl + sun + form)
for k,(n,amp) in enumerate([(16,9),(12,14),(20,6),(24,5),(10,18)]):
    s=scallop(470,amp,n,NAVY)+circle(410,CREAM)+circle(410,"none",stroke=GOLD,sw=10)
    s+=sweep(372,150,285,120,BLUE,0.55)+sweep(372,282,445,110,RED,0.35)+sweep(372,425,532,95,GOLD,0.45)
    s+=stars3(318,(195,222,249),WHITE)+rays(512,470,150,262,5+k%3*2,19,GOLD)+form(512,532,200,NAVY,CREAM)
    add(s)
# — family 2: tricolour ring badges
for k in range(5):
    s=sq(NAVY) if k%2==0 else circle(500,NAVY)
    s+=tricolor_ring(330,410,gap=[2,6,10,4,8][k],rot=k*24)+circle(320,CREAM if k<3 else WHITE)
    s+=rays(512,512,130,250,[8,12,16,8,24][k],[22,15,11,22,8][k],GOLD,start=-90)+circle(125,GOLD)
    s+=form(512,512,150,NAVY,GOLD if k<3 else WHITE)
    add(s)
# — family 3: sun rays (the seal's sun, alone)
for k,(n,spread,r1) in enumerate([(8,22,360),(16,22.5,400),(12,30,380),(32,11.25,420),(5,24,380)]):
    s=sq(NAVY)+rays(512,560 if k!=1 and k!=3 else 512,170,r1,n,spread,GOLD,start=-90 if k in (0,4) else -90,wk=0.3)
    s+=circle(170,GOLD,cy=560 if k not in (1,3) else 512)+form(512,560 if k not in (1,3) else 512,190,WHITE,NAVY)
    if k in (0,4): s+=stars3(440,(235,270,305),WHITE,26)
    add(s)
# — family 4: three stars + form (flag cues)
for k in range(5):
    bg=[NAVY,BLUE,INK,NAVY,RED][k]
    s=sq(bg)+form(512,560,300,WHITE,bg)
    if k==0: s+=star(330,200,44,GOLD)+star(512,170,44,GOLD)+star(694,200,44,GOLD)
    if k==1: s+=stars3(420,(210,270,330),GOLD,40)
    if k==2: s+=f'<polygon points="{P([(0,0),(420,0),(0,420)])}" fill="{WHITE}"/>'+star(110,110,40,GOLD)+star(290,90,30,GOLD)+star(90,290,30,GOLD)
    if k==3: s+=ngon(3,260,WHITE,rot=-90,cx=512,cy=330)+star(512,300,50,GOLD)
    if k==4: s+=circle(120,GOLD,cx=512,cy=200)+stars3(170,(160,270,20),WHITE,26,cx=512,cy=200)
    add(s)
# — family 5: the eBIRForms "e", rebuilt from arcs
for k in range(5):
    bg=[NAVY,GOLD,WHITE,RED,BLUE][k]; disc=[GOLD,NAVY,NAVY,WHITE,WHITE][k]; ef=[NAVY,GOLD,GOLD,RED,BLUE][k]
    s=sq(bg)+circle(360,disc)+e_glyph(250,ef,ef)
    if k==0: s+=sweep(420,40,150,60,RED,0.6)
    if k==2: s+=stars3(420,(220,270,320),RED,30)
    if k==4: s+=rays(512,512,370,460,16,22.5,GOLD)
    add(s)
# — family 6: regular polygons (hex/oct/dodeca seals)
for k,n in enumerate([6,8,12,6,8]):
    s=sq(CREAM if k>=3 else NAVY)+ngon(n,470,NAVY if k>=3 else GOLD,rot=-90+180/n*(k%2))+ngon(n,410,CREAM if k<3 else WHITE,rot=-90+180/n*(k%2))
    for i in range(3): s+=ngon(n,410-60*(i+1),[BLUE,RED,GOLD][i] if k in (1,4) else "none",rot=-90+180/n*(k%2)) if False else ""
    s+=sector(300,390,200,340,BLUE)+sector(300,390,-20,100,RED)+sector(300,390,100,200,GOLD) if k in (0,3) else ""
    s+=stars3(350,(230,270,310),GOLD if k>=3 else NAVY,28) if k in (1,4) else ""
    s+=form(512,530,230,NAVY,CREAM)
    add(s)
# — family 7: gears/rosettes (the seal's scalloped edge pushed to ornament)
for k,(n,d) in enumerate([(24,30),(36,18),(16,46),(48,12),(12,60)]):
    s=sq(NAVY)+gear(470,d,n,GOLD)+circle(470-d-24,NAVY)+circle(470-d-60,CREAM)
    s+=sweep(470-d-80,160,300,90,BLUE,0.5)+sweep(470-d-80,300,450,90,RED,0.4)
    s+=form(512,520,200,NAVY,CREAM)
    add(s)
# — family 8: superellipse (squircle) app icons, flat
for k,nexp in enumerate([4,5,3,6,4]):
    s=superellipse(500,nexp,[NAVY,BLUE,INK,NAVY,RED][k])
    s+=sector(250,330,190,350,GOLD)+form(512,560,240,WHITE,[NAVY,BLUE,INK,NAVY,RED][k])
    s+=stars3(380,(215,270,325),WHITE,30) if k%2==0 else rays(512,560,350,440,9,20,GOLD)
    add(s)
# — family 9: sweeps only (the swirl as the whole mark)
for k in range(5):
    s=sq([WHITE,NAVY,CREAM,INK,NAVY][k])
    R=[430,420,400,440,380][k]; w=[150,130,170,120,160][k]
    s+=sweep(R,150+k*10,300+k*10,w,BLUE,0.5)+sweep(R,300+k*10,450+k*10,w,RED,0.45)+sweep(R,420+k*10,540+k*10,w*0.8,GOLD,0.5)
    s+=form(512,512,[220,200,240,190,210][k],[NAVY,WHITE,NAVY,WHITE,GOLD][k],[WHITE,NAVY,CREAM,INK,NAVY][k])
    if k in (1,3): s+=stars3(R-w*0.45,(200,225,250),WHITE,26)
    add(s)
# — family 10: form + seal-check (filed / verified)
for k in range(5):
    bg=[NAVY,BLUE,WHITE,INK,CREAM][k]
    s=sq(bg)+form(470,500,320,WHITE if k not in (2,4) else NAVY, bg if k not in (2,4) else WHITE)
    cx,cy=700,720
    s+=scallop(150,10,[12,16,20,12,16][k],GOLD,cx,cy) if k!=1 else circle(150,GOLD,cx,cy)
    s+=circle(120,[RED,NAVY,RED,RED,BLUE][k],cx,cy)+check(cx,cy+10,150,WHITE,30)
    add(s)

assert len(I)==50, len(I)
out=os.getcwd()
for i,body in enumerate(I,1):
    open(f"{out}/icon-{i:02d}.svg","w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{body}</svg>')
print(len(I))
