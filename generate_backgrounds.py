"""
Generate fantasy tower background images for カラータイル・ロマンス.
Outputs 1280x720 JPG files to public/assets/bg/.
"""
from PIL import Image, ImageDraw, ImageFilter
import math, random, os

W, H = 1280, 720
OUT = "color-tiles-romance/public/assets/bg"

def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def gradient(img, top_col, bot_col, mid_col=None):
    """Fill image with a vertical gradient."""
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        if mid_col and t < 0.5:
            c = lerp_color(top_col, mid_col, t * 2)
        elif mid_col:
            c = lerp_color(mid_col, bot_col, (t - 0.5) * 2)
        else:
            c = lerp_color(top_col, bot_col, t)
        for x in range(W):
            px[x, y] = c

def stone_texture(img, color, opacity=40, seed=1):
    """Overlay a simple stone/brick noise texture."""
    rng = random.Random(seed)
    draw = ImageDraw.Draw(img, 'RGBA')
    # Horizontal mortar lines (every ~60px)
    for y in range(0, H, 60):
        draw.line([(0, y), (W, y)], fill=(*color, 25), width=2)
    # Brick rows with offset
    row = 0
    for y in range(0, H, 60):
        offset = (row % 2) * 80
        for x in range(-80 + offset, W + 80, 160):
            draw.line([(x, y), (x, y + 60)], fill=(*color, 20), width=2)
        row += 1
    # Noise spots
    for _ in range(3000):
        x = rng.randint(0, W - 1)
        y = rng.randint(0, H - 1)
        v = rng.randint(-opacity, opacity)
        px = img.getpixel((x, y))
        img.putpixel((x, y), tuple(max(0, min(255, px[i] + v)) for i in range(3)))

