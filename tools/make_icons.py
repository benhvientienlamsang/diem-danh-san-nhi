"""Tạo icon BV TLS: nền đỏ, chữ trắng (web PWA + Android)."""
import os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RED = (198, 40, 40)
FONT = "/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf"
if not os.path.exists(FONT):
    FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"

def draw(size, content=0.74, round_px=0, transparent=False):
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0) if transparent else RED + (255,))
    if round_px and not transparent:
        img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=round_px * 4, fill=255)
        img.paste(Image.new("RGBA", (S, S), RED + (255,)), (0, 0), m)
    d = ImageDraw.Draw(img)
    box = S * content
    lines = ["BV", "TLS"]
    # cỡ chữ sao cho dòng "TLS" vừa chiều ngang vùng nội dung
    fs = 10
    while True:
        f = ImageFont.truetype(FONT, fs)
        w = d.textbbox((0, 0), "TLS", font=f)[2]
        h = sum(d.textbbox((0, 0), t, font=f)[3] - d.textbbox((0, 0), t, font=f)[1] for t in lines)
        if w > box or h * 1.22 > box:
            fs -= 2; break
        fs += 2
    f = ImageFont.truetype(FONT, fs)
    bbs = [d.textbbox((0, 0), t, font=f) for t in lines]
    hs = [b[3] - b[1] for b in bbs]
    gap = hs[0] * 0.22
    total = sum(hs) + gap
    y = (S - total) / 2
    for t, b, h in zip(lines, bbs, hs):
        w = b[2] - b[0]
        d.text(((S - w) / 2 - b[0], y - b[1]), t, font=f, fill=(255, 255, 255, 255))
        y += h + gap
    return img.resize((size, size), Image.LANCZOS)

def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)  # PNG không ghi metadata

web = os.path.join(ROOT, "web", "icons")
save(draw(512), os.path.join(web, "icon-512.png"))
save(draw(192), os.path.join(web, "icon-192.png"))
save(draw(512, content=0.56), os.path.join(web, "icon-maskable-512.png"))
save(draw(180).convert("RGB"), os.path.join(web, "apple-touch-icon.png"))

if len(sys.argv) > 1:  # thư mục res của Android
    res = sys.argv[1]
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for k, m in dens.items():
        s = int(48 * m)
        save(draw(s, content=0.70, round_px=int(s * 0.18)), os.path.join(res, f"mipmap-{k}", "ic_launcher.png"))
        rnd = draw(s, content=0.62)
        mask = Image.new("L", (s, s), 0); ImageDraw.Draw(mask).ellipse([0, 0, s - 1, s - 1], fill=255)
        out = Image.new("RGBA", (s, s), (0, 0, 0, 0)); out.paste(rnd, (0, 0), mask)
        save(out, os.path.join(res, f"mipmap-{k}", "ic_launcher_round.png"))
        fg = int(108 * m)
        save(draw(fg, content=0.40, transparent=True), os.path.join(res, f"mipmap-{k}", "ic_launcher_foreground.png"))
print("ok")
