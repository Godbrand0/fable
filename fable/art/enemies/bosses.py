"""Bosses drawn in code: Sand Wraith, Lava Pumpkin, Swamp Hydra, Fire Demon,
Glacier Wyrm, Thunder Colossus. Ready / attack / hurt / death, facing right."""
import math
from pixelkit import Canvas, ramp, xf, block

def zigzag(a, b, n=5, amp=1.5):
    """Points along a→b with alternating sideways offsets (cracks, lightning)."""
    (x0, y0), (x1, y1) = a, b
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    pts = []
    for i in range(n + 1):
        t = i / n
        o = 0 if i in (0, n) else (amp if i % 2 else -amp)
        pts.append((x0 + dx * t + nx * o, y0 + dy * t + ny * o))
    return pts

# ═══ SAND WRAITH (Sunfall Dunes) ═════════════════════════════════════════════
ROBE = ramp((200, 168, 107), light=(226, 198, 140), shadow=(150, 120, 72))
ROBE_D = ramp((184, 148, 88), light=(210, 176, 120), shadow=(130, 100, 58))
SAND = ramp((214, 184, 126), light=(238, 214, 160), shadow=(170, 138, 86))
BONEC = ramp((239, 230, 208), light=(255, 250, 236), shadow=(190, 178, 150))
HOOD_IN = ((30, 24, 14), (42, 36, 22), (56, 48, 30))
GOLD, GOLD_HOT = (255, 204, 68), (255, 238, 153)
WR_W, WR_H = 84, 84

def _wraith(c, T, *, arms='low', eyes=GOLD, torn=False):
    P = lambda pts: [T(x, y) for x, y in pts]
    # sand whirlwind instead of legs
    for (x, y, rx, ry) in [(42, 78, 15, 4.5), (42, 72, 12, 4), (43, 66, 10, 3.5)]:
        c.ellipse(*T(x, y), rx, ry, SAND)
    # back arm
    if arms == 'low':
        c.poly(P([(30, 30), (24, 44), (16, 56), (12, 62), (20, 58), (28, 48), (34, 36)]), ROBE_D)
    else:
        c.poly(P([(30, 30), (20, 22), (8, 12), (4, 6), (12, 14), (24, 28), (34, 36)]), ROBE_D)
    # robe with a tattered hem
    hem = [(24, 64), (27, 70), (30, 64), (34, 72), (38, 65), (42, 73), (46, 65), (50, 71), (54, 64), (58, 69), (60, 63)]
    robe = [(42, 10), (54, 22), (58, 40), (61, 63)] + hem[::-1] + [(24, 64), (27, 40), (30, 22)]
    if torn:
        robe = [(42, 10), (54, 22), (58, 40), (52, 46), (60, 50), (61, 63)] + hem[::-1] + [(24, 64), (27, 40), (30, 22)]
    c.poly(P(robe), ROBE)
    # open robe showing the ribcage core
    c.poly(P([(37, 28), (47, 28), (49, 54), (35, 54)]), HOOD_IN, shade=False)
    c.poly(P([(39, 30), (45, 30), (46, 50), (38, 50)]), BONEC)
    c.seams()
    for y in (34, 39, 44):
        c.line(P([(38.5, y), (45.5, y)]), 0.8, ((150, 136, 110),) * 3, shade=False)
    c.line(P([(42, 31), (42, 50)]), 0.9, ((170, 156, 128),) * 3, shade=False)
    # hood and the dark face inside it
    c.poly(P([(42, 4), (52, 10), (55, 22), (50, 28), (34, 28), (30, 20), (33, 10)]), ROBE)
    c.ellipse(*T(44, 19), 7.5, 7, HOOD_IN, shade=False)
    c.seams()
    for e in ((41.5, 18.5), (47.5, 18.5)):
        block(c, T(*e), eyes, 3)
    c.pixels(P([(42, 18), (48, 18)]), GOLD_HOT if eyes == GOLD else eyes)
    # front arm trailing sand
    if arms == 'low':
        c.poly(P([(52, 28), (60, 40), (68, 52), (74, 58), (66, 56), (58, 46), (50, 36)]), ROBE_D)
        for x, y in [(76, 61), (78, 64), (73, 63), (80, 60)]:
            c.pixels([T(x, y)], SAND[1])
    else:
        c.poly(P([(52, 28), (62, 20), (74, 10), (80, 4), (72, 14), (62, 28), (54, 36)]), ROBE_D)
    # drifting sand grains
    for x, y in [(14, 40), (70, 30), (20, 70), (66, 74), (10, 52), (76, 46), (30, 80), (58, 80)]:
        c.pixels([T(x, y)], SAND[2])

