"""Minions drawn in code: Poison Slime, Obsidian Golem, Frost Wisp, Storm Sentinel.
Each has ready / attack / hurt / death, facing right, feet on the bottom row."""
from pixelkit import Canvas, ramp, xf, block

WHITE = (250, 248, 240)

# ═══ POISON SLIME (Ashwater Marsh) ═══════════════════════════════════════════
SLIME = ramp((122, 82, 160), light=(160, 118, 200), shadow=(84, 54, 112))
SLIME_IN = ((96, 64, 130), (110, 74, 146), (136, 100, 178))
ACID = ramp((138, 226, 52), light=(204, 255, 68), shadow=(80, 150, 30))
SLIME_W, SLIME_H = 38, 30

def _slime_body(c, cx, base, rx, ry, lean=0.0):
    # A dome: the ellipse's lower part runs off the bottom row, which flattens its base.
    c.ellipse(cx + lean, base - ry * 0.8, rx, ry, SLIME)
    # inner bubbles + glossy highlight
    for bx, by, r in [(cx - rx * 0.4, base - ry * 0.8, 1.2), (cx + rx * 0.1, base - ry * 0.45, 0.9), (cx - rx * 0.1, base - ry * 1.3, 0.8)]:
        c.ellipse(bx + lean, by, r, r, SLIME_IN, shade=False)
    c.pixels([(cx - rx * 0.55 + lean, base - ry * 1.55), (cx - rx * 0.45 + lean, base - ry * 1.7), (cx - rx * 0.35 + lean, base - ry * 1.75)], (210, 190, 235))

def slime_ready(squash=0.0):
    c = Canvas(SLIME_W, SLIME_H)
    rx, ry = 12 + squash, 8.5 - squash * 0.7
    _slime_body(c, 18, 29, rx, ry)
    for ax, ay, r in [(14, 29 - ry * 1.75, 1.6), (20, 29 - ry * 1.9, 1.2), (24, 29 - ry * 1.6, 1.1)]:
        c.ellipse(ax, ay, r, r * 0.8, ACID)
    c.seams()
    top = 29 - ry * 1.25
    block(c, (21.5, top), (20, 10, 30)); block(c, (25.5, top), (20, 10, 30))
    c.pixels([(21, top - 1), (25, top - 1)], WHITE)
    c.pixels([(22, top + 3), (23, top + 3.5), (24, top + 3.5), (25, top + 3)], (50, 20, 60))
    c.pixels([(24, top + 4.5)], ACID[2])                      # drip
    return c

def slime_attack():
    c = Canvas(SLIME_W, SLIME_H)
    _slime_body(c, 17, 29, 9, 11, lean=2.5)
    c.ellipse(17, 29 - 11 * 1.95, 1.5, 1.2, ACID)
    c.seams()
    top = 29 - 11 * 1.35
    block(c, (21, top), (20, 10, 30)); block(c, (25, top), (20, 10, 30))
    c.ellipse(24.5, top + 4.5, 2.2, 1.8, ((40, 10, 40),) * 3, shade=False)  # open mouth
    c.ellipse(32, top + 3, 3.2, 2.6, ACID)                                     # acid glob
    c.pixels([(31, top + 2), (32, top + 2)], (230, 255, 160))
    c.pixels([(28, top + 4.5), (27, top + 5.5)], ACID[1])
    return c

def slime_hurt():
    c = Canvas(SLIME_W, SLIME_H)
    _slime_body(c, 17, 29, 14.5, 4.8)
    c.ellipse(4, 27, 1.6, 1.2, SLIME); c.ellipse(31, 26, 1.3, 1.1, SLIME)   # splats
    c.seams()
    top = 29 - 4.8 * 1.3
    c.pixels([(19, top), (20, top - 1), (21, top), (23, top), (24, top - 1), (25, top)], (20, 10, 30))  # squeezed eyes
    return c

