from kit import *
def sqpts(r=512,n=5):
    out=[]
    for i in range(720):
        t=math.radians(i/2); c,s=math.cos(t),math.sin(t)
        out.append((512+r*math.copysign(abs(c)**(2/n),c),512+r*math.copysign(abs(s)**(2/n),s)))
    return P(out)
def six(uid,R=900,focus=(1360,1020),at_=(512,512),field=WHITE,bg=None,rot=0,pal=None,border=None,grad=None):
    # R: emblem disc radius on canvas; focus: traced point placed at canvas point at_; field: colour of BIR's white field
    k=R/826; cx=at_[0]-(focus[0]-1282)*k; cy=at_[1]-(focus[1]-1282)*k
    bgc=bg or field
    defs=f'<defs><clipPath id="q{uid}"><polygon points="{sqpts()}"/></clipPath>'
    if grad: defs+=f'<radialGradient id="g{uid}" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="{grad[0]}"/><stop offset="1" stop-color="{grad[1]}"/></radialGradient>'; bgc=f"url(#g{uid})"
    defs+='</defs>'
    p={"white":"none" if grad else field,**(pal or {})}
    body=f'<rect width="1024" height="1024" fill="{bgc}"/><g transform="rotate({rot} 512 512)">'+emblem(cx,cy,R,pal=p,uid=uid)+'</g>'
    out=defs+f'<g clip-path="url(#q{uid})">{body}</g>'
    if border: out+=f'<polygon points="{sqpts(512-border[1]/2-14)}" fill="none" stroke="{border[0]}" stroke-width="{border[1]}"/>'
    return out
V={
 "a":dict(),                                                     # the original 06, for reference
 "b":dict(field=NAVY),                                           # white field → navy: top and bottom fill solid
 "c":dict(field=CREAM),
 "d":dict(grad=("#2E5BD6",INK)),                                 # field → a navy sky gradient behind everything
 "e":dict(R=720,focus=(1300,1150)),                              # pulled back: sun rays whole at top, gold+red sweep the bottom
 "f":dict(R=720,focus=(1300,1150),field=NAVY),
 "g":dict(R=720,focus=(1300,1150),grad=("#2E5BD6",INK)),
 "h":dict(R=1050,focus=(1390,1000),field=NAVY),                  # tighter on the head
 "i":dict(R=820,focus=(1330,1080),field=NAVY,rot=-12),            # tilted up: the eagle climbs
 "j":dict(R=760,focus=(1290,1120),field=INK,pal={"blue":SKY,"red":"#EF3B55"},border=(GOLD,14)),
 "k":dict(R=760,focus=(1290,1120),field=CREAM,border=(NAVY,16)),
 "l":dict(R=820,focus=(1330,1080),grad=("#2E5BD6",INK),rot=-12,border=(GOLD,12)),
}
for k,v in V.items(): open(f"s6{k}.svg","w").write(svg(six(k,**v)))
