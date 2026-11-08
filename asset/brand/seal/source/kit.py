import math, re
NAVY="#14286B"; INK="#0C1A4A"; BLUE="#1F4FB8"; SKY="#4F7BE8"; RED="#C8102E"; GOLD="#F4B400"; CREAM="#FBF6EA"; WHITE="#FFFFFF"
L={k:open(f"L_{k}.svgfrag").read() for k in ["white","navy","gold","blue","red"]}
SRC=2564; SC=1282; DISC=826          # traced space: centre, inner-disc radius
def recolor(frag,col,stroke=None,sw=0):
    f=re.sub(r'fill="[^"]+"',f'fill="{col}"',frag,count=1)
    if stroke:
        f=re.sub(r'\sstroke="[^"]*"','',f,count=1)
        f=f.replace('<g ',f'<g stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" ',1)
    return f
def emblem(cx,cy,r,pal=None,uid="e",drop=(),stroke=None,sw=0,no1904=True,clip_r=DISC,extra="",over=""):
    # BIR's emblem (eagle swirl, sun, stars, column) traced from bir.png, clipped to its inner disc, placed at cx,cy radius r
    pal={"white":WHITE,"navy":NAVY,"gold":GOLD,"blue":BLUE,"red":RED,**(pal or {})}
    s=r/clip_r
    sw=sw/(0.1*s) if stroke else 0        # sw is in canvas px; potrace paths sit inside scale(0.1)
    body="".join(recolor(L[k],pal[k],stroke,sw) for k in ["white","gold","blue","red"] if k not in drop and pal[k]!="none")
    if "navy" not in drop and pal["navy"]!="none": body+=f'<g mask="url(#m{uid})">'+recolor(L["navy"],pal["navy"],stroke,sw)+'</g>'
    mask=f'<mask id="m{uid}"><rect width="{SRC}" height="{SRC}" fill="#fff"/>'+('')+f'</mask>'
    patch='<path d="M1135,1935 L1430,1935 L1430,2090 L1135,2090 Z" fill="'+pal["gold"]+'"/>' if no1904 and pal["gold"]!="none" else ""
    return (f'<defs><clipPath id="c{uid}"><circle cx="{SC}" cy="{SC}" r="{clip_r}"/></clipPath>{mask}</defs>'
            f'<g transform="translate({cx-SC*s:.2f},{cy-SC*s:.2f}) scale({s:.5f})"><g clip-path="url(#c{uid})">{body}{patch}{extra}{over}</g></g>')
def P(pts): return " ".join(f"{x:.1f},{y:.1f}" for x,y in pts)
def at(cx,cy,r,a): a=math.radians(a); return (cx+r*math.cos(a),cy+r*math.sin(a))
def seal_edge(cx,cy,R,swing=0.08,lobes=8,f=NAVY,rot=0):
    # BIR's edge, measured off the traced seal: r = R·(1 − swing·(1 − cos 8θ)/2) — peaks 0.99, valleys 0.911
    pts=[]
    for i in range(1440):
        t=i/4; r=R*(1-swing*(1-math.cos(math.radians((t-rot)*lobes)))/2)
        pts.append(at(cx,cy,r,t))
    return f'<polygon points="{P(pts)}" fill="{f}"/>'
def meander(cx,cy,r0,r1,n,f):
    # Greek key band between r0 and r1, n repeats — each unit a squared spiral in polar cells
    s=""; h=r1-r0
    for i in range(n):
        a0=360*i/n; da=360/n
        def q(u,v): return at(cx,cy,r0+v*h,a0+u*da)
        # unit path on a 5x5 grid (u across, v up), stroke drawn as thin polygons
        path=[(0,0),(1,0),(1,0.8),(0.2,0.8),(0.2,0.4),(0.6,0.4),(0.6,0.6)]
        pts=[q(u,v) for u,v in path]
        s+=f'<polyline points="{P(pts)}" fill="none" stroke="{f}" stroke-width="{h*0.11:.2f}" stroke-linejoin="miter" stroke-linecap="square"/>'
    return s
FONTFILE={"Optima":("/System/Library/Fonts/Optima.ttc",{400:0,700:1,900:4}),"Avenir Next":("/System/Library/Fonts/Avenir Next.ttc",{})}
def advance(text,font,weight,size):
    from PIL import ImageFont
    path,idx=FONTFILE.get(font,FONTFILE["Optima"])
    f=ImageFont.truetype(path,200,index=idx.get(weight,0))
    return [f.getlength(ch)*size/200 for ch in text]
def ring_text(cx,cy,r,text,f,size,font="Optima",weight=700,spacing=6,top=True,uid="t"):
    # each glyph placed on the arc by its measured advance, rotated to the tangent; bottom text reads left→right too
    adv=advance(text,font,weight,size); total=sum(adv)+spacing*(len(text)-1)
    rr=r
    ang=total/rr*180/math.pi; a=(-90-ang/2) if top else (90+ang/2)
    out=""
    for ch,w in zip(text,adv):
        da=(w/2)/rr*180/math.pi
        a+= da if top else -da
        x,y=at(cx,cy,rr,a); rot=a+90 if top else a-90
        if ch!=" ": out+=f'<text x="{x:.1f}" y="{y:.1f}" transform="rotate({rot:.2f} {x:.1f} {y:.1f})" text-anchor="middle" font-family="{font}" font-weight="{weight}" font-size="{size}" fill="{f}">{ch}</text>'
        step=(w/2+spacing)/rr*180/math.pi
        a+= step if top else -step
    return out
def star(cx,cy,r,f,k=0.4): return f'<polygon points="{P([at(cx,cy,r if i%2==0 else r*k,-90+36*i) for i in range(10)])}" fill="{f}"/>'
def squircle(r,f,n=5,cx=512,cy=512):
    pts=[]
    for i in range(720):
        t=math.radians(i/2); c,s=math.cos(t),math.sin(t)
        pts.append((cx+r*math.copysign(abs(c)**(2/n),c),cy+r*math.copysign(abs(s)**(2/n),s)))
    return f'<polygon points="{P(pts)}" fill="{f}"/>'
def svg(body,w=1024,h=1024): return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>'