def slime_death():
    c = Canvas(SLIME_W, SLIME_H)
    c.ellipse(18, 27.5, 16, 2.6, SLIME)
    for bx in (11, 18, 25):
        c.ellipse(bx, 25.5, 1.2, 1.0, SLIME_IN, shade=False)
    c.ellipse(22, 27, 3, 1.2, ACID)
    return c

# ═══ OBSIDIAN GOLEM (Obsidian Peak) ══════════════════════════════════════════
STONE = ramp((32, 32, 46), light=(58, 58, 82), shadow=(16, 16, 24))
STONE2 = ramp((42, 42, 60), light=(70, 70, 98), shadow=(22, 22, 32))
RUNE, RUNE_HOT = (68, 102, 204), (136, 170, 255)
GOLEM_W, GOLEM_H = 46, 42

def _golem(c, T, *, punch=0.0, rune=RUNE, eyes=RUNE_HOT, chipped=False):
    P = lambda pts: [T(x, y) for x, y in pts]
    # back arm + fist
    c.poly(P([(12, 15), (16, 15), (15, 29), (11, 29)]), STONE)
    c.poly(P([(9, 28), (16, 28), (16, 34), (9, 34)]), STONE2)
    # legs
    c.poly(P([(15, 31), (21, 31), (21, 40), (14, 40)]), STONE)
    c.poly(P([(24, 31), (30, 31), (31, 40), (24, 40)]), STONE)
    # torso slab (wider at the shoulders)
    c.poly(P([(13, 13), (33, 13), (31, 32), (15, 32)]), STONE2)
    c.poly(P([(16, 15), (22, 15), (21, 21), (16, 21)]), STONE, shade=False)   # facet
    c.poly(P([(24, 22), (30, 22), (29, 28), (24, 28)]), STONE, shade=False)
    # head (square, set forward)
    c.poly(P([(19, 4), (29, 4), (30, 13), (19, 13)]), STONE2)
    # shoulder blocks
    if not chipped:
        c.poly(P([(10, 11), (17, 11), (17, 17), (10, 17)]), STONE)
    c.poly(P([(29, 11), (36, 11), (36, 17), (29, 17)]), STONE)
    # front arm: hangs, or punches forward
    if punch <= 0:
        c.poly(P([(31, 16), (35, 16), (36, 29), (32, 29)]), STONE)
        c.poly(P([(30, 28), (38, 28), (38, 35), (30, 35)]), STONE2)
    else:
        c.poly(P([(32, 15), (36, 15), (36 + punch, 20), (32 + punch, 21)]), STONE)
        c.poly(P([(34 + punch, 15), (42 + punch * 0.4, 15), (42 + punch * 0.4, 23), (34 + punch, 23)]), STONE2)
    c.seams()
    # runes: a cross on the chest and lines down the arms
    for a, b in [((23, 15), (23, 30)), ((17, 22), (29, 22)), ((13, 19), (13, 27))]:
        c.line(P([a, b]), 0.8, (rune,) * 3, shade=False)
    c.pixels(P([(23, 22), (22, 22), (24, 22), (23, 21), (23, 23)]), RUNE_HOT if rune == RUNE_HOT else rune)
    for e in ((23, 8.5), (27.5, 8.5)):
        block(c, T(*e), eyes)

def golem_ready():
    c = Canvas(GOLEM_W, GOLEM_H); _golem(c, xf(pivot=(23, 40), dy=1)); return c

def golem_attack():
    c = Canvas(GOLEM_W, GOLEM_H); _golem(c, xf(8, pivot=(23, 40), dy=1), punch=5, rune=RUNE_HOT); return c

def golem_hurt():
    c = Canvas(GOLEM_W, GOLEM_H)
    _golem(c, xf(-10, pivot=(23, 40), dx=-1, dy=1), chipped=True, eyes=RUNE)
    c.poly([(5, 8), (9, 7), (9, 11), (5, 11)], STONE)       # broken shoulder chunk flying off
    return c