def wraith_ready():
    c = Canvas(WR_W, WR_H); _wraith(c, xf(pivot=(42, 80))); return c

def wraith_attack():
    c = Canvas(WR_W, WR_H)
    _wraith(c, xf(pivot=(42, 80)), arms='high', eyes=GOLD_HOT)
    # a ring of sandstorm swirls around it
    for i in range(14):
        a = i / 14 * math.tau
        c.ellipse(42 + math.cos(a) * 37, 44 + math.sin(a) * 34, 2.4, 1.6, SAND)
    return c

def wraith_hurt():
    c = Canvas(WR_W, WR_H); _wraith(c, xf(-9, pivot=(42, 80), dx=-3), torn=True, eyes=(200, 150, 40)); return c

def wraith_death():
    c = Canvas(WR_W, WR_H)
    c.ellipse(42, 80, 26, 8, SAND)                                   # sand pile
    c.poly([(22, 80), (30, 70), (42, 66), (56, 70), (64, 80), (56, 77), (48, 79), (40, 76), (32, 79)], ROBE)  # empty robe on top
    c.poly([(48, 70), (56, 64), (62, 70), (58, 74), (50, 74)], ROBE)  # slumped hood
    c.ellipse(55, 70, 3.5, 2.5, HOOD_IN, shade=False)
    c.seams()
    c.pixels([(54, 70), (57, 70)], (120, 90, 30))                    # eyes fading out
    return c

# ═══ LAVA PUMPKIN (Ember Fields) ═════════════════════════════════════════════
ROCK = ramp((51, 51, 51), light=(80, 80, 80), shadow=(28, 28, 28))
ROCK_D = ramp((40, 40, 40), light=(64, 64, 64), shadow=(22, 22, 22))
LAVA, LAVA_HOT, LAVA_CORE = (255, 102, 0), (255, 170, 30), (255, 220, 90)
COOL = (90, 40, 20)
MOSS = ((50, 100, 50), (74, 138, 74), (100, 170, 100))
LP_W, LP_H = 96, 92

def _pumpkin(c, T, *, mouth='grin', glow=LAVA, cracks=1.0):
    P = lambda pts: [T(x, y) for x, y in pts]
    # claw arms behind the shell
    c.poly(P([(14, 46), (4, 52), (2, 70), (10, 78), (16, 66)]), ROCK_D)
    c.poly(P([(82, 46), (92, 52), (94, 70), (86, 78), (80, 66)]), ROCK_D)
    for cx, cy in [(3, 80), (8, 82), (13, 81), (88, 81), (93, 79), (84, 82)]:
        c.poly(P([(cx - 1.5, cy - 3), (cx + 1.5, cy - 3), (cx, cy + 1)]), ((16, 16, 16), (24, 24, 24), (40, 40, 40)))
    # ribbed shell
    for (x, rx) in [(30, 20), (66, 20), (48, 24)]:
        c.ellipse(*T(x, 58), rx, 32, ROCK)
    # stem with a smoking ember
    c.poly(P([(45, 22), (51, 22), (53, 14), (49, 10), (46, 14)]), ((60, 44, 30), (84, 62, 40), (110, 84, 56)))
    c.seams()
    c.pixels(P([(49, 9), (50, 8)]), LAVA_HOT)
    # lava cracks
    for a, b in [((22, 40), (16, 70)), ((76, 40), (82, 66)), ((36, 82), (44, 74)), ((60, 82), (54, 72)), ((30, 34), (38, 30))][: int(3 + 2 * cracks)]:
        c.line(P(zigzag(a, b, 4, 1.4)), 1.1, (glow,) * 3, shade=False)
    if cracks > 1:
        for a, b in [((40, 36), (34, 48)), ((62, 34), (70, 46)), ((24, 76), (32, 66))]:
            c.line(P(zigzag(a, b, 4, 1.2)), 1.0, (glow,) * 3, shade=False)
    # moss patches
    for x, y, r in [(26, 52, 2.5), (72, 70, 2.2), (58, 40, 1.8)]:
        c.ellipse(*T(x, y), r, r * 0.7, MOSS, shade=False)
    # carved face: triangle eyes and a jagged grin, glowing
    for ex in (36, 60):
        c.poly(P([(ex - 6, 54), (ex + 6, 54), (ex, 44)]), (glow,) * 3, shade=False)
        c.poly(P([(ex - 2.5, 52.5), (ex + 2.5, 52.5), (ex, 48)]), (LAVA_CORE,) * 3, shade=False)
    if mouth == 'grin':
        grin = [(30, 64), (34, 68), (38, 64), (42, 69), (46, 64), (50, 69), (54, 64), (58, 69), (62, 64), (66, 68), (66, 72), (58, 76), (38, 76), (30, 72)]
    else:  # gaping
        grin = [(28, 62), (34, 66), (40, 62), (48, 66), (56, 62), (62, 66), (68, 62), (68, 76), (60, 84), (36, 84), (28, 76)]
    c.poly(P(grin), (glow,) * 3, shade=False)
    c.poly(P([(36, 70), (60, 70), (56, 74 if mouth == 'grin' else 80), (40, 74 if mouth == 'grin' else 80)]), (LAVA_CORE,) * 3, shade=False)

