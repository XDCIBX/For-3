from PIL import Image, ImageFilter, ImageDraw
OUT = __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '../../steam/art/')
wide = Image.open('ka_wide.png').convert('RGB')   # 2560x1200
tall = Image.open('ka_tall.png').convert('RGB')   # 1200x1500
logo = Image.open('logo_1280x720.png').convert('RGBA')
logo = logo.crop(logo.getbbox())                  # плотно обрезанный логотип

def crop_to(img, aspect, cx=0.5, cy=0.5):
    w, h = img.size
    if w / h > aspect:
        nw = int(h * aspect); x = int((w - nw) * cx); return img.crop((x, 0, x + nw, h))
    nh = int(w / aspect); y = int((h - nh) * cy); return img.crop((0, y, w, y + nh))

def shade(img, box, strength=150):
    """Мягкое затемнение под логотипом: эллипс с размытым краем."""
    w, h = img.size
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).ellipse(box, fill=strength)
    m = m.filter(ImageFilter.GaussianBlur(max(w, h) * 0.05))
    dark = Image.new('RGB', (w, h), (12, 6, 10))
    return Image.composite(dark, img, m)

def place_logo(img, width_frac, cx, cy):
    w, h = img.size
    lw = int(w * width_frac)
    lg = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    x = int(cx * w - lg.width / 2); y = int(cy * h - lg.height / 2)
    out = img.convert('RGBA'); out.alpha_composite(lg, (max(0, x), max(0, y)))
    return out.convert('RGB'), (x, y, x + lg.width, y + lg.height)

def make(name, base, size, aspect_cx, aspect_cy, logo_w, lcx, lcy, logo_on=True):
    img = crop_to(base, size[0] / size[1], aspect_cx, aspect_cy).resize(size, Image.LANCZOS)
    if logo_on:
        w, h = size
        lw = w * logo_w; lh = lw * logo.height / logo.width
        img = shade(img, (lcx * w - lw * 0.75, lcy * h - lh * 0.8, lcx * w + lw * 0.75, lcy * h + lh * 0.8))
        img, _ = place_logo(img, logo_w, lcx, lcy)
    img.save(OUT + name, optimize=True)
    print(name, img.size)

# Магазин
make('header_capsule_920x430.png', wide, (920, 430), 0.5, 0.5, 0.30, 0.2, 0.3)
make('small_capsule_462x174.png', wide, (462, 174), 0.45, 0.45, 0.40, 0.24, 0.5)
make('main_capsule_1232x706.png', wide, (1232, 706), 0.55, 0.5, 0.30, 0.2, 0.28)
make('vertical_capsule_748x896.png', tall, (748, 896), 0.5, 0.2, 0.62, 0.5, 0.17)
# Библиотека
make('library_capsule_600x900.png', tall, (600, 900), 0.5, 0.2, 0.7, 0.5, 0.16)
make('library_header_920x430.png', wide, (920, 430), 0.5, 0.5, 0.30, 0.2, 0.3)
make('library_hero_3840x1240.png', wide, (3840, 1240), 0.5, 0.55, 0, 0, 0, logo_on=False)
# Фон страницы магазина: размытый и приглушённый кадр
bg = crop_to(wide, 1438 / 810).resize((1438, 810), Image.LANCZOS).filter(ImageFilter.GaussianBlur(6))
bg = Image.blend(bg, Image.new('RGB', bg.size, (20, 10, 14)), 0.45); bg.save(OUT + 'page_background_1438x810.png', optimize=True); print('page_background', bg.size)
# Логотип для библиотеки (прозрачный)
lg = logo.copy(); lg.thumbnail((1280, 720), Image.LANCZOS); canvas = Image.new('RGBA', (1280, 720), (0, 0, 0, 0))
canvas.alpha_composite(lg, ((1280 - lg.width) // 2, (720 - lg.height) // 2)); canvas.save(OUT + 'library_logo_1280x720.png', optimize=True); print('library_logo', canvas.size)
# Иконка сообщества
ic = Image.open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '../../client/assets/icon-only.png')).convert('RGB').resize((184, 184), Image.LANCZOS); ic.save(OUT + 'community_icon_184x184.jpg', quality=92); print('icon', ic.size)
