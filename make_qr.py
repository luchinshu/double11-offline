import sys, qrcode
from PIL import Image, ImageDraw

# 門市 QR 碼預設指向 GitHub Pages 正式頁；也可用參數自訂：
#   python3 make_qr.py "https://xxx.github.io/double11-offline/?store=誠品台茂店" qr_taoyuan.png
DEFAULT_URL = "https://luxiaolun88-ervin.github.io/double11-offline/"

url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
out = sys.argv[2] if len(sys.argv) > 2 else "qr_store.png"

q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=20, border=2)
q.add_data(url); q.make(fit=True)
img = q.make_image(fill_color="#5C2331", back_color="#FBF6EE").convert("RGB")
w, h = img.size; pad = 60
c = Image.new("RGB", (w + 2 * pad, h + 2 * pad), "#FBF6EE"); c.paste(img, (pad, pad))
d = ImageDraw.Draw(c)
for i in (10, 22): d.rectangle([i, i, c.width - 1 - i, c.height - 1 - i], outline="#C6A15B", width=4 if i == 10 else 2)
c.save(out); print(out, c.size)
