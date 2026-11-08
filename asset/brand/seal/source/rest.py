from kit import *
C={}
def clip_sq(uid,body,n=5,r=512):
    pts=[]
    for i in range(720):
        t=math.radians(i/2); c,s=math.cos(t),math.sin(t)
        pts.append((512+r*math.copysign(abs(c)**(2/n),c),512+r*math.copysign(abs(s)**(2/n),s)))
    return f'<defs><clipPath id="q{uid}"><polygon points="{P(pts)}"/></clipPath></defs><g clip-path="url(#q{uid})">{body}</g>'

# 02 — app icon: the emblem alone on a cream squircle, framed by the seal's gold + navy rings; no text at icon size
C["02"]=squircle(512,CREAM)+f'<circle cx="512" cy="512" r="430" fill="{NAVY}"/><circle cx="512" cy="512" r="414" fill="{GOLD}"/>'+meander(512,512,396,412,52,NAVY)+emblem(512,512,394,uid="b")

# 03 — night: the same emblem with its white field turned to ink, colours lifted for a dark background
C["03"]=squircle(512,INK)+f'<circle cx="512" cy="512" r="420" fill="none" stroke="{GOLD}" stroke-width="6"/>'+emblem(512,512,400,pal={"white":INK,"blue":SKY,"red":"#EF3B55","navy":GOLD},uid="c")

# 04 — engraved: one ink on paper, each shape separated by a paper-coloured gap, as a letterpress seal would be cut
C["04"]=f'<rect width="1024" height="1024" fill="{CREAM}"/>'+seal_edge(512,512,480,f=NAVY)+seal_edge(512,512,462,f=CREAM)+f'<circle cx="512" cy="512" r="420" fill="none" stroke="{NAVY}" stroke-width="5"/>'+emblem(512,512,400,pal={"white":CREAM,"blue":NAVY,"red":NAVY,"gold":NAVY,"navy":CREAM},stroke=CREAM,sw=7,uid="d")

# 05 — coin: gold relief on navy, a reeded rim (120 radial ticks), the emblem struck in one metal
ticks="".join(f'<polygon points="{P([at(512,512,470,a-0.9),at(512,512,500,a-0.9),at(512,512,500,a+0.9),at(512,512,470,a+0.9)])}" fill="{GOLD}"/>' for a in [i*3 for i in range(120)])
C["05"]=f'<circle cx="512" cy="512" r="500" fill="{NAVY}"/>'+ticks+f'<circle cx="512" cy="512" r="458" fill="none" stroke="{GOLD}" stroke-width="8"/>'+emblem(512,512,360,pal={"white":NAVY,"blue":GOLD,"red":GOLD,"gold":GOLD,"navy":NAVY},stroke=NAVY,sw=6,uid="f")+ring_text(512,512,392,"eBIRFORMS",GOLD,52,spacing=14)+ring_text(512,512,428,"OFFLINE · PACKAGE",GOLD,36,spacing=9,top=False)

# 06 — eagle crop: the eagle's head and sun at app-icon scale, bleeding off the frame
s=1.25
C["06"]=clip_sq("g",f'<rect width="1024" height="1024" fill="{WHITE}"/>'+emblem(512+ (1282-1360)*s*400/826/ (400/826) *0 + 0,512,0,uid="g0") if False else "")
k=900/826  # emblem disc radius on canvas
cx,cy=512-(1360-1282)*k, 512-(1020-1282)*k  # put the head (traced 1360,1020) at the centre
C["06"]=clip_sq("g",f'<rect width="1024" height="1024" fill="{WHITE}"/>'+emblem(cx,cy,900,uid="g"))

# 07 — monument: a square Greek-key frame (the seal's key band, unrolled) around the emblem disc
def sq_meander(x0,y0,size,band,n,f):
    out=""; u=size/n
    for side in range(4):
        for i in range(n):
            pts=[(0,0),(1,0),(1,0.8),(0.2,0.8),(0.2,0.4),(0.6,0.4),(0.6,0.6)]
            def m(px,py):
                X=i*u+px*u; Y=py*band
                if side==0: return (x0+X,y0+Y)
                if side==1: return (x0+size-Y,y0+X)
                if side==2: return (x0+size-X,y0+size-Y)
                return (x0+Y,y0+size-X)
            out+=f'<polyline points="{P([m(a,b) for a,b in pts])}" fill="none" stroke="{f}" stroke-width="{band*0.12:.1f}" stroke-linecap="square"/>'
    return out
C["07"]=f'<rect width="1024" height="1024" fill="{NAVY}"/><rect x="40" y="40" width="944" height="944" fill="{GOLD}"/>'+sq_meander(52,52,920,72,13,NAVY)+f'<rect x="132" y="132" width="760" height="760" fill="{CREAM}"/>'+emblem(512,512,340,uid="h")+f'<circle cx="512" cy="512" r="350" fill="none" stroke="{NAVY}" stroke-width="8"/>'

