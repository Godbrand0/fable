"""The Imp, drawn in code: small crimson demon with bat wings (Sunfall Dunes / Ember Fields)."""
import math
from pixelkit import Canvas, ramp, xf

SKIN   = ramp((170, 16, 16), light=(222, 54, 40), shadow=(104, 8, 8))
CHEST  = ramp((204, 36, 32), light=(236, 90, 64), shadow=(150, 20, 18))
HORN   = ramp((85, 6, 0), light=(140, 40, 26), shadow=(44, 0, 0))
WING   = ramp((110, 40, 0), light=(160, 74, 24), shadow=(70, 24, 0))
BONE   = ((44, 12, 0), (60, 18, 0), (80, 28, 4))
CLAW   = (40, 34, 34)
EYE, PUPIL = (255, 102, 0), (255, 214, 40)
FIRE   = ramp((255, 120, 20), light=(255, 220, 80), shadow=(200, 50, 10))

W, H = 44, 40

def standing(c, T, *, wing_up=0.0, mouth='grin', eyes='open', arm_reach=0.0, crumple=0.0):
    P = lambda pts: [T(x, y) for x, y in pts]
    # back wing (behind, upper-left), scalloped trailing edge
    wu, cr = wing_up, crumple
    sh = (16, 16.5)                       # shoulder joint
    elbow = (11 + cr * 0.5, 9 - wu + cr)  # wing elbow (top of the arch)
    tips = [(3 + cr, 4.5 - wu + cr), (1 + cr, 12 - wu * 0.5 + cr * 0.5), (5 + cr * 0.5, 19 + cr * 0.3)]
    back_wing = [sh, elbow, tips[0], (4.5 + cr, 9.5 - wu * 0.7 + cr), tips[1], (6, 14.5 + cr * 0.5), tips[2], (10, 18.5), (13.5, 21)]
    c.poly(P(back_wing), WING)
    c.line(P([sh, elbow]), 1.3, BONE, shade=False)
    for t in tips:
        c.line(P([elbow, t]), 0.8, BONE, shade=False)
    # far wing peeking behind the head (upper-right)
    fe = (27, 10 - wu + cr)
    c.poly(P([(22, 16.5), fe, (33 - cr, 5 - wu + cr), (32 - cr, 9.5 - wu * 0.5 + cr), (34 - cr, 12.5), (30, 13), (28.5, 17)]), WING)
    c.line(P([(22, 16.5), fe, (33 - cr, 5 - wu + cr)]), 0.9, BONE, shade=False)
    # tail: thin curl behind, arrow tip
    c.line(P([(15, 28), (10, 32), (6.5, 30), (5, 25.5)]), 1.3, SKIN)
    c.poly(P([(3, 23.5), (7.5, 22.5), (5.5, 26.5)]), SKIN)
    # back leg + back arm
    c.line(P([(17, 28), (15.5, 32.5), (16.5, 35)]), 2.6, SKIN)
    c.line(P([(14.5, 20), (12.5, 24.5), (13.5, 27.5)]), 2.0, SKIN)
    # body + chest
    c.ellipse(*T(19.5, 24), 5.2, 6.2, SKIN)
    cx, cy = T(20.5, 24.5)
    c.ellipse(cx, cy, 2.8, 3.8, CHEST)
    # front leg with claws
    c.line(P([(21.5, 28.5), (23.5, 32.5), (22.5, 35)]), 2.8, SKIN)
    c.pixels(P([(21, 36.5), (23, 36.5), (25, 36.5)]), CLAW)
    # head
    hx, hy = T(21.5, 13.5)
    c.ellipse(hx, hy, 6.8, 6.0, SKIN)
    # pointed ear swept back
    c.poly(P([(15, 13), (10.5, 10), (15.5, 16)]), SKIN)
    # horns
    c.poly(P([(16.5, 9.5), (14.5, 5.5), (14.5, 2.5), (17.5, 5.5), (19, 8.5)]), HORN)
    c.poly(P([(23.5, 8.5), (25.5, 4.5), (28.5, 3), (27, 7), (25.5, 9.5)]), HORN)
    # front arm reaching forward, claws
    ar = arm_reach
    c.line(P([(23.5, 20), (27 + ar, 22), (30 + ar * 1.5, 20.5)]), 2.2, SKIN)
    c.pixels(P([(31.5 + ar * 1.5, 19.5), (32 + ar * 1.5, 21), (31.5 + ar * 1.5, 22.3)]), CLAW)
    c.seams()
    # face (drawn after seams so details stay crisp)
    if eyes == 'open':
        for ex, ey in (T(21.5, 13), T(25.5, 13)):
            x0, y0 = round(ex - 0.5), round(ey - 0.5)
            c.pixels([(x0, y0), (x0 + 1, y0), (x0, y0 + 1), (x0 + 1, y0 + 1)], EYE)
            c.pixels([(x0 + 1, y0)], PUPIL)
        c.pixels(P([(20, 10.8), (21, 11.3), (27.3, 10.8), (26.3, 11.3)]), (60, 0, 0))   # angry brows
    else:  # squeezed shut
        c.pixels(P([(20.5, 13), (21.5, 12.5), (22.5, 13), (24.5, 13), (25.5, 12.5), (26.5, 13)]), (60, 0, 0))
    if mouth == 'grin':
        c.pixels(P([(22, 16.5), (23, 17), (24, 17.2), (25, 17), (26, 16.5)]), (50, 0, 0))
        c.pixels(P([(23, 16.6), (25, 16.6)]), (250, 240, 220))  # fangs
    elif mouth == 'open':
        mx, my = T(24, 17)
        c.ellipse(mx, my, 2.2, 1.8, ((40, 0, 0),) * 3, shade=False)
        c.pixels(P([(23, 15.8), (25, 15.8)]), (250, 240, 220))
    elif mouth == 'wince':
        c.pixels(P([(22.5, 17), (23.5, 16.5), (24.5, 17), (25.5, 16.5)]), (50, 0, 0))