def arch(draw, cx, top_y, w, h, col, opacity=180):
    """Draw a gothic arch silhouette."""
    # Two pillars
    pw = w // 8
    draw.rectangle([cx - w // 2, top_y, cx - w // 2 + pw, top_y + h],
                   fill=(*col, opacity))
    draw.rectangle([cx + w // 2 - pw, top_y, cx + w // 2, top_y + h],
                   fill=(*col, opacity))
    # Arch curve (semi-ellipse)
    ah = w // 2
    draw.ellipse([cx - w // 2 + pw, top_y - ah // 2,
                  cx + w // 2 - pw, top_y + ah // 2],
                 outline=(*col, opacity), width=3)

def add_light_ray(img, cx, cy, col, count=8, alpha_max=60):
    """Add radial light rays from a point."""
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for i in range(count):
        angle = math.radians(i * 360 / count)
        length = max(W, H)
        ex = cx + int(math.cos(angle) * length)
        ey = cy + int(math.sin(angle) * length)
        draw.line([(cx, cy), (ex, ey)],
                  fill=(*col, alpha_max // (i % 3 + 1)), width=max(1, 40 - i * 4))
    img.paste(overlay, mask=overlay)

def add_glow(img, cx, cy, col, radius=200, strength=80):
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for r in range(radius, 0, -20):
        a = int(strength * (1 - r / radius) ** 2)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*col, a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius // 4))
    img.paste(glow, mask=glow)

def floor_line(draw, color, alpha=60):
    """Draw a perspective floor grid."""
    vx, vy = W // 2, H * 2 // 3
    for i in range(-10, 11):
        x = W // 2 + i * 80
        draw.line([(x, H), (vx, vy)], fill=(*color, alpha), width=1)
    for j in range(0, 6):
        y = H * 2 // 3 + j * (H // 3 // 5)
        t = j / 5
        lw = int(W * 0.9 * (1 - (1 - t) * 0.8))
        draw.line([(W // 2 - lw // 2, y), (W // 2 + lw // 2, y)],
                  fill=(*color, alpha), width=1)

def save(img, name):
    path = os.path.join(OUT, name + ".jpg")
    img.convert('RGB').save(path, "JPEG", quality=85)
    print(f"  {name}.jpg")

# ─────────────────────────────────────────────
# 1. bg_tower_entrance – dark stone gate
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (8, 8, 18), (30, 25, 45), (15, 12, 30))
stone_texture(img, (60, 55, 80), opacity=30, seed=1)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 5, 340, H * 3 // 4, (20, 15, 35), opacity=220)
# Gate glow – faint moonlight through archway
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 3, (120, 100, 180), radius=180, strength=40)
floor_line(ImageDraw.Draw(Image.new('RGBA', (W, H))), (80, 70, 110))
save(img, "bg_tower_entrance")

# ─────────────────────────────────────────────
# 2. bg_tower_floor1_gray – gray stone lobby
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (20, 20, 25), (50, 48, 55), (35, 33, 40))
stone_texture(img, (100, 95, 110), opacity=35, seed=2)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 4, H // 6, 200, H * 2 // 3, (15, 15, 20), opacity=180)
arch(d, W * 3 // 4, H // 6, 200, H * 2 // 3, (15, 15, 20), opacity=180)
img.paste(ov, mask=ov)
add_glow(img, W // 2, 0, (180, 175, 200), radius=300, strength=30)
save(img, "bg_tower_floor1_gray")

# ─────────────────────────────────────────────
# 3. bg_tower_floor1_red_dim – red chamber dim
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (18, 5, 5), (55, 15, 15), (35, 8, 8))
stone_texture(img, (120, 40, 40), opacity=25, seed=3)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (30, 5, 5), opacity=200)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 2, (180, 40, 40), radius=250, strength=35)
save(img, "bg_tower_floor1_red_dim")

# ─────────────────────────────────────────────
# 4. bg_tower_floor1_red_bright – red chamber bright
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (60, 10, 10), (130, 40, 30), (90, 20, 18))
stone_texture(img, (200, 80, 60), opacity=30, seed=4)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (50, 8, 8), opacity=180)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 3, (255, 100, 60), radius=300, strength=60)
add_light_ray(img, W // 2, H // 3, (255, 120, 60), count=6, alpha_max=25)
save(img, "bg_tower_floor1_red_bright")

# ─────────────────────────────────────────────
# 5. bg_ch01_crimson – dramatic crimson climax
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (80, 0, 10), (20, 0, 5), (150, 10, 20))
stone_texture(img, (180, 20, 20), opacity=20, seed=5)
add_glow(img, W // 2, H // 2, (220, 30, 30), radius=400, strength=80)
add_light_ray(img, W // 2, H // 2, (255, 60, 40), count=12, alpha_max=40)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
d.rectangle([0, H * 3 // 4, W, H], fill=(10, 0, 0, 200))
img.paste(ov, mask=ov)
save(img, "bg_ch01_crimson")

# ─────────────────────────────────────────────
# 6. bg_atelier_morning – warm atelier/study
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (180, 120, 60), (220, 170, 100), (200, 145, 80))
stone_texture(img, (160, 120, 70), opacity=20, seed=6)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
# Window frame
wx, wy, ww, wh = W * 3 // 4, H // 8, 200, 280
d.rectangle([wx, wy, wx + ww, wy + wh], fill=(255, 220, 140, 60), outline=(100, 70, 30, 200), width=8)
d.line([(wx + ww // 2, wy), (wx + ww // 2, wy + wh)], fill=(100, 70, 30, 200), width=6)
d.line([(wx, wy + wh // 2), (wx + ww, wy + wh // 2)], fill=(100, 70, 30, 200), width=6)
img.paste(ov, mask=ov)
add_glow(img, wx + ww // 2, wy + wh // 2, (255, 230, 150), radius=350, strength=50)
save(img, "bg_atelier_morning")

# ─────────────────────────────────────────────
# 7. bg_tower_floor2_blue_dim – blue chamber dim
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (5, 10, 30), (15, 25, 65), (10, 18, 45))
stone_texture(img, (30, 60, 120), opacity=25, seed=7)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (5, 10, 40), opacity=200)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 2, (40, 80, 180), radius=250, strength=35)
save(img, "bg_tower_floor2_blue_dim")

# ─────────────────────────────────────────────
# 8. bg_tower_floor2_blue_bright – blue chamber bright
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (20, 40, 100), (60, 100, 200), (40, 70, 150))
stone_texture(img, (80, 130, 220), opacity=30, seed=8)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (10, 20, 80), opacity=180)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 3, (100, 160, 255), radius=320, strength=65)
add_light_ray(img, W // 2, H // 3, (120, 180, 255), count=6, alpha_max=25)
save(img, "bg_tower_floor2_blue_bright")

# ─────────────────────────────────────────────
# 9. bg_tower_floor2_blue_ice – ice chamber
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (160, 210, 240), (200, 235, 255), (180, 225, 248))
stone_texture(img, (200, 230, 255), opacity=15, seed=9)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
# Ice crystal shapes
rng = random.Random(9)
for _ in range(20):
    cx2 = rng.randint(0, W)
    cy2 = rng.randint(0, H * 2 // 3)
    s = rng.randint(20, 80)
    pts = []
    for a in range(0, 360, 60):
        r2 = s * rng.uniform(0.7, 1.3)
        pts.append((cx2 + int(r2 * math.cos(math.radians(a))),
                    cy2 + int(r2 * math.sin(math.radians(a)))))
    d.polygon(pts, fill=(220, 245, 255, 80), outline=(180, 220, 255, 150))
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 4, (220, 245, 255), radius=300, strength=50)
save(img, "bg_tower_floor2_blue_ice")

# ─────────────────────────────────────────────
# 10. bg_tower_floor3_green_dim – green dim
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (5, 18, 8), (15, 45, 20), (10, 30, 12))
stone_texture(img, (30, 100, 50), opacity=25, seed=10)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (5, 20, 8), opacity=200)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 2, (40, 150, 60), radius=250, strength=35)
save(img, "bg_tower_floor3_green_dim")

# ─────────────────────────────────────────────
# 11. bg_tower_floor3_green_bright – green bright
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (20, 70, 25), (60, 160, 70), (40, 115, 48))
stone_texture(img, (80, 180, 100), opacity=30, seed=11)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (10, 40, 12), opacity=180)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 3, (100, 220, 110), radius=320, strength=65)
add_light_ray(img, W // 2, H // 3, (120, 230, 130), count=6, alpha_max=25)
save(img, "bg_tower_floor3_green_bright")

# ─────────────────────────────────────────────
# 12. bg_tower_floor3_green_forest – vine corridor
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (10, 35, 10), (40, 100, 35), (25, 65, 20))
stone_texture(img, (40, 120, 50), opacity=20, seed=12)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
rng = random.Random(12)
for _ in range(30):
    sx = rng.randint(0, W)
    sy = 0
    for j in range(20):
        ex = sx + rng.randint(-15, 15)
        ey = sy + rng.randint(15, 40)
        d.line([(sx, sy), (ex, ey)], fill=(20, 100, 30, 180), width=rng.randint(2, 5))
        sx, sy = ex, ey
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 3, (80, 200, 80), radius=280, strength=40)
save(img, "bg_tower_floor3_green_forest")

