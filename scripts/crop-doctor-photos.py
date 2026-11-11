# Crops doctor photos to 4:5 portraits framed on the face (640x800 JPEG) for public/doctors/.
# The file name is the last part of the doctor's page address: /vrachi/.../kolova-lyudmila-mikhaylovna/
# -> public/doctors/kolova-lyudmila-mikhaylovna.jpg. Pages pick it up on their own (photoFor in src/lib/content.ts).
#   pip install pillow pillow-heif "opencv-python-headless<5"
#   python3 scripts/crop-doctor-photos.py jobs.json public/doctors
# jobs.json: [["path/to/original.jpg", "kolova-lyudmila-mikhaylovna"], ...]
# Transparent PNGs are put on a light grey backdrop like the studio photos.
import sys, os, json, cv2, numpy as np
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener; register_heif_opener()
Image.MAX_IMAGE_PIXELS = None
BG = (232, 231, 228)  # light grey, close to the studio backdrop in most photos
casc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
jobs = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
report = []
for src, slug in jobs:
    im = ImageOps.exif_transpose(Image.open(src))
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA'); bg = Image.new('RGBA', im.size, BG + (255,)); bg.alpha_composite(im); im = bg
    im = im.convert('RGB'); W, H = im.size
    s = 1600 / max(W, H) if max(W, H) > 1600 else 1
    small = cv2.cvtColor(np.array(im.resize((int(W * s), int(H * s)))), cv2.COLOR_RGB2GRAY)
    faces = casc.detectMultiScale(small, 1.08, 6, minSize=(int(small.shape[0] * 0.04),) * 2)
    if len(faces) == 0:
        report.append((slug, 'NO FACE', W, H)); continue
    x, y, w, h = [v / s for v in max(faces, key=lambda f: f[2] * f[3])]
    ch = h * 5.0; cw = ch * 0.8
    if cw > W: cw = W; ch = cw / 0.8
    if ch > H: ch = H; cw = ch * 0.8
    cx = x + w / 2; left = min(max(cx - cw / 2, 0), W - cw)
    y0 = min(max(y - 0.85 * h, 0), H - ch)
    crop = im.crop((round(left), round(y0), round(left + cw), round(y0 + ch)))
    size = (640, 800) if cw >= 640 else (int(cw), int(cw / 0.8))
    crop = crop.resize(size, Image.LANCZOS)
    crop.save(os.path.join(out, slug + '.jpg'), 'JPEG', quality=84, optimize=True, progressive=True)
    report.append((slug, 'ok', W, H, int(cw), round(h / H, 3)))
for r in report: print(*r)