def golem_death():
    c = Canvas(GOLEM_W, GOLEM_H)
    for pts in [[(6, 33), (16, 32), (17, 41), (5, 41)], [(15, 30), (28, 29), (29, 41), (15, 41)], [(27, 33), (38, 34), (38, 41), (27, 41)],
                [(11, 25), (20, 24), (21, 31), (11, 31)], [(20, 22), (28, 21), (29, 29), (21, 30)], [(32, 29), (37, 28), (37, 34), (32, 34)]]:
        c.poly(pts, STONE2)
    c.seams()
    c.line([(16, 34), (24, 34)], 0.7, ((40, 52, 100),) * 3, shade=False)   # faded rune
    c.pixels([(23, 26), (25, 26)], (40, 52, 100))
    return c

# ═══ FROST WISP (Frostveil Glacier) ══════════════════════════════════════════
AURA = ramp((134, 197, 232), light=(182, 224, 245), shadow=(80, 150, 200))
CORE = ((200, 236, 252), (230, 246, 255), (255, 255, 255))
SHARD = ramp((150, 214, 245), light=(230, 246, 255), shadow=(70, 140, 190))
WISP_W, WISP_H = 34, 38

def _wisp(c, cx, cy, r, *, tail_bend=0.0, eyes='open', squash=1.0):
    c.poly([(cx - r * 0.7, cy + r * 0.2), (cx + r * 0.7, cy + r * 0.2), (cx + 1 + tail_bend, cy + r + 9), (cx + tail_bend * 1.6, cy + r + 13)], AURA)
    c.poly([(cx - r * 0.9, cy), (cx - r - 3, cy + 3), (cx - r * 0.6, cy + r * 0.5)], AURA)   # side wisps
    c.poly([(cx + r * 0.9, cy), (cx + r + 3, cy + 2.5), (cx + r * 0.6, cy + r * 0.5)], AURA)
    c.ellipse(cx, cy, r * squash, r / squash, AURA)
    c.ellipse(cx - 0.5, cy - 0.5, r * 0.62 * squash, r * 0.62 / squash, CORE, shade=False)
    if eyes == 'open':
        block(c, (cx + 1, cy), (14, 42, 68)); block(c, (cx + 4.5, cy), (14, 42, 68))
        c.pixels([(cx + 1.5, cy - 0.5), (cx + 5, cy - 0.5)], (95, 211, 255))
    else:
        c.pixels([(cx, cy), (cx + 1, cy - 0.5), (cx + 2, cy), (cx + 4, cy), (cx + 5, cy - 0.5), (cx + 6, cy)], (14, 42, 68))

def _diamond(c, x, y, s=1.6):
    c.poly([(x, y - s * 1.4), (x + s, y), (x, y + s * 1.4), (x - s, y)], SHARD)

def wisp_ready(orbit=0):
    c = Canvas(WISP_W, WISP_H)
    _wisp(c, 15, 13, 7.5)
    for i, (x, y) in enumerate([(4, 8), (27, 6), (26, 19)]):
        _diamond(c, x, y + (orbit if i % 2 else -orbit), 1.4)
    return c

def wisp_attack():
    c = Canvas(WISP_W, WISP_H)
    _wisp(c, 14, 13, 9)
    c.poly([(23, 11.5), (32, 13), (23, 14.5), (25, 13)], SHARD)        # ice shard flying forward
    c.pixels([(21, 9), (22, 17), (12, 3)], CORE[2])
    return c

def wisp_hurt():
    c = Canvas(WISP_W, WISP_H)
    _wisp(c, 13, 14, 7, tail_bend=-3, eyes='shut', squash=1.35)
    return c

def wisp_death():
    c = Canvas(WISP_W, WISP_H)
    for x, y, s in [(8, 30, 1.6), (14, 27, 1.9), (20, 31, 1.5), (25, 28, 1.3), (11, 34, 1.2), (18, 35, 1.4)]:
        _diamond(c, x, y, s)
    for x, y, r in [(10, 36, 2.2), (17, 36.5, 2.6), (24, 36, 2.0)]:
        c.ellipse(x, y, r, r * 0.7, ((170, 200, 220), (200, 225, 240), (230, 245, 255)))
    return c

