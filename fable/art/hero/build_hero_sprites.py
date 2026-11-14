"""Build the hero's animated sprite sheet from four green-screen stills.

Source stills (art/hero/source/): ready.png, shoot.png, hurt.png, death.png —
pixel-art poses on a flat #00FF00 background, all with feet on the same baseline.

Steps: key out green -> shrink to game pixel size (SCALE source px per game px)
-> one shared palette -> align every pose on the body -> build the in-between
frames (idle breathing, walk leg-scissor, shoot recoil) -> 1px outline.

Writes one sheet per weapon (hero_bamboo, hero_iron_sword, hero_ember_blade,
hero_obsidian_gs): the bamboo staff from the stills is swapped for each weapon.

Usage (needs Pillow + NumPy):
    python art/hero/build_hero_sprites.py art/hero/source /tmp/hero_out 8.75
    cp /tmp/hero_out/hero_*.png public/sprites/
Frame layout is written to hero_<weapon>.json; keep game/systems/heroSprite.ts in sync.
"""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
SCALE = float(sys.argv[3]) if len(sys.argv) > 3 else 8.75   # source px per game px
FW, FH = 96, 64          # frame size (game px); body is centered horizontally
BASE_Y = FH - 2          # feet baseline row
CX = FW // 2             # body anchor column (so flipX mirrors around the body)

def load(n):
    im = np.array(Image.open(SRC / f'{n}.png').convert('RGB')).astype(np.int32)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    # Green screen: strongly green pixels, plus green-tinted fringe pixels.
    key = (g > 150) & (g > r + 60) & (g > b + 60)
    alpha = np.where(key, 0, 255).astype(np.uint8)
    rgba = np.dstack([im.astype(np.uint8), alpha])
    return Image.fromarray(rgba, 'RGBA')

def shrink(img):
    w, h = img.size
    nw, nh = round(w / SCALE), round(h / SCALE)
    # Premultiplied box filter, then hard alpha so edges stay crisp.
    arr = np.array(img).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    pre = np.concatenate([arr[..., :3] * a, a * 255], axis=2)
    small = np.array(Image.fromarray(pre.astype(np.uint8), 'RGBA').resize((nw, nh), Image.BOX)).astype(np.float32)
    al = small[..., 3:4]
    rgb = np.where(al > 0, small[..., :3] * 255.0 / np.maximum(al, 1), 0)
    out = np.dstack([np.clip(rgb, 0, 255), np.where(al[..., 0] >= 110, 255, 0)]).astype(np.uint8)
    return out

def body_anchor(px):
    """Column of the body's center: centroid of the headwrap (light, low-saturation pixels) near the top."""
    a = px[..., 3] > 0
    rgb = px[..., :3].astype(int)
    light = a & (rgb.min(axis=2) > 170) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 50)
    ys, xs = np.where(light)
    return int(round(xs.mean())) if len(xs) else int(np.where(a)[1].mean())

poses = {}
for name in ['ready', 'shoot', 'hurt', 'death']:
    px = shrink(load(name))
    a = px[..., 3] > 0
    ys, xs = np.where(a)
    bottom = ys.max()
    ax = body_anchor(px)
    frame = np.zeros((FH, FW, 4), np.uint8)
    dx, dy = CX - ax, BASE_Y - bottom
    for y, x in zip(ys, xs):
        nx, ny = x + dx, y + dy
        if 0 <= nx < FW and 0 <= ny < FH:
            frame[ny, nx] = px[y, x]
    poses[name] = frame
    print(name, 'native size', px.shape[1], 'x', px.shape[0], 'char height', bottom - ys.min() + 1, 'anchor', ax)

# ── Shared palette (keeps all frames consistent and gets rid of resize mush) ──
stack = np.concatenate([p.reshape(-1, 4) for p in poses.values()])
opaque = stack[stack[:, 3] > 0][:, :3]
pal_img = Image.fromarray(opaque.reshape(1, -1, 3), 'RGB').quantize(colors=28, method=Image.Quantize.MEDIANCUT)
def quant(fr):
    out = fr.copy(); a = fr[..., 3] > 0
    if a.any():
        q = Image.fromarray(fr[..., :3]).quantize(palette=pal_img, dither=Image.Dither.NONE).convert('RGB')
        out[..., :3] = np.where(a[..., None], np.array(q), 0)
    return out
