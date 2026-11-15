"""Repair only QR pixels in the six public demo images; verify every replacement."""

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw

WATCH_URL = "https://mx.qrveo.com/videos/hceea401fc1874e0fc77733500cc84cb_h"
NAMES = ["consola-qr.webp", "consola-qr-en.webp", "consola-qr-ja.webp",
         "consola-qr-ko.webp", "consola-qr-zh.webp", "escena-qr.webp"]
PREVIEWS = [(55 + 132 * i, 174, 129 + 132 * i, 248) for i in range(5)]
LARGE = (843, 148, 1028, 333)
SCENE = np.array([(322, 176), (515, 163), (528, 356), (335, 369)], dtype=float)


def matrix():
    library = Path(__file__).resolve().parents[1] / "src/vendor/qrcode.js"
    code = """
const qr = require(process.argv[1])(0, "M");
qr.addData(process.argv[2]); qr.make();
console.log(JSON.stringify(Array.from({length: qr.getModuleCount()}, (_, y) =>
  Array.from({length: qr.getModuleCount()}, (_, x) => qr.isDark(y, x)))));
"""
    return json.loads(subprocess.check_output(
        ["node", "-e", code, str(library), WATCH_URL], text=True, encoding="utf-8",
    ))


def qr_picture(rows, style=0, quiet=4):
    n, unit = len(rows), 16
    image = Image.new("RGBA", ((n + quiet * 2) * unit,) * 2, "white")
    draw = ImageDraw.Draw(image)
    eyes = [(0, 0), (n - 7, 0), (0, n - 7)]
    for y in range(n):
        for x in range(n):
            if not rows[y][x] or any(ex <= x < ex + 7 and ey <= y < ey + 7 for ex, ey in eyes):
                continue
            box = ((x + quiet) * unit, (y + quiet) * unit,
                   (x + quiet + 1) * unit - 1, (y + quiet + 1) * unit - 1)
            if style >= 3:
                draw.ellipse(box, fill="black")
            elif style:
                draw.rounded_rectangle(box, radius=3 if style == 1 else 5, fill="black")
            else:
                draw.rectangle(box, fill="black")
    for x, y in eyes:
        for inset, color in [(0, "black"), (1, "white"), (2, "black")]:
            x0, y0 = (x + quiet + inset) * unit, (y + quiet + inset) * unit
            span = (7 - inset * 2) * unit
            box = (x0, y0, x0 + span - 1, y0 + span - 1)
            if style == 4:
                draw.ellipse(box, fill=color)
            elif style:
                draw.rounded_rectangle(box, radius=(7 - inset * 2) * (3 if style == 1 else 6), fill=color)
            else:
                draw.rectangle(box, fill=color)
    return image


def paste_scene(original, qr):
    # Map the new square onto the existing tilted sticker, leaving its text intact.
    quad = (SCENE - SCENE.mean(axis=0)) * 1.045 + SCENE.mean(axis=0)
    scale = 4
    destination = quad * scale
    source = [(0, 0), (qr.width, 0), (qr.width, qr.height), (0, qr.height)]
    equations, values = [], []
    for (x, y), (u, v) in zip(destination, source):
        equations.extend([[x, y, 1, 0, 0, 0, -u * x, -u * y],
                          [0, 0, 0, x, y, 1, -v * x, -v * y]])
        values.extend([u, v])
    coefficients = np.linalg.solve(np.array(equations), np.array(values))
    overlay = qr.transform(
        (original.width * scale, original.height * scale), Image.Transform.PERSPECTIVE,
        coefficients, Image.Resampling.BICUBIC, fillcolor=(0, 0, 0, 0),
    ).resize(original.size, Image.Resampling.LANCZOS)
    return Image.alpha_composite(original.convert("RGBA"), overlay).convert("RGB")


def valid_codes(image, zxingcpp):
    return [code for code in zxingcpp.read_barcodes(
        image, formats=zxingcpp.BarcodeFormat.QRCode,
    ) if code.valid]


def verify(image, scene, zxingcpp):
    if scene:
        codes = valid_codes(image, zxingcpp)
        assert codes and {code.text for code in codes} == {WATCH_URL}, "Scene QR is unreadable or has an unexpected target"
        return
    for box in [*PREVIEWS, LARGE]:
        crop = image.crop((box[0] - 7, box[1] - 7, box[2] + 7, box[3] + 7))
        codes = valid_codes(crop, zxingcpp)
        if not codes:
            codes = valid_codes(crop.resize((crop.width * 3, crop.height * 3)), zxingcpp)
        assert codes and {code.text for code in codes} == {WATCH_URL}, "QR is unreadable or has an unexpected target at {}".format(box)
    assert all(code.text == WATCH_URL for code in valid_codes(image, zxingcpp)), "A stale QR remains"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--decoder-path", type=Path)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if args.decoder_path:
        sys.path.insert(0, str(args.decoder_path.resolve()))
    import zxingcpp

    if args.verify_only:
        for name in NAMES:
            verify(Image.open(args.output / name).convert("RGB"), name == "escena-qr.webp", zxingcpp)
        print("PASS: all 31 QR regions decode to the public demo")
        return

    assert args.source.resolve() != args.output.resolve(), "Use a separate candidate output directory"
    args.output.mkdir(parents=True, exist_ok=False)
    rows = matrix()
    changes = []
    for name in NAMES:
        source = args.source / name
        original = Image.open(source).convert("RGB")
        if name == "escena-qr.webp":
            result = paste_scene(original, qr_picture(rows))
            allowed = [(310, 151, 541, 383)]
        else:
            assert original.size == (1100, 644), "Screenshot layout changed"
            result = original.copy()
            for style, box in enumerate(PREVIEWS):
                qr = qr_picture(rows, style=style, quiet=1).convert("RGB")
                result.paste(qr.resize((box[2] - box[0], box[3] - box[1]), Image.Resampling.LANCZOS), box[:2])
            qr = qr_picture(rows).convert("RGB")
            result.paste(qr.resize((LARGE[2] - LARGE[0], LARGE[3] - LARGE[1]), Image.Resampling.LANCZOS), LARGE[:2])
            allowed = [*PREVIEWS, LARGE]
        difference = ImageChops.difference(original, result)
        draw = ImageDraw.Draw(difference)
        for left, top, right, bottom in allowed:
            draw.rectangle((left, top, right, bottom), fill=(0, 0, 0))
        assert difference.getbbox() is None, "Pixels outside the QR areas changed"
        target = args.output / name
        result.save(target, format="WEBP", lossless=True, method=6)
        saved = Image.open(target).convert("RGB")
        assert saved.size == original.size
        assert ImageChops.difference(saved, result).getbbox() is None
        verify(saved, name == "escena-qr.webp", zxingcpp)
        changes.append({
            "name": name,
            "before_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "bytes": target.stat().st_size,
        })
    (args.output / "verification.json").write_text(
        json.dumps({"target": WATCH_URL, "qr_regions": 31, "files": changes}, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({"images": len(changes), "qr_regions": 31, "target": WATCH_URL}))


if __name__ == "__main__":
    main()
