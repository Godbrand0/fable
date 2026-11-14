"""Tiny pixel-art toolkit: draw characters from shaded parts in code.

Each part is a shape (polygon, ellipse, thick line) with a 3-tone colour ramp.
Shading is automatic with light from the top-left: pixels on a part's upper-left
edge get the light tone, lower-right edge pixels get the shadow tone. A 1-px
dark outline goes around the whole silhouette, matching the hero sprites.
"""
import math
import numpy as np
from PIL import Image, ImageDraw

OUTLINE = (22, 14, 10)
GREEN = (0, 255, 0)
MAGENTA = (255, 0, 255)

def ramp(base, light=None, shadow=None):
    """3-tone colour ramp from a base colour (auto light/shadow if not given)."""
    b = np.array(base, float)
    l = np.array(light, float) if light else np.minimum(255, b * 1.25 + 30)
    s = np.array(shadow, float) if shadow else b * 0.62
    return tuple(int(v) for v in s), tuple(int(v) for v in b), tuple(int(v) for v in l)

class Canvas:
    def __init__(self, w, h, scale=4):
        # Draw at `scale`× then downsample, so curves come out as clean pixel shapes.
        self.w, self.h, self.k = w, h, scale
        self.rgb = np.zeros((h, w, 3), np.uint8)
        self.alpha = np.zeros((h, w), bool)
        self.part_id = np.full((h, w), -1, int)
        self._n = 0

    def _mask(self, fn):
        img = Image.new('L', (self.w * self.k, self.h * self.k), 0)
        d = ImageDraw.Draw(img)
        fn(d, self.k)
        small = img.resize((self.w, self.h), Image.BOX)
        return np.array(small) >= 128

    def _paint(self, mask, colors, shade=True, rim=1):
        s, b, l = colors
        self._n += 1
        pid = self._n
        self.rgb[mask] = b
        if shade:
            pad = np.pad(mask, rim + 1, constant_values=False)
            H, W = mask.shape
            def shifted(dy, dx):
                return pad[rim + 1 + dy: rim + 1 + dy + H, rim + 1 + dx: rim + 1 + dx + W]
            lit = mask & (~shifted(-1, -1) | ~shifted(-1, 0))
            dark = mask & (~shifted(1, 1) | ~shifted(1, 0) | ~shifted(0, 1))
            if rim > 1:
                dark |= mask & ~shifted(rim, rim)
            self.rgb[dark] = s
            self.rgb[lit & ~dark] = l
        self.alpha |= mask
        self.part_id[mask] = pid
        return mask

    # shapes (coordinates in final pixels; floats welcome)
    def poly(self, pts, colors, **kw):
        return self._paint(self._mask(lambda d, k: d.polygon([(x * k, y * k) for x, y in pts], fill=255)), colors, **kw)

    def ellipse(self, cx, cy, rx, ry, colors, **kw):
        return self._paint(self._mask(lambda d, k: d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=255)), colors, **kw)

    def line(self, pts, width, colors, **kw):
        def fn(d, k):
            sp = [(x * k, y * k) for x, y in pts]
            d.line(sp, fill=255, width=max(1, int(width * k)), joint='curve')
            r = width * k / 2
            for x, y in sp:
                d.ellipse([x - r, y - r, x + r, y + r], fill=255)
        return self._paint(self._mask(fn), colors, **kw)

    def pixels(self, pts, color):
        """Hand-placed detail pixels (eyes, teeth, highlights) — no shading."""
        for x, y in pts:
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < self.w and 0 <= yi < self.h:
                self.rgb[yi, xi] = color
                self.alpha[yi, xi] = True

    def seams(self, color=None, darken=0.55):
        """Thin darker lines where one part overlaps another (separates arm from body, etc.)."""
        p = self.part_id
        edge = np.zeros_like(self.alpha)
        for dy, dx in ((0, 1), (1, 0)):
            a = p[: p.shape[0] - dy, : p.shape[1] - dx]
            b = p[dy:, dx:]
            diff = (a != b) & (a >= 0) & (b >= 0)
            # mark the pixel belonging to the LOWER (earlier) part, so the top part keeps its edge
            lower_first = diff & (a < b)
            lower_second = diff & (b < a)
            edge[: p.shape[0] - dy, : p.shape[1] - dx] |= lower_first
            edge[dy:, dx:] |= lower_second
        if color is not None:
            self.rgb[edge] = color
        else:
            self.rgb[edge] = (self.rgb[edge] * darken).astype(np.uint8)

    def render(self, bg=GREEN, outline=True):
        img = np.zeros((self.h, self.w, 3), np.uint8)
        img[:] = bg
        a = self.alpha
        if outline:
            pad = np.pad(a, 1)
            ring = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~a
            img[ring] = OUTLINE
        img[a] = self.rgb[a]
        return img

def sheet(frames, upscale=8, gap=6, bg=GREEN):
    """Lay pose images side by side (with empty space between), upscaled like an AI still."""
    h = max(f.shape[0] for f in frames)
    w = sum(f.shape[1] for f in frames) + gap * (len(frames) + 1)
    out = np.zeros((h + gap * 2, w, 3), np.uint8); out[:] = bg
    x = gap
    for f in frames:
        out[gap + h - f.shape[0]: gap + h, x: x + f.shape[1]] = f
        x += f.shape[1] + gap
    im = Image.fromarray(out)
    return im.resize((im.width * upscale, im.height * upscale), Image.NEAREST)


def xf(angle_deg=0.0, pivot=(0, 0), dx=0.0, dy=0.0, sx=1.0, sy=1.0):
    """Point transform: scale and rotate around `pivot`, then translate."""
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    px, py = pivot
    def T(x, y):
        x0, y0 = (x - px) * sx, (y - py) * sy
        return (px + x0 * ca - y0 * sa + dx, py + x0 * sa + y0 * ca + dy)
    return T

def block(c, center, color, size=2):
    """A size×size block of one colour centred on a (transformed) point — for eyes."""
    x0, y0 = round(center[0] - size / 2 + 0.5) , round(center[1] - size / 2 + 0.5)
    c.pixels([(x0 + i, y0 + j) for i in range(size) for j in range(size)], color)


def render_rgba(c, outline=True):
    """Transparent-background version of Canvas.render (for game sprite sheets)."""
    a = c.alpha
    out = np.zeros((c.h, c.w, 4), np.uint8)
    if outline:
        pad = np.pad(a, 1)
        ring = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~a
        out[ring] = (*OUTLINE, 255)
    out[a, :3] = c.rgb[a]
    out[a, 3] = 255
    return out