def pumpkin_ready():
    c = Canvas(LP_W, LP_H); _pumpkin(c, xf(pivot=(48, 90))); return c

def pumpkin_attack():
    c = Canvas(LP_W, LP_H)
    _pumpkin(c, xf(pivot=(48, 90), dy=-1), mouth='gape', glow=LAVA_HOT)
    for i in range(10):
        a = i / 10 * math.tau
        c.ellipse(48 + math.cos(a) * 44, 54 + math.sin(a) * 36, 2.6, 2.6, ramp(LAVA, light=LAVA_CORE, shadow=(180, 50, 0)))
    return c

def pumpkin_hurt():
    c = Canvas(LP_W, LP_H); _pumpkin(c, xf(-8, pivot=(48, 90), dx=-2), glow=(200, 70, 0), cracks=2.0); return c

def pumpkin_death():
    c = Canvas(LP_W, LP_H)
    # split in two halves, lava cooled to dark red-black
    _pumpkin(c, xf(-9, pivot=(30, 90), dx=-3, dy=4), glow=COOL)
    right = Canvas(LP_W, LP_H)
    _pumpkin(right, xf(9, pivot=(66, 90), dx=3, dy=4), glow=COOL)
    # keep only the left half of the first and the right half of the second
    import numpy as np
    keep_left = np.zeros_like(c.alpha); keep_left[:, :44] = True
    keep_right = np.zeros_like(c.alpha); keep_right[:, 52:] = True
    c.alpha &= keep_left
    c.rgb[keep_right & right.alpha] = right.rgb[keep_right & right.alpha]
    c.alpha |= keep_right & right.alpha
    for x, y, r in [(48, 40, 3), (45, 32, 4), (50, 24, 3)]:
        c.ellipse(x, y, r, r, ((90, 84, 80), (120, 112, 108), (160, 152, 148)))
    return c

# ═══ SWAMP HYDRA (Ashwater Marsh) ════════════════════════════════════════════
SCALE = ramp((38, 74, 38), light=(45, 106, 45), shadow=(22, 46, 22))
BELLY = ramp((120, 140, 80), light=(160, 178, 110), shadow=(84, 100, 56))
MOSS_D = ((20, 40, 20), (34, 64, 30), (52, 90, 44))
RED_EYE, FANG, POISON = (230, 57, 70), (240, 236, 220), ramp((138, 226, 52), light=(204, 255, 68), shadow=(80, 150, 30))
HY_W, HY_H = 92, 86