# ═══ STORM SENTINEL (Stormspire Ruins) ═══════════════════════════════════════
SLATE = ramp((74, 80, 99), light=(107, 115, 140), shadow=(42, 46, 58))
SLATE_D = ramp((48, 52, 63), light=(70, 76, 92), shadow=(30, 33, 42))
VOLT, VOLT_HOT, SPARK = (63, 169, 245), (189, 230, 255), (255, 228, 92)
SENT_W, SENT_H = 40, 46

def _sentinel(c, T, *, visor=VOLT, core=VOLT, blast=False, cracked=False):
    P = lambda pts: [T(x, y) for x, y in pts]
    c.poly(P([(11, 16), (15, 16), (14, 30), (10, 30)]), SLATE_D)              # back arm
    c.poly(P([(9, 29), (15, 29), (15, 34), (9, 34)]), SLATE)
    c.poly(P([(14, 32), (19, 32), (19, 44), (13, 44)]), SLATE_D)              # legs
    c.poly(P([(21, 32), (26, 32), (27, 44), (21, 44)]), SLATE_D)
    c.poly(P([(12, 43), (20, 43), (20, 45), (12, 45)]), SLATE)                # boots
    c.poly(P([(20, 43), (28, 43), (28, 45), (20, 45)]), SLATE)
    c.poly(P([(12, 15), (28, 15), (26, 33), (14, 33)]), SLATE)                # torso
    c.poly(P([(15, 26), (25, 26), (24, 33), (16, 33)]), SLATE_D)              # belt plate
    c.poly(P([(15, 3), (25, 3), (26, 14), (14, 14)]), SLATE)                  # helmet
    c.poly(P([(13, 0.5), (16, 3), (14, 5)]), SLATE_D)                         # helmet fin
    c.poly(P([(9, 12), (17, 12), (17, 19), (9, 18)]), SLATE)                  # pauldrons
    c.poly(P([(24, 12), (32, 12), (32, 18), (24, 19)]), SLATE)
    c.poly(P([(27, 17), (31, 17), (31, 29), (27, 29)]), SLATE_D)              # front arm
    c.poly(P([(26, 28), (33, 28), (33, 34), (26, 34)]), SLATE)
    c.seams()
    c.line(P([(17, 8), (25.5, 8)]), 1.4, (visor,) * 3, shade=False)          # visor slit
    c.pixels(P([(24, 7.6)]), VOLT_HOT)
    cx, cy = T(20, 21)
    c.ellipse(cx, cy, 3.2, 3.2, ((core,) * 3), shade=False)
    c.ellipse(cx, cy, 1.4, 1.6, ((SPARK,) * 3), shade=False)
    if cracked:
        c.pixels(P([(27, 13), (28, 14), (27, 15), (29, 16)]), (20, 22, 28))
    for sx, sy in [(34, 30), (35, 33), (8, 31)]:                              # sparks at the fists
        c.pixels(P([(sx, sy), (sx + 1, sy - 1)]), SPARK)
    if blast:
        bolt = [(23, 21), (29, 19), (28, 22), (35, 20), (34, 23), (39, 21)]
        c.line(P(bolt), 1.2, ((VOLT_HOT,) * 3), shade=False)
        c.pixels(P([(29, 19), (35, 20), (39, 21)]), SPARK)

def sentinel_ready():
    c = Canvas(SENT_W, SENT_H); _sentinel(c, xf(pivot=(20, 45))); return c

def sentinel_attack():
    c = Canvas(SENT_W, SENT_H); _sentinel(c, xf(5, pivot=(20, 45)), core=VOLT_HOT, visor=VOLT_HOT, blast=True); return c

def sentinel_hurt():
    c = Canvas(SENT_W, SENT_H); _sentinel(c, xf(-10, pivot=(20, 45), dx=-1), visor=(30, 80, 120), cracked=True); return c

def sentinel_death():
    c = Canvas(SENT_W, SENT_H)
    T = xf(24, pivot=(20, 44), dy=12)          # collapsed onto its knees, slumped forward
    _sentinel(c, T, visor=(30, 36, 46), core=(30, 50, 70))
    return c
