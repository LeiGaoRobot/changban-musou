# python sheet.py <prefix> [cols] [scale] -> shots/<prefix>_sheet.jpg
import sys, glob, os
from PIL import Image, ImageDraw
pre = sys.argv[1]; cols = int(sys.argv[2]) if len(sys.argv) > 2 else 5; sc = float(sys.argv[3]) if len(sys.argv) > 3 else 0.3
fs = sorted(f for f in glob.glob(os.path.join(os.path.dirname(__file__), 'shots', pre + '_*.jpg')) if not f.endswith('_sheet.jpg'))
ims = [Image.open(f) for f in fs]
w, h = int(ims[0].width * sc), int(ims[0].height * sc)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (w * cols, h * rows))
d = ImageDraw.Draw(S)
for k, (f, im) in enumerate(zip(fs, ims)):
    S.paste(im.resize((w, h)), ((k % cols) * w, (k // cols) * h)); d.text(((k % cols) * w + 4, (k // cols) * h + 2), os.path.basename(f)[len(pre)+1:-4], fill=(255, 255, 0))
S.save(os.path.join(os.path.dirname(__file__), 'shots', pre + '_sheet.jpg'), quality=88)
print(len(ims), S.size)