def _hydra_head(c, x, y, ang, size=1.0, *, mouth='closed', eye=RED_EYE):
    T = xf(ang, pivot=(x, y), sx=size, sy=size)
    P = lambda pts: [T(px, py) for px, py in pts]
    c.ellipse(*T(x, y), 6.5 * size, 5.5 * size, SCALE)
    if mouth == 'open':
        c.poly(P([(x + 3, y - 3), (x + 15, y - 6), (x + 14, y - 1), (x + 4, y + 0.5)]), SCALE)   # upper jaw
        c.poly(P([(x + 3, y + 2), (x + 13, y + 7), (x + 11, y + 9), (x + 2, y + 5)]), SCALE)     # lower jaw
        c.pixels(P([(x + 8, y - 1.5), (x + 11, y - 2.5), (x + 8, y + 4.5)]), FANG)
    else:
        c.poly(P([(x + 2, y - 3.5), (x + 14, y - 1.5), (x + 14, y + 2.5), (x + 2, y + 4)]), SCALE)
        c.pixels(P([(x + 10, y + 3), (x + 12, y + 3)]), FANG)
    c.poly(P([(x - 2, y - 5), (x - 7, y - 10), (x + 1, y - 6)]), SCALE)   # frill horn
    block(c, T(x + 2.5, y - 1.5), eye, 2)

def _ring(cx, cy, rx, ry, n=28):
    return [(cx + math.cos(i / n * math.tau) * rx, cy + math.sin(i / n * math.tau) * ry) for i in range(n + 1)]

def _curve(p0, p1, p2, p3, n=10):
    """Cubic Bézier through four points, as a polyline."""
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        out.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    return out

def _hydra(c, *, heads, mouths=('closed',) * 3, eyes=(RED_EYE,) * 3, coil_dy=0):
    # coiled body: three stacked loops, each a thick ring of scales
    for (cx, cy, rx, ry) in [(44, 78, 34, 7.5), (42, 71, 28, 7), (46, 64, 20, 6.5)]:
        c.line(_ring(cx, cy + coil_dy, rx, ry), 8, SCALE)
    for x in (16, 30, 62, 74):                                            # moss tufts
        c.ellipse(x, 68 + coil_dy, 3.5, 2, MOSS_D, shade=False)
    # necks (back to front), thick S-curves, then heads
    for (nx, ny), (hx, hy), size, ang, m, e in heads:
        path = _curve((nx, ny + coil_dy), (nx - 8, ny - 14 + coil_dy), (hx - 8, hy + 16), (hx, hy))
        c.line(path, 9 * size, SCALE)
        c.line([(x + 2.2 * size, y + 1) for x, y in path[1:-2]], 2.4 * size, BELLY, shade=False)
        _hydra_head(c, hx, hy, ang, size * 1.15, mouth=m, eye=e)
    c.seams()
    for x, y in [(30, 74), (52, 78), (64, 70), (24, 68), (40, 66)]:
        c.pixels([(x, y + coil_dy), (x + 1, y + coil_dy)], SCALE[2])      # scale glints

def hydra_ready():
    c = Canvas(HY_W, HY_H)
    _hydra(c, heads=[((30, 62), (16, 30), 0.85, 0, 'closed', RED_EYE),
                     ((58, 62), (66, 32), 0.85, 0, 'closed', RED_EYE),
                     ((44, 60), (42, 16), 1.0, 0, 'closed', RED_EYE)])
    c.pixels([(56, 22), (56, 24)], POISON[1])                             # drip
    return c

def hydra_attack():
    c = Canvas(HY_W, HY_H)
    _hydra(c, heads=[((30, 62), (26, 34), 0.85, 18, 'open', RED_EYE),
                     ((58, 62), (72, 40), 0.85, 18, 'open', RED_EYE),
                     ((44, 60), (52, 22), 1.0, 18, 'open', RED_EYE)])
    for x, y in [(86, 30), (88, 44), (84, 54)]:
        c.ellipse(x, y, 2.6, 2.2, POISON)
    return c

def hydra_hurt():
    c = Canvas(HY_W, HY_H)
    _hydra(c, heads=[((30, 62), (10, 36), 0.85, -25, 'closed', (120, 30, 36)),
                     ((58, 62), (70, 22), 0.85, -30, 'open', RED_EYE),
                     ((44, 60), (36, 14), 1.0, -15, 'closed', (120, 30, 36))])
    return c

