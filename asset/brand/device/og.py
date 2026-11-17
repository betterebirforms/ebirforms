"""The 1200x630 social share image (Open Graph / X card) for the web version.
usage: python3 og.py <shot dir> <logo.png> <out.png>
Two real screens, nothing cropped or stretched:
  <shot dir>/laptop.png  the web version at a MacBook Air 13" viewport (1470 pt wide, 956 pt less the menu bar and the
                         browser bars = 831 pt), 2x: laptop.mjs
  <shot dir>/phone.png   the web version in the iPhone 17 Pro simulator (402 x 874 pt, 3x, real status bar and screen
                         mask): phone-sim.mjs. Framed in Xcode's own Simulator art for that model, rendered
                         from Xcode's install each run (pdf2png.swift), not kept in the repo
The laptop body is PhilForms' (tools/landing/device.mjs), with no maker's mark. Type is Avenir Next (ships with macOS; SF Pro's licence covers Apple-platform mockups only)."""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont
shot, logo_path, out = sys.argv[1:4]
W, H, SS = 1200, 630, 2
AVENIR = '/System/Library/Fonts/Avenir Next.ttc'
FACE = {'bold': 0, 'demi': 2, 'medium': 5, 'regular': 7}
def font(sz, face='regular'): return ImageFont.truetype(AVENIR, max(1, round(sz * SS)), index=FACE[face])
def S(v): return int(round(v * SS))
WHITE, GOLD, MIST, INK = (255, 255, 255, 255), (244, 180, 0, 255), (200, 214, 245, 255), (8, 9, 11, 255)

def vgrad(w, h, stop):
    g = Image.new('RGBA', (1, 256))
    for i in range(256):
        t = i / 255
        for k in range(len(stop) - 1):
            (t0, a), (t1, b) = stop[k], stop[k + 1]
            if t0 <= t <= t1:
                u = (t - t0) / (t1 - t0) if t1 > t0 else 0
                g.putpixel((0, i), tuple(int(a[j] + (b[j] - a[j]) * u) for j in range(4))); break
    return g.resize((max(1, w), max(1, h)))

# ground: brand navy, lighter toward the devices, a soft light behind them
img = Image.new('RGBA', (S(W), S(H)))
row = Image.new('RGBA', (W, 1))
for x in range(W):
    t = x / (W - 1)
    row.putpixel((x, 0), (int(12 + 18 * t), int(34 + 40 * t), int(96 + 58 * t), 255))
img.paste(row.resize((S(W), S(H))))
glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse((S(560), S(80), S(1240), S(620)), fill=(110, 160, 255, 64))
img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S(90))))

def shadow(box, radius, blur, alpha, dy):
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = box
    ImageDraw.Draw(lay).rounded_rectangle((S(x0), S(y0 + dy), S(x1), S(y1 + dy)), S(radius), fill=(0, 0, 16, alpha))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(S(blur))))

# ---- laptop: PhilForms' body proportions (bezel 20, chin 30, deck 1560 on a 1420 lid) around a 1470 x 956 pt screen ----
SCR_W = 520; SCR_H = SCR_W * 956 / 1470
U = SCR_W / 1380                                       # PhilForms' units (its screen is 1380 wide)
BEZ, CHIN = 20 * U, 30 * U
LID_W, LID_H = SCR_W + 2 * BEZ, SCR_H + BEZ + CHIN
PT = SCR_W / 1470                                      # px per point on the laptop
lx0, lbottom = 618, 474
ltop = lbottom - LID_H
sx0, sy0 = lx0 + BEZ, ltop + BEZ
deck_w = 1560 * U; dx0 = lx0 + LID_W / 2 - deck_w / 2; dx1 = dx0 + deck_w; deck_h = 30 * U
shadow((dx0 + 20, ltop + 20, dx1 - 20, lbottom + deck_h), 14, 26, 120, 12)
rim = Image.new('RGBA', (S(LID_W), 1))
for x in range(rim.width):
    t = abs(x / (rim.width - 1) - 0.5) * 2
    rim.putpixel((x, 0), (int(198 - 42 * t), int(201 - 41 * t), int(208 - 40 * t), 255))
