"""eBIRForms on a Windows monitor, a MacBook and a Linux laptop, one picture (transparent ground).
usage: python3 compose.py <shot dir> <logo.png> <out.png>"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
shot, logo_path, out = sys.argv[1:4]
SS = 2
W, H = 2400, 1010
F = '/System/Library/Fonts/Supplemental/Arial.ttf'
FB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
logo = Image.open(logo_path).convert('RGBA')
def font(sz, bold=False): return ImageFont.truetype(FB if bold else F, sz)
def S(v): return int(round(v * SS))

def vgrad(w, h, stop):  # stop: [(t, (r,g,b,a))]
    g = Image.new('RGBA', (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stop) - 1):
            t0, c0 = stop[i]; t1, c1 = stop[i + 1]
            if t0 <= t <= t1:
                k = (t - t0) / max(1e-9, t1 - t0)
                g.putpixel((0, y), tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(4)))
                break
    return g.resize((w, h))
def hgrad(w, h, stop): return vgrad(h, w, stop).rotate(90, expand=True).transpose(Image.FLIP_TOP_BOTTOM)
def rr(img, box, r, fill, corner=None):
    x0, y0, x1, y1 = [S(v) for v in box]
    m = Image.new('L', (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, x1 - x0 - 1, y1 - y0 - 1), S(r), fill=255, corners=corner)
    if isinstance(fill, tuple): layer = Image.new('RGBA', m.size, fill)
    else: layer = fill.resize(m.size)
    a = Image.new('RGBA', m.size, (0, 0, 0, 0)); a.paste(layer, (0, 0), m)
    img.alpha_composite(a, (x0, y0))
def shadow(img, box, r, blur, alpha, oy=0):
    x0, y0, x1, y1 = box
    pad = blur * 3
    lay = Image.new('RGBA', (S(x1 - x0 + 2 * pad), S(y1 - y0 + 2 * pad)), (0, 0, 0, 0))
    ImageDraw.Draw(lay).rounded_rectangle((S(pad), S(pad), S(pad + x1 - x0), S(pad + y1 - y0)), S(r), fill=(16, 24, 40, alpha))
    lay = lay.filter(ImageFilter.GaussianBlur(S(blur)))
    img.alpha_composite(lay, (S(x0 - pad), S(y0 - pad + oy)))
def floor(img, cx, y, w, h, alpha):
    lay = Image.new('RGBA', (S(w * 1.6), S(h * 6)), (0, 0, 0, 0))
    ImageDraw.Draw(lay).ellipse((S(w * 0.3), S(h * 2.5), S(w * 1.3), S(h * 3.5)), fill=(16, 24, 40, alpha))
    lay = lay.filter(ImageFilter.GaussianBlur(S(h * 0.9)))
    img.alpha_composite(lay, (S(cx - w * 0.8), S(y - h * 3)))
def icon(size): return logo.resize((size, size), Image.LANCZOS)
def tile(d, img, x, y, s, color, r=None):  # an app icon: a rounded colour square
    d.rounded_rectangle((x, y, x + s, y + s), r or s // 4, fill=color)

# ---- screens (logical px) ----
def win_screen():
    sc = Image.new('RGBA', (1600, 900), (255, 255, 255, 255)); d = ImageDraw.Draw(sc)
    sc.paste(Image.open(f'{shot}/win.png').convert('RGBA').resize((1600, 820), Image.LANCZOS), (0, 32))
    d.rectangle((0, 0, 1600, 31), fill=(243, 243, 243, 255)); d.line((0, 31, 1600, 31), fill=(222, 222, 222, 255))
    sc.alpha_composite(icon(18), (10, 7)); d.text((36, 9), 'eBIRForms', font=font(13), fill=(30, 30, 30, 255))
    gx = 1600 - 138
    d.line((gx + 18, 16, gx + 28, 16), fill=(40, 40, 40, 255), width=1)
    d.rectangle((gx + 64, 11, gx + 73, 20), outline=(40, 40, 40, 255))
    d.line((gx + 110, 11, gx + 119, 20), fill=(40, 40, 40, 255)); d.line((gx + 110, 20, gx + 119, 11), fill=(40, 40, 40, 255))
    d.rectangle((0, 852, 1600, 900), fill=(238, 241, 246, 255)); d.line((0, 852, 1600, 852), fill=(214, 218, 226, 255))
    cx = 800; x = cx - 5 * 44 // 2 - 60
    for k, c in enumerate([(0, 120, 212), (0, 120, 212), (0, 120, 212), (0, 120, 212)]):  # start: four squares
        d.rectangle((x + 10 + (k % 2) * 13, 864 + (k // 2) * 13, x + 21 + (k % 2) * 13, 875 + (k // 2) * 13), fill=c + (255,))
    d.rounded_rectangle((x + 50, 864, x + 170, 888), 12, fill=(255, 255, 255, 255), outline=(208, 212, 220, 255))
    d.text((x + 66, 869), 'Search', font=font(12), fill=(110, 110, 110, 255))
    x += 184
    for c in [(255, 196, 0), (0, 120, 212), (16, 124, 65)]:
        tile(d, sc, x + 8, 864, 24, c + (255,), 6); x += 44
    d.rounded_rectangle((x + 2, 858, x + 38, 896), 6, fill=(255, 255, 255, 255))
    sc.alpha_composite(icon(26), (x + 7, 862)); d.rounded_rectangle((x + 12, 893, x + 28, 896), 2, fill=(0, 103, 192, 255))
    d.text((1500, 860), '3:45 PM', font=font(12), fill=(30, 30, 30, 255)); d.text((1490, 876), '11/8/2026', font=font(12), fill=(30, 30, 30, 255))
    return sc
def mac_screen():
    sc = Image.new('RGBA', (1440, 900), (255, 255, 255, 255)); d = ImageDraw.Draw(sc)
    sc.paste(Image.open(f'{shot}/mac.png').convert('RGBA').resize((1440, 848), Image.LANCZOS), (0, 52))
    d.rectangle((0, 0, 1440, 23), fill=(246, 246, 248, 255))
    x = 18
    for t, b in [('eBIRForms', True), ('File', False), ('Edit', False), ('Window', False), ('Help', False)]:
        d.text((x, 5), t, font=font(13, b), fill=(20, 20, 20, 255)); x += int(d.textlength(t, font=font(13, b))) + 22
    d.text((1300, 5), 'Sun 8 Nov  3:45 PM', font=font(13), fill=(20, 20, 20, 255))
    d.rectangle((0, 24, 1440, 51), fill=(236, 236, 238, 255)); d.line((0, 51, 1440, 51), fill=(212, 212, 216, 255))
    for k, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse((14 + k * 20, 32, 26 + k * 20, 44), fill=c + (255,))
    t = 'eBIRForms'; d.text((720 - d.textlength(t, font=font(13, True)) / 2, 30), t, font=font(13, True), fill=(60, 60, 60, 255))
    return sc
def linux_screen():
    sc = Image.new('RGBA', (1440, 900), (40, 40, 40, 255)); d = ImageDraw.Draw(sc)
    sc.paste(Image.open(f'{shot}/linux.png').convert('RGBA').resize((1368, 824), Image.LANCZOS), (72, 76))
    d.rectangle((0, 0, 1440, 31), fill=(24, 24, 24, 255))
    d.rounded_rectangle((10, 7, 74, 25), 9, fill=(58, 58, 58, 255)); d.text((22, 9), '• • •', font=font(12, True), fill=(235, 235, 235, 255))
    t = 'Nov 8  15:45'; d.text((720 - d.textlength(t, font=font(13, True)) / 2, 8), t, font=font(13, True), fill=(240, 240, 240, 255))
    for k in range(3): d.ellipse((1360 + k * 22, 11, 1370 + k * 22, 21), fill=(220, 220, 220, 255))
    d.rectangle((0, 32, 71, 900), fill=(48, 44, 52, 255))
    y = 46
    for c in [(233, 84, 32), (58, 120, 214), (110, 190, 80), (240, 180, 40)]:
        tile(d, sc, 14, y, 44, c + (255,), 12); y += 62
    sc.alpha_composite(icon(48), (12, y - 2)); d.ellipse((33, y + 50, 39, y + 56), fill=(233, 84, 32, 255))
    tile(d, sc, 22, 852, 28, (90, 86, 96, 255), 6)
    d.rectangle((72, 32, 1440, 75), fill=(246, 245, 244, 255)); d.line((72, 75, 1440, 75), fill=(220, 218, 216, 255))
    t = 'eBIRForms'; d.text((756 - d.textlength(t, font=font(14, True)) / 2, 45), t, font=font(14, True), fill=(46, 52, 54, 255))
    d.ellipse((1404, 42, 1426, 64), fill=(233, 84, 32, 255))
    d.line((1410, 48, 1420, 58), fill=(255, 255, 255, 255), width=2); d.line((1410, 58, 1420, 48), fill=(255, 255, 255, 255), width=2)
    d.ellipse((1372, 42, 1394, 64), fill=(226, 224, 222, 255)); d.line((1378, 53, 1388, 53), fill=(46, 52, 54, 255), width=2)
    return sc
def put_screen(img, sc, box):
    x0, y0, x1, y1 = [S(v) for v in box]
    s = sc.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    glare = hgrad(x1 - x0, y1 - y0, [(0, (255, 255, 255, 18)), (0.45, (255, 255, 255, 0)), (1, (255, 255, 255, 0))])
    s.alpha_composite(glare); img.alpha_composite(s, (x0, y0))

img = Image.new('RGBA', (S(W), S(H)), (0, 0, 0, 0))
FLOOR = 958
# ---- Windows monitor (centre, behind) ----
mx0, mx1, my0 = 720, 1680, 40
my1 = my0 + 14 + 524 + 14
floor(img, 1200, FLOOR - 128, 420, 16, 70)
shadow(img, (mx0, my0, mx1, my1), 18, 26, 60, 16)
neck = vgrad(10, 10, [(0, (214, 217, 223, 255)), (1, (150, 155, 164, 255))])
rr(img, (1158, my1 - 6, 1242, 800), 3, hgrad(84, 10, [(0, (160, 164, 172, 255)), (0.5, (226, 229, 234, 255)), (1, (150, 154, 162, 255))]))
rr(img, (1030, 794, 1370, 822), 12, vgrad(10, 10, [(0, (232, 234, 238, 255)), (1, (164, 168, 176, 255))]))
rr(img, (mx0 - 2, my0 - 2, mx1 + 2, my1 + 2), 20, (190, 194, 202, 255))
rr(img, (mx0, my0, mx1, my1), 18, vgrad(10, 10, [(0, (24, 25, 28, 255)), (1, (10, 11, 13, 255))]))
put_screen(img, win_screen(), (mx0 + 14, my0 + 14, mx1 - 14, my1 - 14))

def laptop(x0, w, bottom, dark, sc):
    bez, chin = 16, 24
    sw = w - 2 * bez; sh = round(sw * 10 / 16); top = bottom - (bez + sh + chin)
    floor(img, x0 + w / 2, FLOOR, w * 0.62, 16, 120)
    shadow(img, (x0, top, x0 + w, bottom), 22, 22, 54, 14)
    rim = (44, 46, 50, 255) if dark else (186, 190, 198, 255)
    rr(img, (x0 - 3, top - 3, x0 + w + 3, bottom + 1), 25, rim, (True, True, False, False))
    rr(img, (x0, top, x0 + w, bottom), 22, (8, 9, 11, 255), (True, True, False, False))
    put_screen(img, sc, (x0 + bez, top + bez, x0 + w - bez, top + bez + sh))
    d = ImageDraw.Draw(img); cx = S(x0 + w / 2)
    d.ellipse((cx - S(3), S(top + 6), cx + S(3), S(top + 12)), fill=(30, 32, 38, 255))
    dx0, dx1 = x0 - 50, x0 + w + 50
    stop = [(0, (74, 76, 82, 255)), (0.5, (38, 40, 44, 255)), (1, (18, 19, 21, 255))] if dark else [(0, (242, 243, 246, 255)), (0.55, (196, 199, 205, 255)), (1, (134, 138, 147, 255))]
    rr(img, (dx0, bottom, dx1, bottom + 22), 10, vgrad(10, 10, stop), (False, False, True, True))
    lip = (92, 95, 102, 255) if dark else (252, 252, 253, 255)
    rr(img, (dx0, bottom, dx1, bottom + 4), 1, lip)
    if not dark: rr(img, (x0 + w / 2 - 70, bottom, x0 + w / 2 + 70, bottom + 8), 6, (206, 209, 214, 255), (False, False, True, True))
    return top
laptop(130, 780, 934, False, mac_screen())
laptop(1490, 780, 934, True, linux_screen())
img = img.resize((W, H), Image.LANCZOS)
bb = img.getbbox(); img = img.crop((max(0, bb[0] - 40), max(0, bb[1] - 30), min(W, bb[2] + 40), min(H, bb[3] + 30)))
img.save(out); print(out, img.size)