def hydra_death():
    c = Canvas(HY_W, HY_H)
    _hydra(c, heads=[((30, 66), (8, 76), 0.85, 10, 'closed', (60, 20, 24)),
                     ((58, 66), (82, 76), 0.85, 0, 'open', (60, 20, 24)),
                     ((44, 64), (52, 80), 1.0, 5, 'closed', (60, 20, 24))], coil_dy=4)
    return c

# ═══ FIRE DEMON (Obsidian Peak) ══════════════════════════════════════════════
FD_W, FD_H = 92, 92
WING_D = ramp((40, 10, 6), light=(85, 0, 0), shadow=(20, 6, 0))
DLEG = ramp((30, 12, 40), light=(52, 26, 64), shadow=(16, 6, 24))
HORN_D = ramp((22, 8, 48), light=(46, 22, 80), shadow=(12, 4, 28))
FLAMES = [((120, 0, 0), (170, 0, 0), (210, 20, 0)), ((200, 30, 0), (221, 34, 0), (240, 70, 10)),
          ((240, 60, 0), (255, 68, 0), (255, 110, 20)), ((255, 120, 0), (255, 136, 0), (255, 170, 40)), ((255, 190, 0), (255, 204, 0), (255, 236, 120))]
MAGENTA_EYE = (255, 102, 255)

def _flame_body(c, T, cx, top, bottom, half, layers):
    """Nested flame shapes: a tapering body whose top and sides break into tongues."""
    for i, cols in enumerate(layers):
        f = 1 - i / (len(layers) + 0.4)
        w = half * f
        t = top + i * 5
        b = bottom - i * 3
        pts = [(cx - w * 0.8, b), (cx - w, b - (b - t) * 0.35), (cx - w * 1.15, t + 6), (cx - w * 0.7, t + 10),
               (cx - w * 0.55, t - 2), (cx - w * 0.25, t + 7), (cx, t - 6), (cx + w * 0.25, t + 7),
               (cx + w * 0.55, t - 2), (cx + w * 0.7, t + 10), (cx + w * 1.15, t + 6), (cx + w, b - (b - t) * 0.35), (cx + w * 0.8, b)]
        c.poly([T(x, y) for x, y in pts], cols, shade=(i == 0))

def _demon(c, T, *, wings=1.0, flames=FLAMES, eye=MAGENTA_EYE, arms='low'):
    P = lambda pts: [T(x, y) for x, y in pts]
    sp = wings
    # wings behind
    c.poly(P([(36, 34), (24 - 14 * sp, 10 - 8 * sp), (16 - 12 * sp, 22), (12 - 8 * sp, 40 + 4 * sp), (22, 36), (24, 50)]), WING_D)
    c.poly(P([(56, 34), (68 + 14 * sp, 10 - 8 * sp), (76 + 12 * sp, 22), (80 + 8 * sp, 40 + 4 * sp), (70, 36), (68, 50)]), WING_D)
    for a, b in [((36, 34), (24 - 14 * sp, 10 - 8 * sp)), ((56, 34), (68 + 14 * sp, 10 - 8 * sp))]:
        c.line(P([a, b]), 1.4, ((20, 4, 0),) * 3, shade=False)
    # legs
    c.poly(P([(36, 70), (44, 70), (43, 90), (34, 90)]), DLEG)
    c.poly(P([(50, 70), (58, 70), (59, 90), (50, 90)]), DLEG)
    # flame body
    _flame_body(c, T, 46, 26, 74, 18, flames)
    # arms of fire
    if arms == 'low':
        c.line(P([(30, 40), (24, 54), (26, 64)]), 5, flames[1])
        c.line(P([(62, 40), (70, 52), (68, 62)]), 5, flames[1])
    else:
        c.line(P([(30, 40), (18, 30), (8, 22)]), 5, flames[1])
        c.line(P([(62, 40), (76, 30), (86, 22)]), 5, flames[1])
    # head: shadowed face in the flames, horned crown
    c.ellipse(*T(47, 24), 9, 8.5, flames[0])
    c.ellipse(*T(48, 25), 6.5, 5.5, ((34, 0, 0),) * 3, shade=False)
    for pts in ([(38, 18), (32, 4), (42, 15)], [(56, 18), (62, 4), (52, 15)], [(45, 15), (48, 2), (51, 15)]):
        c.poly(P(pts), HORN_D)
    c.seams()
    for e in ((45, 24.5), (51.5, 24.5)):
        block(c, T(*e), eye, 3)
    c.pixels(P([(46, 24), (52.5, 24)]), (255, 230, 255) if eye == MAGENTA_EYE else eye)
    for x, y in [(30, 14), (64, 18), (40, 6), (70, 30), (22, 48)]:             # embers
        c.pixels([T(x, y)], (255, 170, 40))

