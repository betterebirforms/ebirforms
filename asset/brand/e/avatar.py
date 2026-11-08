# The betterebirforms account avatar: BIR's eBIRForms "e" (letterform measured off BIR's mark) filled with a four-corner
# gradient in BIR's colours — blue top, red bottom-left, gold bottom-right — blended in OKLab, eased, dithered, on a pale
# paper fade. Needs numpy, Pillow and rsvg-convert.   python3 asset/brand/e/avatar.py  → asset/brand/avatar.png
import os, subprocess, tempfile
import numpy as np
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(HERE,"..","avatar.png")
N=1024; C=512; D=600
# the e: one round counter (0.25 D wide) split by a blue crossbar; the top half is the eye, the bottom half hangs under a
# thin slit that runs out through the right of the disc
w=0.25*D; r=w/2; L=C-D/2+0.38*D; ry=0.143*D; ryb=0.133*D
base=C-0.153*D; bt=C+0.098*D; bb=bt+0.055*D; R=C+D/2+14
E=(f'M{L},{base} A{r},{ry} 0 0,1 {L+w},{base} Z '
   f'M{L},{bt} H{R} V{bb} H{L+w} A{r},{ryb} 0 0,1 {L},{bt} Z')
with tempfile.TemporaryDirectory() as t:
    open(f"{t}/m.svg","w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" width="{N}" height="{N}">'
        f'<rect width="{N}" height="{N}"/><circle cx="{C}" cy="{C}" r="{D/2}" fill="#fff"/><path d="{E}"/></svg>')
    subprocess.run(["rsvg-convert","-w",str(N),f"{t}/m.svg","-o",f"{t}/m.png"],check=True)
    mask=np.asarray(Image.open(f"{t}/m.png").convert("L"),dtype=np.float64)[...,None]/255
y,x=np.mgrid[0:N,0:N].astype(np.float64)
def hexc(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],dtype=np.float64)
def lin(c): c=c/255; return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
def unlin(c): return 255*np.where(c<=0.0031308,12.92*c,1.055*np.clip(c,0,None)**(1/2.4)-0.055)
M1=np.array([[0.4122214708,0.5363325363,0.0514459929],[0.2119034982,0.6806995451,0.1073969566],[0.0883024619,0.2817188376,0.6299787005]])
M2=np.array([[0.2104542553,0.7936177850,-0.0040720468],[1.9779984951,-2.4285922050,0.4505937099],[0.0259040371,0.7827717662,-0.8086757660]])
def ok(h): return np.cbrt(lin(hexc(h))@M1.T)@M2.T
def rgb(o): return unlin(((o@np.linalg.inv(M2).T)**3)@np.linalg.inv(M1).T)
def ease(t): t=np.clip(t,0,1); return t*t*(3-2*t)
rng=np.random.default_rng(5)
def dither(img): return img+(rng.random((N,N,1))-rng.random((N,N,1)))*0.6
u=ease((x-(C-D/2))/D)[...,None]; v=ease((y-(C-D/2))/D)[...,None]
top=ok("#3D6FE0")*(1-u)+ok("#1F4FB8")*u; bot=ok("#C8102E")*(1-u)+ok("#F4B400")*u
fill=dither(rgb(top*(1-v)+bot*v))
k=np.clip(y/N,0,1)[...,None]; paper=dither(rgb(ok("#FFFFFF")*(1-k)+ok("#F1F4FA")*k))
Image.fromarray(np.clip(np.round(paper*(1-mask)+fill*mask),0,255).astype(np.uint8)).save(OUT)
print("avatar:",os.path.normpath(OUT))
