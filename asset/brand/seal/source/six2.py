from six import *
NOCOL=('<defs><clipPath id="gb"><path clip-rule="evenodd" d="M925,1434 H1642 V1965 H925 Z M1116,1534 a86,86 0 1,0 172,0 a86,86 0 1,0 -172,0 Z"/></clipPath></defs>'
       f'<path d="M937,1446 H1630 V1953 H937 Z" fill="{RED}"/><g clip-path="url(#gb)">'+L["gold"]+'</g>')
_emb=emblem
def emblem_nocol(*a,**k): k["extra"]=k.get("extra","")+NOCOL; return _emb(*a,**k)
import six as S; S.emblem=emblem_nocol
V={
 "m":dict(R=760,focus=(1330,966),field=CREAM),
 "n":dict(R=760,focus=(1330,966),field=WHITE),
 "o":dict(R=760,focus=(1330,966),grad=("#FFFFFF","#D9E3FF")),
 "p":dict(R=680,focus=(1290,1010),field=CREAM),
 "q":dict(R=760,focus=(1330,966),field=CREAM,border=(GOLD,14)),
 "r":dict(R=760,focus=(1330,966),field=CREAM,rot=-8),
 "s":dict(R=840,focus=(1350,940),field=CREAM),
 "t":dict(R=760,focus=(1330,966),grad=("#FFFFFF","#D9E3FF"),border=(NAVY,14)),
 "u":dict(R=680,focus=(1290,1010),field=WHITE,border=(NAVY,16)),
 "v":dict(R=760,focus=(1330,966),field="#FFF1C9"),
 "w":dict(R=760,focus=(1330,966),field=CREAM,pal={"blue":"#2457D6","red":"#D3122F","gold":"#F7B500"}),
 "x":dict(R=720,focus=(1310,990),field=CREAM,rot=-8,border=(GOLD,12)),
}
for k,v in V.items(): open(f"s6{k}.svg","w").write(svg(S.six(k,**v)))