def demon_ready():
    c = Canvas(FD_W, FD_H); _demon(c, xf(pivot=(46, 90))); return c

def demon_attack():
    c = Canvas(FD_W, FD_H)
    _demon(c, xf(pivot=(46, 90)), wings=1.35, arms='high')
    for i in range(12):
        a = i / 12 * math.tau
        c.ellipse(46 + math.cos(a) * 42, 48 + math.sin(a) * 40, 2.4, 2.4, FLAMES[3])
    return c

def demon_hurt():
    dim = [tuple(tuple(int(v * 0.75) for v in col) for col in cols) for cols in FLAMES[:3]]
    c = Canvas(FD_W, FD_H); _demon(c, xf(-8, pivot=(46, 90), dx=-3), wings=0.6, flames=dim, eye=(170, 60, 170)); return c

def demon_death():
    ash = [((60, 50, 50), (80, 70, 68), (104, 92, 88)), ((90, 30, 10), (110, 40, 14), (140, 60, 24)), ((150, 60, 10), (170, 76, 14), (200, 100, 30))]
    c = Canvas(FD_W, FD_H); _demon(c, xf(10, pivot=(46, 90), dy=10), wings=0.3, flames=ash, eye=(70, 30, 70))
    return c

# ═══ GLACIER WYRM (Frostveil Glacier) ════════════════════════════════════════
ICE_S = ramp((60, 127, 174), light=(95, 168, 211), shadow=(36, 84, 120))
ICE_B = ramp((200, 226, 240), light=(236, 248, 255), shadow=(150, 186, 210))
CRYST = ramp((182, 224, 245), light=(240, 250, 255), shadow=(110, 170, 210))
CYAN = (95, 211, 255)
GW_W, GW_H = 92, 90

def _wyrm(c, T, *, jaw=0.0, eye=CYAN, broken=False, cracks=False, slump=0.0):
    P = lambda pts: [T(x, y) for x, y in pts]
    # `slump` (0..1) lowers the neck so the head comes to rest across the coils.
    hdy, hdx = 38 * slump, 2 * slump
    H = lambda pts: [T(x + hdx, y + hdy) for x, y in pts]
    # coiled body: stacked loops of scaly ice
    for (cx, cy, rx, ry) in [(42, 80, 34, 6.5), (44, 73, 27, 6), (48, 67, 18, 5)]:
        c.line([T(x, y) for x, y in _ring(cx, cy, rx, ry)], 9, ICE_S)
    for (x, y) in [(20, 80), (34, 86), (56, 86), (70, 79), (28, 73), (62, 72)]:
        c.pixels([T(x, y), T(x + 1, y)], ICE_B[2])
    # neck rising from the coil
    neck = [(50, 66), (56, 52 + hdy * 0.4), (58 + hdx, 38 + hdy * 0.75), (62 + hdx, 28 + hdy)]
    c.line(P(neck), 11, ICE_S)
    c.line(P([(x + 3, y) for x, y in neck]), 4, ICE_B, shade=False)
    if slump < 0.5:
        for (x, y) in [(46, 58), (48, 46), (52, 36)]:                          # spine spikes
            c.poly(P([(x, y), (x - 6, y - 3), (x + 1, y - 5)]), CRYST)
    # head (facing right)
    c.ellipse(*T(64 + hdx, 24 + hdy), 10, 8, ICE_S)
    c.poly(H([(68, 18), (86, 21), (87, 26), (70, 28)]), ICE_S)                  # snout / upper jaw
    c.poly(H([(68, 28), (84, 28 + jaw), (82, 32 + jaw * 1.2), (66, 32)]), ICE_S)  # lower jaw
    if jaw > 0:
        c.poly(H([(70, 27.5), (84, 27.5 + jaw * 0.5), (70, 30)]), ((30, 20, 40),) * 3, shade=False)
    # crystal crest
    crest = [[(58, 18), (52, 2), (62, 14)], [(62, 16), (62, 0), (67, 14)], [(66, 16), (74, 2), (70, 17)]]
    if broken:
        crest = crest[:2] + [[(66, 16), (69, 10), (70, 17)]]
    for pts in crest:
        c.poly(H(pts), CRYST)
    c.seams()
    c.pixels(H([(80, 27.5), (77, 27.5), (82, 28 + jaw)]), (245, 250, 255))      # fangs
    block(c, T(70 + hdx, 21 + hdy), eye, 3)
    if cracks:
        for a, b in [((22, 74), (34, 80)), ((52, 68), (60, 74)), ((56, 46), (62, 52))]:
            c.line(P(zigzag(a, b, 4, 1.2)), 0.8, ((235, 248, 255),) * 3, shade=False)
    if slump < 0.5:
        for x, y in [(89, 20), (91, 23), (88, 17)]:                             # frost breath
            c.pixels([T(x, y)], (220, 240, 252))

