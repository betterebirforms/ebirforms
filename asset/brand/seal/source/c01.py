from kit import *
# 01 — the seal, modernised: same anatomy (8-lobe edge, gold rim, text band, key ring, emblem), cleaner palette,
# geometric Greek key, Optima caps that say what the app is
b =seal_edge(512,512,500,f=GOLD)+seal_edge(512,512,488,f=NAVY)
b+=f'<circle cx="512" cy="512" r="352" fill="{GOLD}"/>'+meander(512,512,334,350,60,NAVY)
b+=f'<circle cx="512" cy="512" r="330" fill="{WHITE}"/>'
b+=emblem(512,512,330,uid="a")
b+=ring_text(512,512,388,"eBIRFORMS",WHITE,68,spacing=16)+ring_text(512,512,437,"OFFLINE PACKAGE",WHITE,46,spacing=11,top=False)
b+=f'<circle cx="122" cy="512" r="11" fill="{WHITE}"/><circle cx="902" cy="512" r="11" fill="{WHITE}"/>'
open("c01.svg","w").write(svg(b))