# ─────────────────────────────────────────────
# 13. bg_tower_floor4_yellow_dim – yellow dim
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (25, 20, 5), (65, 50, 10), (45, 35, 8))
stone_texture(img, (140, 110, 30), opacity=25, seed=13)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (30, 22, 5), opacity=200)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 2, (180, 150, 40), radius=250, strength=35)
save(img, "bg_tower_floor4_yellow_dim")

# ─────────────────────────────────────────────
# 14. bg_tower_floor4_yellow_bright – golden bright
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (100, 80, 10), (220, 180, 50), (160, 130, 30))
stone_texture(img, (220, 190, 80), opacity=30, seed=14)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (60, 45, 5), opacity=180)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 3, (255, 220, 80), radius=320, strength=70)
add_light_ray(img, W // 2, H // 3, (255, 230, 100), count=8, alpha_max=30)
save(img, "bg_tower_floor4_yellow_bright")

# ─────────────────────────────────────────────
# 15. bg_tower_floor4_yellow_clock – clock tower
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (50, 40, 10), (120, 100, 30), (85, 68, 18))
stone_texture(img, (160, 130, 50), opacity=25, seed=15)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
# Giant clock face
cr = 160
cx2, cy2 = W // 2, H // 3
d.ellipse([cx2 - cr, cy2 - cr, cx2 + cr, cy2 + cr],
          outline=(200, 170, 60, 200), width=8)
d.ellipse([cx2 - cr + 20, cy2 - cr + 20, cx2 + cr - 20, cy2 + cr - 20],
          fill=(20, 15, 5, 180))