def wyrm_ready():
    c = Canvas(GW_W, GW_H); _wyrm(c, xf(pivot=(46, 88))); return c

def wyrm_attack():
    c = Canvas(GW_W, GW_H)
    _wyrm(c, xf(-10, pivot=(46, 88), dx=-4), jaw=7)
    for i, (x, y) in enumerate([(84, 36), (88, 46), (80, 52), (90, 30), (76, 44)]):
        s = 2.2 - i * 0.2
        c.poly([(x, y - s * 1.6), (x + s, y), (x, y + s * 1.6), (x - s, y)], CRYST)
    return c

def wyrm_hurt():
    c = Canvas(GW_W, GW_H); _wyrm(c, xf(-14, pivot=(46, 88), dx=-6), broken=True, eye=(60, 140, 180)); return c

def wyrm_death():
    c = Canvas(GW_W, GW_H)
    _wyrm(c, xf(pivot=(46, 88)), eye=(40, 70, 90), cracks=True, slump=1.0, broken=True)
    return c

# ═══ THUNDER COLOSSUS (Stormspire Ruins) ═════════════════════════════════════
TSTONE = ramp((58, 63, 78), light=(86, 93, 115), shadow=(34, 37, 47))
TSTONE_D = ramp((48, 52, 63), light=(70, 76, 92), shadow=(28, 30, 38))
BOLT, BOLT_HOT, YEL = (63, 169, 245), (189, 230, 255), (255, 228, 92)
CLOUD = ((90, 96, 120), (120, 126, 150), (160, 166, 188))
TC_W, TC_H = 96, 96

