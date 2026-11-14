"""Build animated sprite sheets for the Stone-kin and Ember-kin hero skins.

Source: art/skins/source/stonekin_emberkin.png — one green-screen sheet, Stone-kin
on the top row and Ember-kin on the bottom, each with READY / SHOOT / HURT / DEATH
poses holding a bamboo staff.

For each skin and each weapon this writes <skin>_<weapon>.png (18 frames of 96×64,
same frame layout as the human hero sheets, see game/systems/heroSprite.ts).

Usage (needs Pillow + NumPy):
    python art/skins/build_skin_sprites.py art/skins/source/stonekin_emberkin.png /tmp/skins_out
    for f in /tmp/skins_out/*.png; do cp "$f" "public/sprites/hero_$(basename "$f")"; done
(the hero_ prefix keeps them from clashing with BootScene's static '<skin>_<weapon>' textures)
Add --maps to print ASCII maps of each pose (used to measure the staff lines below).
"""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
MAPS = '--maps' in sys.argv
FW, FH = 96, 64
BASE_Y = FH - 2
CX = FW // 2
TARGET_H = 48            # game px tall for the READY pose (the human hero is ~49)

SKINS = {
    # cells: (x0, x1, y0, y1) in the source sheet for each pose
    'obsidian': dict(
        cells={'ready': (28, 336, 75, 440), 'shoot': (360, 806, 75, 440), 'hurt': (806, 1145, 75, 440), 'death': (1145, 1530, 75, 440)},
        motion='slither',
    ),
    'ember': dict(
        cells={'ready': (8, 344, 550, 945), 'shoot': (356, 793, 550, 945), 'hurt': (793, 1152, 550, 945), 'death': (1152, 1530, 550, 945)},
        motion='walk',
        # Ember-kin has no green of its own except the staff, so any other green is screen spill.
        green_is_spill=True,
    ),
}

BG = np.array([3, 250, 19])

def key_cell(sheet, box):
    x0, x1, y0, y1 = box
    im = sheet[y0:y1, x0:x1].astype(np.int32)
    d = np.sqrt(((im - BG) ** 2).sum(axis=2))
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    bg = (d < 60) | ((g > 200) & (r < 40) & (b < 70))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    return np.dstack([im.astype(np.uint8), alpha])

def shrink(rgba, scale):
    h, w = rgba.shape[:2]
    nw, nh = max(1, round(w / scale)), max(1, round(h / scale))
    arr = rgba.astype(np.float32)
    a = arr[..., 3:4] / 255.0
    pre = np.concatenate([arr[..., :3] * a, a * 255], axis=2)
    small = np.array(Image.fromarray(pre.astype(np.uint8)).resize((nw, nh), Image.BOX)).astype(np.float32)
    al = small[..., 3:4]
    rgb = np.where(al > 0, small[..., :3] * 255.0 / np.maximum(al, 1), 0)
    out = np.dstack([np.clip(rgb, 0, 255), np.where(al[..., 0] >= 110, 255, 0)]).astype(np.uint8)
    # Despill: edge pixels that are still mostly background green become transparent.
    a2 = out[..., 3] > 0
    pad = np.pad(a2, 1, constant_values=False)
    edge = a2 & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    o = out.astype(np.int32)
    spill = edge & (o[..., 1] > o[..., 0] + 70) & (o[..., 1] > o[..., 2] + 70) & (o[..., 0] < 50)
    out[spill] = 0
    out = fill_holes(out)
    # Drop tiny specks (e.g. the hurt pose's "!" marks) not connected to the body.
    return drop_specks(out)

def fill_holes(fr):
    """Transparent pixels fully enclosed by the body (bright runes that matched the
    green screen) get the average colour of their opaque neighbours."""
    a = fr[..., 3] > 0
    h, w = a.shape
    outside = np.zeros_like(a)
    stack = [(y, x) for y in range(h) for x in (0, w - 1) if not a[y, x]] + \
            [(y, x) for x in range(w) for y in (0, h - 1) if not a[y, x]]
    for y, x in stack: outside[y, x] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not a[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True; stack.append((ny, nx))
    out = fr.copy()
    for y, x in zip(*np.where(~a & ~outside)):
        nb = [fr[ny, nx, :3].astype(int) for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1))
              if 0 <= ny < h and 0 <= nx < w and a[ny, nx]]
        if nb:
            out[y, x, :3] = np.mean(nb, axis=0).astype(np.uint8); out[y, x, 3] = 255
    return out