poses = {k: quant(v) for k, v in poses.items()}

# Clean a 1-px dark outline around everything (pixel-art readability).
def outline(fr):
    a = fr[..., 3] > 0
    pad = np.pad(a, 1)
    neigh = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    edge = neigh & ~a
    out = fr.copy(); out[edge] = [22, 14, 10, 255]
    return out

# ── Body regions on the ready pose ──
R = poses['ready']
ra = R[..., 3] > 0
rgb = R[..., :3].astype(int)
olive = ra & (rgb[..., 1] > rgb[..., 0] + 8) & (rgb[..., 1] > rgb[..., 2] + 15) & (rgb[..., 1] < 170)
# waist = first row (from the top) where trousers start, ignoring the staff (right of the hand)
body_cols = slice(CX - 16, CX + 6)
rows_with_pants = np.where(olive[:, body_cols].sum(axis=1) >= 4)[0]
WAIST = int(rows_with_pants.min()) if len(rows_with_pants) else BASE_Y - 22
# leg split column: the gap between the two boots on the bottom rows
foot_rows = R[BASE_Y - 4:BASE_Y + 1, :, 3] > 0
cols = np.where(foot_rows.any(axis=0))[0]
gaps = [(b - a, (a + b) // 2) for a, b in zip(cols[:-1], cols[1:]) if b - a > 1]
LEG_SPLIT = max(gaps)[1] if gaps else CX
print('waist row', WAIST, 'leg split col', LEG_SPLIT)

def shift_rows(fr, y0, y1, dy=0, dx=0):
    out = fr.copy(); out[y0:y1] = 0
    part = fr[y0:y1]
    for y in range(part.shape[0]):
        ny = y0 + y + dy
        if 0 <= ny < FH:
            row = np.roll(part[y], dx, axis=0)
            m = row[..., 3] > 0
            out[ny][m] = row[m]
    return out

def breathe(fr, up):
    # Upper body rises 1px; legs stay planted.
    return shift_rows(fr, 0, WAIST, dy=-up) if up else fr

def step(fr, s):
    """Scissor the legs: back leg and front leg shear in opposite directions, more at the feet."""
    out = fr.copy()
    legs = fr[WAIST:BASE_Y + 2].copy()
    out[WAIST:BASE_Y + 2] = 0
    H = legs.shape[0]
    for y in range(H):
        k = (y / max(H - 1, 1)) ** 1.3
        lift = 1 if (s != 0 and y >= H - 3) else 0
        for side, sign in (('back', -1), ('front', 1)):
            row = legs[y].copy()
            if side == 'back': row[LEG_SPLIT:] = 0
            else: row[:LEG_SPLIT] = 0
            off = int(round(sign * s * k))
            row = np.roll(row, off, axis=0)
            ty = WAIST + y - (lift if (sign * s) > 0 else 0)
            m = row[..., 3] > 0
            if 0 <= ty < FH: out[ty][m] = row[m]
    return out

# ── Weapons ────────────────────────────────────────────────────────────────
# The stills hold a bamboo staff. For every other weapon the staff is erased
# along its line and the weapon is drawn in its place. (grip, tip) per pose,
# in frame pixels — re-measure these if SCALE or the stills change.
STAFF = {
    'ready': ((66, 32.5), (86, 29.5)),
    'shoot': ((64, 33),   (80, 31.5)),
    'hurt':  ((77, 32),   (95, 24)),
    'death': ((53, 59.5), (75, 60.5)),
}

# Weapon look: blade length/width in px, and colors (edge, core, highlight, guard, accent).
WEAPONS = {
    'bamboo':       None,  # keep the staff from the stills
    'iron_sword':   dict(length=21, width=3, guard=7, edge=(120, 130, 142), core=(196, 204, 214), shine=(240, 244, 248), hilt=(92, 70, 40), gem=None),
    'ember_blade':  dict(length=23, width=3, guard=7, edge=(150, 30, 10), core=(255, 120, 40), shine=(255, 220, 140), hilt=(58, 26, 10), gem=(255, 70, 30)),
    'obsidian_gs':  dict(length=28, width=4, guard=9, edge=(26, 22, 44), core=(60, 46, 96), shine=(170, 120, 255), hilt=(42, 34, 56), gem=(155, 92, 255)),
}

def is_glow(px):
    r, g, b = int(px[0]), int(px[1]), int(px[2])
    return b > r + 30 and b > 120   # the blue magic flash in the shoot pose

def swap_weapon(fr, seg, w):
    if w is None:
        return fr
    out = fr.copy()
    (gx, gy), (tx, ty) = seg
    ux, uy = tx - gx, ty - gy
    L = (ux * ux + uy * uy) ** 0.5
    ux, uy = ux / L, uy / L
    nx, ny = -uy, ux
    # 1) Erase the staff (and its outline) along its line, starting just past the hand.
    for y in range(FH):
        for x in range(FW):
            if out[y, x, 3] == 0 or is_glow(out[y, x]):
                continue
            dx, dy = x - gx, y - gy
            t = dx * ux + dy * uy
            d = abs(dx * nx + dy * ny)
            if -0.5 <= t <= L + 2 and d <= 2.6:
                out[y, x] = 0
    # 2) Draw the weapon: crossguard at the grip, then a blade tapering to a point.
    def put(x, y, c):
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < FW and 0 <= yi < FH:
            out[yi, xi] = (*c, 255)
    half_g = w['guard'] / 2
    s = -half_g
    while s <= half_g:
        for k in (0.5, 1.5):
            put(gx + ux * k + nx * s, gy + uy * k + ny * s, w['hilt'])
        s += 0.5
    if w['gem']:
        put(gx + ux * 1, gy + uy * 1, w['gem'])
    half_w = (w['width'] - 1) / 2
    # Shorten the blade if it would run off the frame (e.g. the hurt pose points up-right).
    length = w['length']
    while length > 6:
        ex, ey = gx + ux * (2.5 + length), gy + uy * (2.5 + length)
        if 1 <= ex <= FW - 2 and 1 <= ey <= FH - 2:
            break
        length -= 0.5
    t = 2.5
    while t <= 2.5 + length:
        remaining = 2.5 + length - t
        hw = half_w if remaining > 4 else half_w * remaining / 4   # taper the tip
        s = -hw
        while s <= hw + 1e-6:
            edge = abs(abs(s) - hw) < 0.5 and hw > 0.6
            col = w['edge'] if edge else w['core']
            put(gx + ux * t + nx * s, gy + uy * t + ny * s, col)
            s += 0.5
        # a bright line along the blade's upper side
        if hw > 0.6:
            put(gx + ux * t - nx * (hw - 1), gy + uy * t - ny * (hw - 1), w['shine'])
        t += 0.5
    return out

S0 = poses['shoot']
for wname, w in WEAPONS.items():
    R = swap_weapon(poses['ready'], STAFF['ready'], w)
    S = swap_weapon(S0, STAFF['shoot'], w)
    H = swap_weapon(poses['hurt'], STAFF['hurt'], w)
    D = swap_weapon(poses['death'], STAFF['death'], w)
    frames = {
        'idle':  [R, R, breathe(R, 1), breathe(R, 1)],
        'walk':  [step(R, 3), breathe(step(R, 1), 1), step(R, -1), step(R, -3), breathe(step(R, -1), 1), step(R, 1)],
        'shoot': [S, S, shift_rows(R, 0, WAIST, dx=-1), R],
        'hurt':  [H, H],
        'death': [H, D],
    }
    order = ['idle', 'walk', 'shoot', 'hurt', 'death']
    sheet_frames, meta, i = [], {}, 0
    for k in order:
        meta[k] = list(range(i, i + len(frames[k]))); i += len(frames[k])
        sheet_frames += [outline(f) for f in frames[k]]
    sheet = np.concatenate(sheet_frames, axis=1)
    Image.fromarray(sheet).save(OUT / f'hero_{wname}.png')
    json.dump({'frameWidth': FW, 'frameHeight': FH, 'baseline': BASE_Y, 'waist': WAIST, 'anims': meta},
              open(OUT / f'hero_{wname}.json', 'w'), indent=1)
    print(wname, 'frames', i)