def _colossus(c, T, *, arms='low', vein=BOLT, eye=YEL, cracked=False):
    P = lambda pts: [T(x, y) for x, y in pts]
    c.ellipse(*T(48, 50), 44, 44, ((40, 70, 110),) * 3, shade=False) if False else None
    # legs
    c.poly(P([(30, 70), (44, 70), (44, 94), (28, 94)]), TSTONE_D)
    c.poly(P([(52, 70), (66, 70), (68, 94), (52, 94)]), TSTONE_D)
    # back arm
    if arms == 'low':
        c.poly(P([(16, 30), (26, 30), (24, 62), (14, 62)]), TSTONE_D)
        c.poly(P([(10, 60), (26, 60), (26, 74), (10, 74)]), TSTONE)
    else:
        c.poly(P([(18, 32), (26, 26), (18, 6), (10, 10)]), TSTONE_D)
        c.poly(P([(4, 0), (20, 0), (20, 12), (4, 12)]), TSTONE)
    # torso
    c.poly(P([(20, 24), (76, 24), (70, 74), (26, 74)]), TSTONE)
    c.poly(P([(28, 30), (48, 30), (46, 46), (28, 46)]), TSTONE_D, shade=False)
    c.poly(P([(50, 50), (66, 50), (64, 66), (50, 66)]), TSTONE_D, shade=False)
    # head with spiked crown
    c.poly(P([(36, 6), (60, 6), (62, 26), (34, 26)]), TSTONE)
    for x in (36, 44, 52, 60):
        c.poly(P([(x - 3, 7), (x, -3 if x in (44, 52) else 0), (x + 3, 7)]), TSTONE_D)
    # front arm
    if arms == 'low':
        c.poly(P([(70, 30), (80, 30), (82, 62), (72, 62)]), TSTONE_D)
        c.poly(P([(70, 60), (88, 60), (88, 74), (70, 74)]), TSTONE)
    else:
        c.poly(P([(70, 32), (78, 26), (86, 6), (78, 4)]), TSTONE_D)
        c.poly(P([(76, 0), (92, 0), (92, 12), (76, 12)]), TSTONE)
    c.seams()
    # lightning veins
    for a, b in [((48, 28), (48, 70)), ((30, 50), (66, 50)), ((22, 34), (20, 58)), ((76, 34), (78, 58))]:
        c.line(P(zigzag(a, b, 6, 1.6)), 1.6, (vein,) * 3, shade=False)
        c.line(P(zigzag(a, b, 6, 1.6)), 0.6, ((BOLT_HOT if vein == BOLT else vein),) * 3, shade=False)
    if cracked:
        c.line(P(zigzag((40, 30), (56, 60), 6, 2.5)), 1.2, ((16, 18, 24),) * 3, shade=False)
    for e in ((43, 16), (54, 16)):
        block(c, T(*e), eye, 3)
    c.pixels(P([(44, 15.5), (55, 15.5)]), (255, 255, 255) if eye == YEL else eye)
    # storm clouds on the shoulders
    for x, y, r in [(18, 26, 5), (12, 22, 4), (78, 26, 5), (84, 22, 4)]:
        c.ellipse(*T(x, y), r, r * 0.75, CLOUD)

def colossus_ready():
    c = Canvas(TC_W, TC_H); _colossus(c, xf(pivot=(48, 94)))
    for x, y in [(8, 76), (90, 76), (6, 70), (92, 70)]:
        c.pixels([(x, y), (x + 1, y + 1)], YEL)
    return c

def colossus_attack():
    c = Canvas(TC_W, TC_H)
    _colossus(c, xf(pivot=(48, 94)), arms='high', vein=BOLT_HOT)
    c.line(zigzag((14, 6), (82, 6), 8, 3), 1.6, ((YEL,) * 3), shade=False)            # arc between fists
    for a in (0.3, 1.2, 2.0, 2.9):
        c.line(zigzag((48, 8), (48 + math.cos(a) * 44, 8 + math.sin(a) * 44), 4, 2), 1.0, ((BOLT_HOT,) * 3), shade=False)
    return c

def colossus_hurt():
    c = Canvas(TC_W, TC_H); _colossus(c, xf(-7, pivot=(48, 94), dx=-3), vein=(40, 100, 150), cracked=True, eye=(200, 170, 60)); return c

def colossus_death():
    c = Canvas(TC_W, TC_H)
    blocks = [[(6, 82), (26, 80), (28, 95), (4, 95)], [(24, 76), (46, 74), (48, 95), (24, 95)], [(46, 78), (66, 76), (68, 95), (46, 95)],
              [(66, 82), (88, 84), (90, 95), (66, 95)], [(16, 66), (34, 64), (36, 78), (16, 79)], [(34, 60), (56, 58), (58, 75), (36, 76)],
              [(56, 66), (74, 66), (74, 80), (56, 79)]]
    for b in blocks:
        c.poly(b, TSTONE)
    c.poly([(38, 46), (58, 46), (58, 60), (38, 60)], TSTONE)                   # head on top of the rubble
    for x in (40, 48, 56):
        c.poly([(x - 3, 47), (x, 39), (x + 3, 47)], TSTONE_D)
    c.seams()
    c.pixels([(44, 53), (45, 53), (51, 53), (52, 53)], (90, 80, 40))           # eyes gone dark
    c.line(zigzag((30, 70), (64, 72), 6, 1.4), 0.8, (((40, 70, 100),) * 3), shade=False)
    return c
