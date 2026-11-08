from kit import *
from six import six, sqpts
import subprocess
fill=open("s6a-fill.frag").read()
def clip(uid,body): return f'<defs><clipPath id="z{uid}"><polygon points="{sqpts()}"/></clipPath></defs><g clip-path="url(#z{uid})">{body}</g>'
base=lambda u: six(u)
cover=f'<circle cx="102" cy="307" r="58" fill="{BLUE}"/>'
V={
 "1":("filled, star kept", fill),
 "2":("no star", fill+cover),
 "3":("three stars on the band", fill+cover+star(70,318,34,GOLD)+star(205,292,34,GOLD)+star(340,290,34,GOLD)),
 "4":("one large star", fill+cover+star(150,300,62,GOLD)),
 "5":("three stars, arc rising to the head", fill+cover+star(80,330,30,GOLD)+star(200,288,36,GOLD)+star(330,272,42,GOLD)),
 "6":("three white stars", fill+cover+star(70,318,34,WHITE)+star(205,292,34,WHITE)+star(340,290,34,WHITE)),
}
for k,(name,extra) in V.items():
  open(f"t6{k}.svg","w").write(svg(six("t"+k)+clip("t"+k,extra)))
  subprocess.run(["rsvg-convert","-w","512",f"t6{k}.svg","-o",f"t6{k}.png"],check=True)
  print(k,name)
