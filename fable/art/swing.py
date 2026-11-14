"""Shared by art/hero/build_hero_sprites.py and art/skins/build_skin_sprites.py.

Turns the "point and shoot" pose into a 3-frame weapon swing: the weapon held in
the shoot pose (and its blue magic flash) is erased, then redrawn rotated around
the hand — raised, over the top, then down-forward — so the attack reads as a slash.
"""
import math
import numpy as np

# Swing angles relative to the weapon's direction in the shoot pose (degrees,
# image coords: negative = up). Windup -> mid-swing -> strike.
SWING_ANGLES = (-115, -50, 30)

# The bamboo staff, drawn the same way as the swords (the stills only have it at one angle).
BAMBOO = dict(staff=True, length=17, width=2, edge=(58, 96, 34), core=(100, 156, 58), shine=(170, 214, 108), node=(70, 104, 40))


def _is_glow(px):
    r, g, b = int(px[0]), int(px[1]), int(px[2])
    return b > r + 30 and b > 120


def erase_weapon(fr, start, end, half_width=2.6, glow_radius=9):
    """Erase the held weapon along start->end, plus any blue flash pixels near it."""
    out = fr.copy()
    FH, FW = fr.shape[:2]
    (sx, sy), (ex, ey) = start, end
    vx, vy = ex - sx, ey - sy
    L = math.hypot(vx, vy)
    ux, uy = vx / L, vy / L
    nx, ny = -uy, ux
    for y in range(FH):
        for x in range(FW):
            if out[y, x, 3] == 0:
                continue
            dx, dy = x - sx, y - sy
            t = dx * ux + dy * uy
            d = abs(dx * nx + dy * ny)
            if _is_glow(out[y, x]):
                if t > 0 and math.hypot(x - ex, y - ey) <= glow_radius:
                    out[y, x] = 0
            elif -1.5 <= t <= L + 2 and d <= half_width:
                out[y, x] = 0
    return out


def draw_weapon(fr, grip, angle, w):
    """Draw weapon `w` (a WEAPONS entry, or BAMBOO) from the grip at `angle` radians."""
    out = fr.copy()
    FH, FW = fr.shape[:2]
    gx, gy = grip
    ux, uy = math.cos(angle), math.sin(angle)
    nx, ny = -uy, ux

    def put(x, y, c):
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < FW and 0 <= yi < FH:
            out[yi, xi] = (*c, 255)

    staff = w.get('staff', False)
    start = 0.5 if staff else 2.5
    if not staff:
        half_g = w['guard'] / 2
        s = -half_g
        while s <= half_g:
            for k in (0.5, 1.5):
                put(gx + ux * k + nx * s, gy + uy * k + ny * s, w['hilt'])
            s += 0.5
        if w.get('gem'):
            put(gx + ux, gy + uy, w['gem'])
    half_w = (w['width'] - 1) / 2
    length = w['length']
    while length > 6:   # keep the tip inside the frame
        tx, ty = gx + ux * (start + length), gy + uy * (start + length)
        if 1 <= tx <= FW - 2 and 1 <= ty <= FH - 2:
            break
        length -= 0.5
    t = start
    while t <= start + length:
        remaining = start + length - t
        hw = half_w if (staff or remaining > 4) else half_w * remaining / 4
        node = staff and int(t) % 5 == 0
        s = -hw
        while s <= hw + 1e-6:
            edge = abs(abs(s) - hw) < 0.5 and hw > 0.4
            col = w['node'] if node else (w['edge'] if edge else w['core'])
            put(gx + ux * t + nx * s, gy + uy * t + ny * s, col)
            s += 0.5
        if hw > 0.6 or staff:
            put(gx + ux * t - nx * max(hw - 1, 0), gy + uy * t - ny * max(hw - 1, 0), w['shine'])
        t += 0.5
    return out


def drop_loose_bits(fr, from_x, max_px=40):
    """Remove small pixel islands right of `from_x` (leftover sparkles of the magic flash)."""
    out = fr.copy()
    FH, FW = fr.shape[:2]
    a = fr[..., 3] > 0
    seen = np.zeros_like(a)
    for y0 in range(FH):
        for x0 in range(FW):
            if not a[y0, x0] or seen[y0, x0]:
                continue
            stack, comp = [(y0, x0)], []
            seen[y0, x0] = True
            while stack:
                y, x = stack.pop(); comp.append((y, x))
                for j in (-1, 0, 1):
                    for i in (-1, 0, 1):
                        yy, xx = y + j, x + i
                        if 0 <= yy < FH and 0 <= xx < FW and a[yy, xx] and not seen[yy, xx]:
                            seen[yy, xx] = True; stack.append((yy, xx))
            if len(comp) <= max_px and min(x for _, x in comp) > from_x:
                for y, x in comp:
                    out[y, x] = 0
    return out


def swing_frames(shoot_pose, start, grip, end, w):
    """Three swing frames (windup, mid, strike) built from the shoot pose."""
    base = drop_loose_bits(erase_weapon(shoot_pose, start, end), grip[0] + 1)
    a0 = math.atan2(end[1] - grip[1], end[0] - grip[0])
    w = w or BAMBOO
    return [draw_weapon(base, grip, a0 + math.radians(d), w) for d in SWING_ANGLES]
