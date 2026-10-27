"""从短片导出网站用的素材（静帧裁切 + 网页版视频）。在 site/ 目录下运行：

    python scripts/make_assets.py ../film/out/QRveo-HeroFilm-v6.mp4

需要 film/node_modules 里自带的 ffmpeg；只依赖 Pillow。
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
FILM = os.path.join(SITE, "..", "film")
FFMPEG = os.path.join(FILM, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
PUB = os.path.join(SITE, "public")

# 名称: (秒, 裁切框 x0,y0,x1,y1（1920×1080 画面坐标），输出宽度)
STILLS = {
    "paso-1": (5.6, (1010, 60, 1870, 660), 860),
    "paso-2": (7.0, (1010, 60, 1870, 660), 860),
    "paso-3": (9.0, (395, 116, 1255, 716), 860),
    "productos": (10.8, (1170, 20, 1890, 740), 720),
    "antes-chat": (2.65, (1318, 0, 1900, 1080), 582),
    "despues-video": (16.5, (1250, 20, 1830, 1080), 580),
}


def frame(video, t, out):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", str(t), "-i", video, "-frames:v", "1", out], check=True)
    return Image.open(out).convert("RGB")


def main(video):
    os.makedirs(os.path.join(PUB, "img"), exist_ok=True)
    os.makedirs(os.path.join(PUB, "video"), exist_ok=True)
    tmp = tempfile.mkdtemp()
    for name, (t, box, w) in STILLS.items():
        im = frame(video, t, os.path.join(tmp, name + ".png")).crop(box)
        if im.width != w:
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(os.path.join(PUB, "img", name + ".webp"), quality=84, method=6)
        print(name, im.size)

    # 首屏海报（第一帧）与分享图（落版，裁成 1200×630）
    first = frame(video, 0.02, os.path.join(tmp, "poster.png"))
    first.save(os.path.join(PUB, "img", "film-poster.webp"), quality=80, method=6)
    last = frame(video, 21.2, os.path.join(tmp, "end.png"))
    og = last.crop((0, 36, 1920, 1044)).resize((1200, 630), Image.LANCZOS)
    og.save(os.path.join(PUB, "img", "og.jpg"), quality=86)

    # 网页版落版的背景照片（与短片同一张）
    Image.open(os.path.join(FILM, "public", "img", "counter2.jpg")).convert("RGB").save(
        os.path.join(PUB, "img", "mesa.webp"), quality=84, method=6)

    # 网页版视频：静音、较高压缩、faststart
    out = os.path.join(PUB, "video", "qrveo-hero.mp4")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", video, "-an", "-c:v", "libx264", "-preset", "slow",
                    "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)
    print("video", round(os.path.getsize(out) / 1e6, 2), "MB")


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
