"""Build the hero's animated sprite sheet from four green-screen stills.

Source stills (art/hero/source/): ready.png, shoot.png, hurt.png, death.png —
pixel-art poses on a flat #00FF00 background, all with feet on the same baseline.

Steps: key out green -> shrink to game pixel size (SCALE source px per game px)
-> one shared palette -> align every pose on the body -> build the in-between
frames (idle breathing, walk leg-scissor, shoot recoil) -> 1px outline.

Usage (needs Pillow + NumPy):
    python art/hero/build_hero_sprites.py art/hero/source /tmp/hero_out 8.75
    cp /tmp/hero_out/hero_bamboo.png public/sprites/hero_bamboo.png
Frame layout is written to hero_bamboo.json; keep game/systems/heroSprite.ts in sync.
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

S = poses['shoot']
frames = {
    'idle':  [R, R, breathe(R, 1), breathe(R, 1)],
    'walk':  [step(R, 3), breathe(step(R, 1), 1), step(R, -1), step(R, -3), breathe(step(R, -1), 1), step(R, 1)],
    'shoot': [S, S, shift_rows(R, 0, WAIST, dx=-1), R],
    'hurt':  [poses['hurt'], poses['hurt']],
    'death': [poses['hurt'], poses['death']],
}
order = ['idle', 'walk', 'shoot', 'hurt', 'death']
sheet_frames, meta, i = [], {}, 0
for k in order:
    meta[k] = list(range(i, i + len(frames[k]))); i += len(frames[k])
    sheet_frames += [outline(f) for f in frames[k]]

sheet = np.concatenate(sheet_frames, axis=1)
Image.fromarray(sheet, 'RGBA').save(OUT / 'hero_bamboo.png')
json.dump({'frameWidth': FW, 'frameHeight': FH, 'baseline': BASE_Y, 'waist': WAIST, 'anims': meta}, open(OUT / 'hero_bamboo.json', 'w'), indent=1)

# Big preview on a checkerboard so it can be judged by eye
prev = Image.fromarray(sheet, 'RGBA')
bg = Image.new('RGBA', prev.size, (60, 60, 70, 255))
chk = np.indices(prev.size[::-1]).sum(axis=0) % 2
bg = Image.fromarray(np.dstack([np.where(chk, 70, 52)] * 3 + [np.full(chk.shape, 255)]).astype(np.uint8), 'RGBA')
bg.alpha_composite(prev)
bg.resize((prev.size[0] * 5, prev.size[1] * 5), Image.NEAREST).save(OUT / 'preview.png')
print('frames', i, json.dumps(meta))