# 08 — the column becomes a form: same swirl, the pillar swapped for the return you file
def form(cx,cy,w,f,line):
    h=w*1.32; x=cx-w/2; y=cy-h/2; n=w*0.26; t=h*0.1
    s=f'<path d="M{x:.1f} {y:.1f} h{n:.1f} v{t:.1f} h{w-2*n:.1f} v{-t:.1f} h{n:.1f} v{h:.1f} h{-w:.1f} z" fill="{f}"/>'
    for i in range(4):
        s+=f'<rect x="{x+w*0.19:.1f}" y="{y+h*(0.32+0.15*i):.1f}" width="{w*(0.62 if i<3 else 0.38):.1f}" height="{h*0.055:.1f}" rx="{h*0.02:.1f}" fill="{line}"/>'
    return s
# the column swap: the column's own pixels (white layer, inside its box) and the medallion (gold layer) repainted red,
# so the red wing closes over where the pillar stood; then the form is set there
colbox='<defs><clipPath id="colbox"><path d="M937,1446 H1630 V1953 H937 Z"/></clipPath><clipPath id="goldback"><path clip-rule="evenodd" d="M925,1434 H1642 V1965 H925 Z M1116,1534 a86,86 0 1,0 172,0 a86,86 0 1,0 -172,0 Z"/></clipPath></defs>'
cover=colbox+f'<path d="M937,1446 H1630 V1953 H937 Z" fill="{RED}"/>'+'<g clip-path="url(#goldback)">'+L["gold"]+'</g>'+form(1283,1705,290,WHITE,RED)
C["08"]=squircle(512,CREAM)+f'<circle cx="512" cy="512" r="430" fill="{NAVY}"/><circle cx="512" cy="512" r="414" fill="{GOLD}"/>'+emblem(512,512,404,uid="i",extra=cover)

# 10 — stamp: one red ink, ring text all the way round, set at a slight angle like a hand-stamped seal
C["10"]=f'<rect width="1024" height="1024" fill="{WHITE}"/><g transform="rotate(-8 512 512)"><circle cx="512" cy="512" r="470" fill="none" stroke="{RED}" stroke-width="18"/><circle cx="512" cy="512" r="440" fill="none" stroke="{RED}" stroke-width="5"/><circle cx="512" cy="512" r="330" fill="none" stroke="{RED}" stroke-width="5"/>'+ring_text(512,512,368,"eBIRFORMS",RED,62,spacing=14)+ring_text(512,512,415,"OFFLINE PACKAGE",RED,42,spacing=10,top=False)+star(130,512,16,RED)+star(894,512,16,RED)+emblem(512,512,310,pal={"white":WHITE,"blue":RED,"red":RED,"gold":RED,"navy":WHITE},stroke=WHITE,sw=5,uid="j")+'</g>'

# 11 — sun and eagle only: the swirl's red half and the column taken out, leaving the two heraldic marks
# 11 — heraldic two-blue: the red wing turned navy, so the mark reads as sky, sun and eagle in the colours of the seal's rim
C["11"]=squircle(512,GOLD)+f'<circle cx="512" cy="512" r="440" fill="{NAVY}"/><circle cx="512" cy="512" r="424" fill="{CREAM}"/>'+emblem(512,512,424,pal={"white":CREAM,"red":NAVY,"navy":GOLD},uid="k")

# 12 — flat modern: the emblem re-coloured to a contemporary flat palette, white ring, no ornament
C["12"]=squircle(512,"#0F172A")+f'<circle cx="512" cy="512" r="410" fill="#F8FAFC"/>'+emblem(512,512,388,pal={"white":"#F8FAFC","blue":"#2563EB","red":"#E11D48","gold":"#F59E0B","navy":"#0F172A"},uid="l")

for k,v in C.items(): open(f"c{k}.svg","w").write(svg(v))

# 09 — horizontal lockup for the README / site header: badge + wordmark + version line
lock=f'<rect width="1800" height="600" fill="{WHITE}"/><circle cx="300" cy="300" r="250" fill="{NAVY}"/><circle cx="300" cy="300" r="238" fill="{GOLD}"/>'+meander(300,300,224,236,36,NAVY)+emblem(300,300,222,uid="m")
lock+=f'<text x="600" y="330" font-family="Avenir Next" font-weight="700" font-size="190" letter-spacing="-4" fill="{NAVY}">e<tspan fill="{RED}">BIR</tspan>Forms</text>'
lock+=f'<rect x="606" y="372" width="1060" height="6" fill="{GOLD}"/><text x="606" y="450" font-family="Avenir Next" font-weight="500" font-size="52" letter-spacing="10" fill="{NAVY}">OFFLINE PACKAGE · v7.9.6.2.1</text>'
open("c09.svg","w").write(svg(lock,1800,600))