rim = rim.resize((S(LID_W), S(LID_H + 1)))
rm = Image.new('L', rim.size, 0)
ImageDraw.Draw(rm).rounded_rectangle((0, 0, rim.width - 1, rim.height + S(30)), S(26 * U), fill=255)
img.paste(rim, (S(lx0), S(ltop)), rm)
d = ImageDraw.Draw(img)
d.rounded_rectangle((S(lx0 + 3 * U), S(ltop + 3 * U), S(lx0 + LID_W - 3 * U), S(lbottom + 4)), S(23 * U), fill=INK)
d.ellipse((S(lx0 + LID_W / 2 - 3.5 * U), S(ltop + BEZ / 2 + U - 3.5 * U), S(lx0 + LID_W / 2 + 3.5 * U), S(ltop + BEZ / 2 + U + 3.5 * U)), fill=(28, 32, 38, 255))

# the screen at 1470 x 956 pt: menu bar (37 pt), the browser's tab strip and address bar (88 pt), the page
scr = Image.new('RGBA', (S(SCR_W), S(SCR_H)), WHITE)
k = S(PT)                                              # supersampled px per point
sd = ImageDraw.Draw(scr)
menu, tabs, addr = 37 * k, 40 * k, 48 * k
sd.rectangle((0, 0, scr.width, menu), fill=(236, 238, 242, 255))
sd.text((scr.width - 18 * k, menu / 2), 'Tue 17 Nov  9:41', font=font(13 * PT, 'demi'), fill=(30, 32, 38, 255), anchor='rm')
y = menu
sd.rectangle((0, y, scr.width, y + tabs), fill=(222, 225, 231, 255))
for j, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
    cx = 20 * k + j * 20 * k; cy = y + tabs / 2
    sd.ellipse((cx - 6 * k, cy - 6 * k, cx + 6 * k, cy + 6 * k), fill=c + (255,))