def drop_specks(fr, min_px=10, keep_glow=True):
    a = fr[..., 3] > 0
    h, w = a.shape
    seen = np.zeros_like(a)
    out = fr.copy()
    for sy in range(h):
        for sx in range(w):
            if a[sy, sx] and not seen[sy, sx]:
                stack, comp = [(sy, sx)], []
                seen[sy, sx] = True
                while stack:
                    y, x = stack.pop(); comp.append((y, x))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w and a[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; stack.append((ny, nx))
                if len(comp) < min_px:
                    px = np.array(comp)
                    cols = fr[px[:, 0], px[:, 1], :3].astype(int)
                    glow = keep_glow and (cols[:, 2] > cols[:, 0] + 30).any()   # keep the shoot flash sparkles
                    if not glow:
                        out[px[:, 0], px[:, 1]] = 0
    return out

def body_anchor(px):
    """Column of the head/torso: erode away thin parts (staff, fingers), then take the
    centroid of what's left in the upper half."""
    a = px[..., 3] > 0
    e = a.copy()
    for _ in range(2):
        p = np.pad(e, 1, constant_values=False)
        e = e & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    ys, xs = np.where(e if e.any() else a)
    top, bot = ys.min(), ys.max()
    sel = ys <= top + (bot - top) * 0.5
    return int(round(xs[sel].mean()))

def place(px, anchor):
    a = px[..., 3] > 0
    ys, xs = np.where(a)
    frame = np.zeros((FH, FW, 4), np.uint8)
    dx, dy = CX - anchor, BASE_Y - ys.max()
    for y, x in zip(ys, xs):
        nx, ny = x + dx, y + dy
        if 0 <= nx < FW and 0 <= ny < FH:
            frame[ny, nx] = px[y, x]
    return frame

def outline(fr):
    a = fr[..., 3] > 0
    pad = np.pad(a, 1)
    neigh = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    out = fr.copy(); out[neigh & ~a] = [22, 14, 10, 255]
    return out

def ascii_map(fr):
    rows = []
    for y in range(FH):
        line = ''
        for x in range(FW):
            p = fr[y, x]
            if p[3] == 0: line += '.'; continue
            r, g, b = map(int, p[:3])
            if max(r, g, b) < 50: line += 'd'
            elif b > r + 30 and b > 120: line += 'B'
            elif g > r + 15 and g > b + 15: line += 'G'
            else: line += '#'
        rows.append(f'{y:3d} {line}')
    head = '    ' + ''.join(str((x // 10) % 10) if x % 10 == 0 else ' ' for x in range(FW))
    return head + '\n' + '\n'.join(rows)

sheet = np.array(Image.open(SRC).convert('RGB'))
built = {}
for skin, cfg in SKINS.items():
    raw = {k: key_cell(sheet, box) for k, box in cfg['cells'].items()}
    ra = raw['ready'][..., 3] > 0
    ys = np.where(ra.any(axis=1))[0]
    scale = (ys.max() - ys.min() + 1) / TARGET_H
    poses = {}
    for k, r in raw.items():
        px = shrink(r, scale)
        poses[k] = place(px, body_anchor(px))
    # shared palette per skin
    stack = np.concatenate([p.reshape(-1, 4) for p in poses.values()])
    opaque = stack[stack[:, 3] > 0][:, :3]
    pal = Image.fromarray(opaque.reshape(1, -1, 3)).quantize(colors=48, method=Image.Quantize.MEDIANCUT)
    for k, fr in poses.items():
        a = fr[..., 3] > 0
        q = np.array(Image.fromarray(fr[..., :3]).quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB'))
        fr[..., :3] = np.where(a[..., None], q, 0)
    built[skin] = (poses, scale)
    print(skin, 'scale %.2f' % scale, {k: int((p[..., 3] > 0).any(axis=1).sum()) for k, p in poses.items()})
    if MAPS:
        for k, p in poses.items():
            print(f'== {skin} {k}'); print(ascii_map(p))

# ── Staff lines per pose, in frame pixels: (start, grip, end) ────────────────
# The whole staff (start→end) is erased for other weapons; the new weapon is
# drawn from the grip toward `end`. Re-measure with --maps if the source changes.
STAFF = {
    'obsidian': {
        'ready': ((57, 57), (60.5, 38), (64, 20)),
        'shoot': ((58, 33), (58, 33), (72, 32)),
        'hurt':  ((58, 44), (66, 35), (77, 21)),
        'death': ((48, 61), (58, 59), (75, 56)),
    },
    'ember': {
        'ready': ((61, 57), (65.5, 38), (70, 20)),
        'shoot': ((62, 32), (62, 32), (76, 31)),
        'hurt':  ((62, 45), (66, 37), (75, 21)),
        'death': ((50, 60.5), (63, 58.5), (75, 57.5)),
    },
}

WEAPONS = {
    'bamboo':       None,
    'iron_sword':   dict(length=21, width=3, guard=7, edge=(120, 130, 142), core=(196, 204, 214), shine=(240, 244, 248), hilt=(92, 70, 40), gem=None),
    'ember_blade':  dict(length=23, width=3, guard=7, edge=(150, 30, 10), core=(255, 120, 40), shine=(255, 220, 140), hilt=(58, 26, 10), gem=(255, 70, 30)),
    'obsidian_gs':  dict(length=28, width=4, guard=9, edge=(26, 22, 44), core=(60, 46, 96), shine=(170, 120, 255), hilt=(42, 34, 56), gem=(155, 92, 255)),
}

def is_glow(px):
    r, g, b = int(px[0]), int(px[1]), int(px[2])
    return b > r + 30 and b > 120

def swap_weapon(fr, seg, w):
    if w is None:
        return fr
    out = fr.copy()
    (sx, sy), (gx, gy), (ex, ey) = seg
    # 1) erase the staff start→end
    vx, vy = ex - sx, ey - sy
    L = (vx * vx + vy * vy) ** 0.5
    ux, uy = vx / L, vy / L
    nx, ny = -uy, ux
    for y in range(FH):
        for x in range(FW):
            if out[y, x, 3] == 0 or is_glow(out[y, x]):
                continue
            dx, dy = x - sx, y - sy
            t = dx * ux + dy * uy
            if -1.5 <= t <= L + 2 and abs(dx * nx + dy * ny) <= 2.4:
                out[y, x] = 0
    # 2) draw from the grip toward the end
    vx, vy = ex - gx, ey - gy
    L = (vx * vx + vy * vy) ** 0.5
    ux, uy = vx / L, vy / L
    nx, ny = -uy, ux
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
        put(gx + ux, gy + uy, w['gem'])
    half_w = (w['width'] - 1) / 2
    length = w['length']
    while length > 6:
        tx, ty = gx + ux * (2.5 + length), gy + uy * (2.5 + length)
        if 1 <= tx <= FW - 2 and 1 <= ty <= FH - 2:
            break
        length -= 0.5
    t = 2.5
    while t <= 2.5 + length:
        hw = half_w if (2.5 + length - t) > 4 else half_w * (2.5 + length - t) / 4
        s = -hw
        while s <= hw + 1e-6:
            edge = abs(abs(s) - hw) < 0.5 and hw > 0.6
            put(gx + ux * t + nx * s, gy + uy * t + ny * s, w['edge'] if edge else w['core'])
            s += 0.5
        if hw > 0.6:
            put(gx + ux * t - nx * (hw - 1), gy + uy * t - ny * (hw - 1), w['shine'])
        t += 0.5
    return out

# ── Motion ──────────────────────────────────────────────────────────────────
def shift_rows(fr, y0, y1, dy=0, dx=0):
    out = fr.copy(); out[y0:y1] = 0
    part = fr[y0:y1]
    for y in range(part.shape[0]):
        ty = y0 + y + dy
        if 0 <= ty < FH:
            row = np.roll(part[y], dx, axis=0)
            m = row[..., 3] > 0
            out[ty][m] = row[m]
    return out

def body_rows(fr):
    ys = np.where((fr[..., 3] > 0).any(axis=1))[0]
    return int(ys.min()), int(ys.max())

def breathe(fr, up):
    top, bot = body_rows(fr)
    waist = top + int((bot - top) * 0.55)
    return shift_rows(fr, 0, waist, dy=-up) if up else fr

def sway(fr, s, bob):
    """Walk/slither: the lower body shears sideways (more toward the ground) while the
    upper body bobs. Works for a serpent tail and for digitigrade legs + tail."""
    top, bot = body_rows(fr)
    waist = top + int((bot - top) * 0.55)
    out = fr.copy(); out[waist:] = 0
    H = bot - waist + 1
    for y in range(waist, FH):
        k = min(1.0, max(0.0, (y - waist) / max(H - 1, 1)))
        row = np.roll(fr[y], int(round(s * k)), axis=0)
        m = row[..., 3] > 0
        out[y][m] = row[m]
    return shift_rows(out, 0, waist, dy=-bob) if bob else out

GAITS = {
    'slither': [(2, 0), (1, 1), (0, 1), (-2, 0), (-1, 1), (0, 1)],
    'walk':    [(2, 0), (1, 1), (-1, 0), (-2, 0), (-1, 1), (1, 0)],
}

def clean_green_spill(fr, seg):
    """Remove green-screen spill away from the staff: edge pixels go transparent,
    interior ones take the colour of their non-green neighbours."""
    (sx, sy), _, (ex, ey) = seg
    vx, vy = ex - sx, ey - sy
    L = (vx * vx + vy * vy) ** 0.5
    ux, uy = vx / L, vy / L
    out = fr.copy()
    a = fr[..., 3] > 0
    c = fr[..., :3].astype(int)
    green = a & (c[..., 1] > c[..., 0] + 25) & (c[..., 1] > c[..., 2] + 15)
    for y, x in zip(*np.where(green)):
        dx, dy = x - sx, y - sy
        t = dx * ux + dy * uy
        if -2 <= t <= L + 2 and abs(dx * -uy + dy * ux) <= 3:
            continue  # part of the staff
        nbs = [(y + j, x + i) for j in (-1, 0, 1) for i in (-1, 0, 1) if (i or j) and 0 <= y + j < FH and 0 <= x + i < FW]
        if any(not a[q] for q in nbs):
            out[y, x] = 0
        else:
            ok = [c[q] for q in nbs if not green[q]]
            if ok: out[y, x, :3] = np.mean(ok, axis=0).astype(np.uint8)
    return out

for skin, (poses, scale) in built.items():
    gait = GAITS[SKINS[skin]['motion']]
    if SKINS[skin].get('green_is_spill'):
        poses = {k: clean_green_spill(v, STAFF[skin][k]) for k, v in poses.items()}
    # Only the shoot pose has a magic flash; elsewhere every loose speck is noise.
    poses = {k: drop_specks(v, keep_glow=(k == 'shoot')) for k, v in poses.items()}
    for wname, w in WEAPONS.items():
        R = swap_weapon(poses['ready'], STAFF[skin]['ready'], w)
        S = swap_weapon(poses['shoot'], STAFF[skin]['shoot'], w)
        H = swap_weapon(poses['hurt'], STAFF[skin]['hurt'], w)
        D = swap_weapon(poses['death'], STAFF[skin]['death'], w)
        frames = {
            'idle':  [R, R, breathe(R, 1), breathe(R, 1)],
            'walk':  [sway(R, s, b) for s, b in gait],
            'shoot': [S, S, S, R],
            'hurt':  [H, H],
            'death': [H, D],
        }
        sheet_frames, meta, i = [], {}, 0
        for k in ['idle', 'walk', 'shoot', 'hurt', 'death']:
            meta[k] = list(range(i, i + len(frames[k]))); i += len(frames[k])
            sheet_frames += [outline(f) for f in frames[k]]
        Image.fromarray(np.concatenate(sheet_frames, axis=1)).save(OUT / f'{skin}_{wname}.png')
        json.dump({'frameWidth': FW, 'frameHeight': FH, 'anims': meta}, open(OUT / f'{skin}_{wname}.json', 'w'), indent=1)
    print(skin, 'sheets written')
