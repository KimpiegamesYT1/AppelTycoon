# Genereert het app-logo: icon.svg (favicon), icon-full.svg (zonder ronde hoeken, voor iOS) en
# icon-maskable.svg (Android, met veilige marge). De PNG-versies in de hoofdmap zijn hiervan gerenderd.
# Gebruik: python3 tools/make-icon.py  (schrijft de SVG-bestanden in de huidige map)
import math, sys

def lerp(a, b, t): return a + (b - a) * t
def hexmix(c1, c2, t):
    a = [int(c1[i:i+2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i+2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(lerp(x, y, t)) for x, y in zip(a, b))

def pts(p): return ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)

# appel-omtrek (512-raster): parametrisch, met een deuk bovenaan en smaller naar onderen
def outline(n=18, R=142, cx=256, cy=304):
    out = []
    for i in range(n):
        th = i * 2 * math.pi / n
        w = th if th <= math.pi else th - 2 * math.pi
        x = math.sin(th) * R * 1.06 * (1 - 0.15 * max(0, -math.cos(th)) ** 1.6)
        y = -math.cos(th) * R * 1.06
        y += 38 * math.exp(-(w / 0.36) ** 2)              # deuk bij het steeltje
        y -= 12 * math.exp(-((th - math.pi) / 0.28) ** 2)  # kuiltje onderaan
        out.append((cx + x, cy + y))
    return out
OUT = outline()
C = (250, 300)
LIGHT = (-0.55, -0.83)
DARK, MID, LITE = '#b3161b', '#e3342f', '#ff7a66'

def shade(p):
    dx, dy = p[0] - C[0], p[1] - C[1]
    d = math.hypot(dx, dy) or 1
    dot = (dx * LIGHT[0] + dy * LIGHT[1]) / d   # -1 .. 1
    edge = min(1, d / 170)
    t = (dot + 1) / 2 * (0.35 + 0.65 * edge) + (1 - edge) * 0.32
    return hexmix(DARK, MID, min(1, t * 1.6)) if t < 0.62 else hexmix(MID, LITE, (t - 0.62) / 0.38)

def apple(tx=0, ty=0, s=1.0):
    T = lambda p: (tx + (p[0] - 256) * s + 256, ty + (p[1] - 300) * s + 300)
    inner = [(lerp(C[0], x, 0.52), lerp(C[1], y, 0.52)) for x, y in OUT]
    out = []
    n = len(OUT)
    tris = []
    for i in range(n):
        a, b = OUT[i], OUT[(i + 1) % n]
        ia, ib = inner[i], inner[(i + 1) % n]
        tris.append([a, b, ib]); tris.append([a, ib, ia]); tris.append([ia, ib, C])
    # effen onderlaag, zodat er tussen de facetten geen lucht doorheen schemert
    out.append(f'<polygon points="{pts([T(p) for p in OUT])}" fill="{MID}"/>')
    for t in tris:
        cx = sum(p[0] for p in t) / 3; cy = sum(p[1] for p in t) / 3
        col = shade((cx, cy))
        out.append(f'<polygon points="{pts([T(p) for p in t])}" fill="{col}" stroke="{col}" stroke-width="1.2" stroke-linejoin="round"/>')
    # glimlicht linksboven
    hl = [(164, 222), (196, 200), (212, 212), (182, 262), (160, 300), (148, 274)]
    out.append(f'<polygon points="{pts([T(p) for p in hl])}" fill="#ffffff" opacity="0.5"/>')
    # steeltje (iets gebogen) en een blad met nerf
    stem = [(246, 206), (262, 206), (268, 160), (284, 120), (269, 113), (252, 156)]
    out.append(f'<polygon points="{pts([T(p) for p in stem])}" fill="#6b3f22"/>')
    leafUp = [(270, 152), (290, 112), (330, 90), (382, 92)]
    leafLo = [(270, 152), (382, 92), (356, 130), (314, 152)]
    out.append(f'<polygon points="{pts([T(p) for p in leafUp])}" fill="#8be05f" stroke="#8be05f" stroke-width="2" stroke-linejoin="round"/>')
    out.append(f'<polygon points="{pts([T(p) for p in leafLo])}" fill="#4fb33f" stroke="#4fb33f" stroke-width="2" stroke-linejoin="round"/>')
    return out

def coin(cx, cy, r):
    o = []
    o.append(f'<circle cx="{cx}" cy="{cy + r*0.12:.1f}" r="{r}" fill="#c98a00"/>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#ffc83d"/>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{r*0.78:.1f}" fill="#ffd95e" stroke="#e8a400" stroke-width="{r*0.07:.1f}"/>')
    # euro-teken als paden (geen lettertype nodig)
    s = r / 60
    o.append(f'<g transform="translate({cx},{cy}) scale({s:.3f})" fill="none" stroke="#a86a00" stroke-width="13" stroke-linecap="round">'
             '<path d="M22,-26 A30,30 0 1 0 22,26"/><path d="M-36,-8 H12 M-36,10 H8"/></g>')
    o.append(f'<path d="M{cx - r*0.55:.1f},{cy - r*0.35:.1f} A{r*0.7:.1f},{r*0.7:.1f} 0 0 1 {cx - r*0.1:.1f},{cy - r*0.68:.1f}" stroke="#fff6cf" stroke-width="{r*0.12:.1f}" stroke-linecap="round" fill="none"/>')
    return o

def bg(full):
    o = ['<defs><radialGradient id="sky" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#bff0ff"/><stop offset="1" stop-color="#4fb3e8"/></radialGradient>',
         '<clipPath id="clip"><rect width="512" height="512" rx="%d"/></clipPath></defs>' % (0 if full else 112)]
    o.append('<g clip-path="url(#clip)">')
    o.append('<rect width="512" height="512" fill="url(#sky)"/>')
    # zonnestralen vanuit het midden
    for k in range(16):
        a0 = k * math.pi * 2 / 16
        a1 = a0 + math.pi / 16
        p = [(256, 290), (256 + 520 * math.cos(a0), 290 + 520 * math.sin(a0)), (256 + 520 * math.cos(a1), 290 + 520 * math.sin(a1))]
        o.append(f'<polygon points="{pts(p)}" fill="#ffffff" opacity="0.13"/>')
    # gras onderaan
    o.append('<path d="M0,430 Q128,400 256,418 T512,410 V512 H0 Z" fill="#7cc95a"/>')
    o.append('<path d="M0,458 Q140,436 270,452 T512,446 V512 H0 Z" fill="#5fae45"/>')
    return o

def icon(full=False, s=1.0, with_coin=True):
    o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">']
    o += bg(full)
    # schaduw onder de appel
    o.append(f'<ellipse cx="256" cy="{300 + 146 * s:.0f}" rx="{130 * s:.0f}" ry="{20 * s:.0f}" fill="#2f6b23" opacity="0.35"/>')
    o += apple(0, 0, s * 0.94)
    if with_coin:
        o += coin(256 + 118 * s, 300 + 104 * s, 58 * s)
    o.append('</g></svg>')
    return '\n'.join(o)

open('icon.svg', 'w').write(icon())
open('icon-maskable.svg', 'w').write(icon(full=True, s=0.78))
open('icon-full.svg', 'w').write(icon(full=True))