sd.rounded_rectangle((84 * k, y + 6 * k, 84 * k + 240 * k, y + tabs + 2 * k), 8 * k, fill=(246, 247, 249, 255))
sd.text((100 * k, y + tabs / 2 + 2 * k), 'eBIRForms', font=font(12.5 * PT, 'medium'), fill=(40, 44, 52, 255), anchor='lm')
y += tabs
sd.rectangle((0, y, scr.width, y + addr), fill=(246, 247, 249, 255))
sd.line((0, y + addr - 1, scr.width, y + addr - 1), fill=(214, 217, 224, 255), width=max(1, k // 2))
sd.rounded_rectangle((120 * k, y + 8 * k, scr.width - 120 * k, y + addr - 8 * k), 16 * k, fill=(230, 233, 238, 255))
sd.text((140 * k, y + addr / 2), 'betterebirforms.github.io/ebirforms/form/1701Qv2018', font=font(13.5 * PT, 'medium'), fill=(40, 44, 52, 255), anchor='lm')
y += addr
page = Image.open(f'{shot}/laptop.png').convert('RGBA')   # 1470 x 831 pt at 2x, the whole viewport
page = page.resize((scr.width, scr.height - round(y)), Image.LANCZOS)
scr.alpha_composite(page, (0, round(y)))
m = Image.new('L', scr.size, 0)
ImageDraw.Draw(m).rounded_rectangle((0, 0, scr.width - 1, scr.height + S(20)), S(8), fill=255)
img.paste(scr, (S(sx0), S(sy0)), m)
# the deck and its lip
deck = vgrad(S(deck_w), S(deck_h), [(0, (242, 243, 246, 255)), (0.22, (201, 204, 211, 255)), (0.7, (178, 182, 190, 255)), (1, (134, 138, 147, 255))])
dm = Image.new('L', deck.size, 0)
ImageDraw.Draw(dm).rounded_rectangle((0, -S(34 * U), deck.width - 1, deck.height - 1), S(34 * U), fill=255)
img.paste(deck, (S(dx0), S(lbottom)), dm)
lip = vgrad(S(260 * U), S(12 * U), [(0, (157, 161, 169, 255)), (1, (195, 198, 204, 255))])
lm = Image.new('L', lip.size, 0)
ImageDraw.Draw(lm).rounded_rectangle((0, -S(14 * U), lip.width - 1, lip.height - 1), S(14 * U), fill=255)
img.paste(lip, (S(lx0 + LID_W / 2 - 130 * U), S(lbottom)), lm)

# ---- phone: Xcode's own Simulator frame for iPhone 17 Pro (DeviceKit chrome phone11: 436 x 908 pt, screen 402 x 874
# pt at 17, 17, corner radius 80 pt); the screen is the simulator's screenshot, with its own screen mask ----
CHROME = '/Library/Developer/DeviceKit/Chrome/phone11.devicechrome/Contents/Resources'   # installed with Xcode; never committed
FR = tempfile.mkdtemp()
for src, name in [('PhoneComposite', 'iphone-17-pro'), ('Mute BTN', 'button-action'), ('Vol BTN', 'button-volume'), ('X_Power BTN', 'button-power')]:
    subprocess.run(['swift', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pdf2png.swift'), f'{CHROME}/{src}.pdf', f'{FR}/{name}.png', '3'], check=True, capture_output=True)
P = 0.30                                               # px per pt: the phone at its real size beside the laptop
px0, pbottom = 530, 570
py0 = pbottom - 908 * P
shadow((px0 + 2, py0 + 4, px0 + 434 * P, pbottom), 60 * P, 14, 200, 10)
for name, x, y in [('button-action', -1.8, 160), ('button-volume', -1.8, 221), ('button-volume', -1.8, 300), ('button-power', 436 - 14.2, 262)]:
    b = Image.open(f'{FR}/{name}.png').convert('RGBA')
    b = b.resize((S(b.width / 3 * P), S(b.height / 3 * P)), Image.LANCZOS)
    img.alpha_composite(b, (S(px0 + x * P), S(py0 + y * P)))
frame = Image.open(f'{FR}/iphone-17-pro.png').convert('RGBA').resize((S(436 * P), S(908 * P)), Image.LANCZOS)
img.alpha_composite(frame, (S(px0), S(py0)))
ph = Image.open(f'{shot}/phone.png').convert('RGBA').resize((S(402 * P), S(874 * P)), Image.LANCZOS)
hb = ImageDraw.Draw(ph)                                   # the home bar, which the simulator's screenshot leaves out
u = ph.width / 402
hb.rounded_rectangle((ph.width / 2 - 72 * u, ph.height - 13 * u, ph.width / 2 + 72 * u, ph.height - 8 * u), 2.5 * u, fill=(11, 11, 12, 255))
img.alpha_composite(ph, (S(px0 + 17 * P), S(py0 + 17 * P)))

# ---- text, left column (x 64..470) ----
d = ImageDraw.Draw(img)
logo = Image.open(logo_path).convert('RGBA').resize((S(60), S(60)), Image.LANCZOS)
img.alpha_composite(logo, (S(64), S(76)))
d.text((S(140), S(106)), 'eBIRForms', font=font(34, 'demi'), fill=WHITE, anchor='lm')
y = 250
for line in ['On Mac, Windows,', 'Linux and the web']:
    d.text((S(64), S(y)), line, font=font(42, 'bold'), fill=WHITE, anchor='ls'); y += 56
d.rounded_rectangle((S(64), S(y - 20), S(110), S(y - 15)), S(2.5), fill=GOLD)
y += 22
for line in ['Free. The same forms and', 'savefiles as BIR’s own app.']:
    d.text((S(64), S(y)), line, font=font(23, 'medium'), fill=MIST, anchor='ls'); y += 34

img = img.resize((W, H), Image.LANCZOS).convert('RGB')
img.save(out, optimize=True); print(out, img.size)