def ready():
    c = Canvas(W, H)
    standing(c, xf(pivot=(20, 30), dy=-1.5))   # hovering just off the ground
    return c

def attack():
    c = Canvas(W, H)
    T = xf(14, pivot=(20, 32), dy=-1)  # lean forward
    standing(c, T, wing_up=2.5, mouth='open', arm_reach=1.5)
    fx, fy = T(33, 17)
    c.ellipse(fx, fy, 3.4, 3.0, FIRE)
    c.pixels([(fx + 0.5, fy - 0.5), (fx - 0.5, fy - 0.5), (fx, fy)], (255, 250, 200))
    c.pixels([(fx - 4.5, fy - 1), (fx - 5.5, fy + 0.5)], (255, 160, 40))   # trailing sparks
    return c

def hurt():
    c = Canvas(W, H)
    standing(c, xf(-16, pivot=(20, 32), dx=-1.5, dy=-0.5), crumple=2.5, eyes='shut', mouth='wince', arm_reach=-2)
    return c

def death():
    """Lying on its back, wings flat, legs up, a few wisps of smoke."""
    c = Canvas(W, H)
    # wings flat on the ground underneath
    c.poly([(10, 36), (2, 33.5), (4, 37), (8, 38)], WING)
    c.poly([(26, 36), (36, 33.5), (35, 37.5), (29, 38)], WING)
    # tail
    c.line([(9, 35), (5, 33.5), (3.5, 30.5)], 1.3, SKIN)
    c.poly([(1.5, 29), (5.5, 29.5), (3, 32)], SKIN)
    # body on its back
    c.ellipse(17.5, 33.5, 7.0, 4.2, SKIN)
    c.ellipse(17.5, 32.5, 4.2, 2.4, CHEST)
    # legs pointing up
    c.line([(13.5, 31), (12.5, 27), (13.5, 25.5)], 2.4, SKIN)
    c.line([(18, 31), (19, 27.5), (18, 26)], 2.4, SKIN)
    c.pixels([(12.5, 24.5), (14.5, 24.5), (17, 25), (19, 25)], CLAW)
    # head on the right, tipped back
    c.ellipse(28, 32.5, 5.6, 5.0, SKIN)
    c.poly([(26, 28.5), (24, 25), (27.5, 27)], HORN)
    c.poly([(30.5, 28.5), (33.5, 26), (32.5, 29.5)], HORN)
    c.seams()
    c.pixels([(27, 32), (28, 31.5), (29, 32), (30.5, 32), (31.5, 31.5)], (60, 0, 0))  # x_x closed eyes
    c.pixels([(28.5, 35), (29.5, 35)], (50, 0, 0))
    # smoke wisps
    for (x, y, r) in [(22.5, 26.5, 1.3), (21.5, 23, 1.7), (23, 19.5, 1.2)]:
        c.ellipse(x, y, r, r, ((120, 110, 110), (150, 142, 140), (185, 178, 175)))
    return c