for h_tick in range(12):
    angle = math.radians(h_tick * 30 - 90)
    x1 = cx2 + int((cr - 15) * math.cos(angle))
    y1 = cy2 + int((cr - 15) * math.sin(angle))
    x2 = cx2 + int((cr - 5) * math.cos(angle))
    y2 = cy2 + int((cr - 5) * math.sin(angle))
    d.line([(x1, y1), (x2, y2)], fill=(200, 170, 60, 200), width=4)
# Clock hands
d.line([(cx2, cy2), (cx2 + int(cr * 0.6 * math.cos(math.radians(-60))),
                     cy2 + int(cr * 0.6 * math.sin(math.radians(-60))))],
       fill=(220, 190, 80, 230), width=5)
d.line([(cx2, cy2), (cx2 + int(cr * 0.9 * math.cos(math.radians(30))),
                     cy2 + int(cr * 0.9 * math.sin(math.radians(30))))],
       fill=(220, 190, 80, 230), width=3)
img.paste(ov, mask=ov)
add_glow(img, cx2, cy2, (255, 220, 80), radius=250, strength=50)
save(img, "bg_tower_floor4_yellow_clock")

# ─────────────────────────────────────────────
# 16. bg_tower_floor5_purple_dim – purple dim
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (15, 5, 25), (40, 15, 65), (28, 10, 45))
stone_texture(img, (90, 40, 130), opacity=25, seed=16)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 300, H * 3 // 4, (20, 5, 35), opacity=200)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 2, (120, 50, 200), radius=250, strength=35)
save(img, "bg_tower_floor5_purple_dim")

# ─────────────────────────────────────────────
# 17. bg_tower_floor5_purple_dark – very dark purple
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (5, 0, 12), (18, 5, 35), (10, 2, 22))
stone_texture(img, (60, 20, 90), opacity=15, seed=17)
add_glow(img, W // 2, H // 2, (80, 20, 140), radius=200, strength=25)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
arch(d, W // 2, H // 6, 340, H * 3 // 4, (8, 2, 18), opacity=220)
img.paste(ov, mask=ov)
save(img, "bg_tower_floor5_purple_dark")

# ─────────────────────────────────────────────
# 18. bg_tower_floor5_purple_final – final battle
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (60, 10, 100), (20, 0, 40), (120, 20, 180))
stone_texture(img, (150, 50, 200), opacity=20, seed=18)
add_glow(img, W // 2, H // 2, (200, 80, 255), radius=400, strength=90)
add_light_ray(img, W // 2, H // 2, (220, 100, 255), count=16, alpha_max=35)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
d.rectangle([0, H * 4 // 5, W, H], fill=(5, 0, 10, 220))
img.paste(ov, mask=ov)
save(img, "bg_tower_floor5_purple_final")

# ─────────────────────────────────────────────
# 19. bg_tower_floor5_rainbow – rainbow ending
# ─────────────────────────────────────────────
img = Image.new('RGB', (W, H))
gradient(img, (10, 5, 25), (30, 20, 60), (20, 12, 40))
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
# Rainbow arcs
colors_rainbow = [
    (255, 60, 60), (255, 150, 30), (255, 230, 30),
    (80, 220, 60), (50, 160, 255), (120, 60, 240), (220, 80, 240)
]
for i, col in enumerate(colors_rainbow):
    r = 700 - i * 30
    cy2 = H + 100
    d.arc([W // 2 - r, cy2 - r, W // 2 + r, cy2 + r],
          start=200, end=340, fill=(*col, 180 - i * 15), width=18)
img.paste(ov, mask=ov)
add_glow(img, W // 2, H // 2, (200, 180, 255), radius=350, strength=40)
# Stars
rng = random.Random(19)
draw2 = ImageDraw.Draw(img)
for _ in range(200):
    sx = rng.randint(0, W)
    sy = rng.randint(0, H * 3 // 5)
    r2 = rng.uniform(1, 3)
    br = rng.randint(180, 255)
    draw2.ellipse([sx - r2, sy - r2, sx + r2, sy + r2], fill=(br, br, br))
save(img, "bg_tower_floor5_rainbow")

print(f"\nAll 19 backgrounds generated in {OUT}/")
