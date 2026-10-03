#!/usr/bin/env python3
"""Render the promo from genuine mobile screenshots of ccb.h666h.com."""
from pathlib import Path
import subprocess
import sys
import numpy as np

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / 'assets' / 'real-pages'
OUT = ROOT / 'exports'
PREVIEW = ROOT / 'previews'
W, H, FPS = 1080, 1920, 30
PURPLE = '#7047BF'
INK = '#30283D'
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'

# Narration-aligned sections total 45 seconds, with a 0.6s restrained dissolve
# at each scene boundary.
BASE_HOLDS = [4, 6, 6, 1, 2, 2, 2, 9, 6, 7]
FILES = [
    '01-home-hero.png',
    '02-home-explore.png',
    '03-home-prompt.png',
    '04-test-intro.png',
    '05-question-first-selected.png',
    '06-question-middle-selected.png',
    '07-question-last-selected.png',
    '08-real-result.png',
    '09-test-share.png',
    '01-home-hero.png',
]
CAPTIONS = [
    ('00:00:00,450', '00:00:02,960', '今天，你好奇什么？'),
    ('00:00:04,250', '00:00:08,480', '关于知识，关于关系，也关于自己。'),
    ('00:00:10,350', '00:00:13,630', '把一个问题，变成一次探索。'),
    ('00:00:16,150', '00:00:19,120', '认真回答，慢慢发现。'),
    ('00:00:23,200', '00:00:26,780', '看见你的知识版图，也看见下一步方向。'),
    ('00:00:32,150', '00:00:35,320', '把这份发现，分享给朋友。'),
    ('00:00:38,050', '00:00:42,060', '测测be。给好奇，一点答案。'),
]


def prepare_page(filename, destination):
    image = Image.open(PAGES / filename).convert('RGB')
    target_ratio = W / H
    width, height = image.size
    ratio = width / height
    if ratio > target_ratio:
        crop_width = int(height * target_ratio)
        x = (width - crop_width) // 2
        image = image.crop((x, 0, x + crop_width, height))
    elif ratio < target_ratio:
        crop_height = int(width / target_ratio)
        # For long report/detail screenshots retain the top of the real page;
        # the mobile captures already place the relevant section in view.
        y = 250 if filename in {'08-real-result.png', '09-test-share.png'} else (height - crop_height) // 2
        image = image.crop((0, y, width, y + crop_height))
    image.resize((W, H), Image.Resampling.LANCZOS).save(destination, quality=95)


def add_domain_footer(image_path):
    image = Image.open(image_path).convert('RGBA')
    draw = ImageDraw.Draw(image, 'RGBA')
    font = ImageFont.truetype(FONT, 38)
    text = 'ccb.h666h.com'
    # Place the URL in the generous space between the live site's wordmark and
    # hero headline; keep the final CTA and form unobstructed.
    draw.text((52, 183), text, font=font, fill=PURPLE)
    image.convert('RGB').save(image_path, quality=95)


def add_caption(image, text):
    image = image.convert('RGBA')
    draw = ImageDraw.Draw(image, 'RGBA')
    font = ImageFont.truetype(FONT, 42)
    # Plain, generously sized subtitles retain the page's clean composition.
    # A warm outline preserves contrast without a floating card or banner.
    draw.text((W // 2, 1790), text, font=font, fill=INK, anchor='mm',
              stroke_width=4, stroke_fill='#F8F5ED')
    return image.convert('RGB')


def write_srt(path):
    text = '\n\n'.join(f'{i}\n{a} --> {b}\n{caption}' for i, (a, b, caption) in enumerate(CAPTIONS, 1)) + '\n'
    path.write_text(text, encoding='utf-8')


def render():
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    normalized = []
    for index, filename in enumerate(FILES):
        path = PREVIEW / f'real-page-{index + 1:02}.jpg'
        prepare_page(filename, path)
        normalized.append(path)
    add_domain_footer(normalized[-1])
    Image.open(normalized[0]).save(OUT / '测测be-宣传封面.png', quality=96)
    srt = OUT / '测测be-给好奇一点答案.srt'
    write_srt(srt)

    scenes = [Image.open(path).convert('RGB') for path in normalized]
    caption_pairs = [(CAPTIONS[i][2], scene_id) for i, scene_id in [(1, 1), (2, 2), (3, 4), (4, 7)]]
    for caption, scene_id in caption_pairs:
        scenes[scene_id] = add_caption(scenes[scene_id], caption)

    # Native 30fps with exact still holds and eased 18-frame dissolves. No
    # per-frame resize or camera drift is applied, so text remains pixel-stable.
    picture = PREVIEW / 'picture-real-pages.mp4'
    ff = subprocess.Popen([
        'ffmpeg', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s:v', f'{W}x{H}',
        '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'ultrafast',
        '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(picture),
    ], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    transition_frames = round(0.6 * FPS)
    try:
        for index, scene in enumerate(scenes):
            hold_frames = BASE_HOLDS[index] * FPS
            if index < len(scenes) - 1:
                hold_frames -= transition_frames
            frame = scene.tobytes()
            for _ in range(hold_frames):
                ff.stdin.write(frame)
            if index < len(scenes) - 1:
                start = np.asarray(scene, dtype=np.float32)
                end = np.asarray(scenes[index + 1], dtype=np.float32)
                for n in range(transition_frames):
                    alpha = (n + 1) / transition_frames
                    alpha = alpha * alpha * (3 - 2 * alpha)
                    frame = (start * (1 - alpha) + end * alpha).clip(0, 255).astype(np.uint8)
                    ff.stdin.write(frame.tobytes())
        ff.stdin.close()
        stderr = ff.stderr.read().decode('utf-8', 'replace')
        status = ff.wait()
        if status:
            raise RuntimeError(stderr[-9000:])
    except Exception:
        if ff.stdin and not ff.stdin.closed:
            ff.stdin.close()
        ff.kill()
        raise

    # Rebuild narration/music mix from the updated spoken line 5.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import render_video
    render_video.ffmpeg_mix()
    final = OUT / '测测be-给好奇一点答案-竖屏完整版.mp4'
    mux = subprocess.run([
        'ffmpeg', '-y', '-i', str(PREVIEW / 'picture-real-pages.mp4'),
        '-i', str(OUT / '测测be-配乐混音母带.wav'), '-map', '0:v:0', '-map', '1:a:0',
        '-t', '45', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '224k', '-ar', '48000',
        '-movflags', '+faststart', '-shortest', str(final),
    ], text=True, capture_output=True)
    if mux.returncode:
        raise RuntimeError(mux.stderr[-9000:])
    preview_times = [1, 5, 11, 17, 27, 34, 41, 44]
    thumbnails = []
    for sec in preview_times:
        image_path = PREVIEW / f'final-{sec:02}.png'
        subprocess.run([
            'ffmpeg', '-v', 'error', '-y', '-ss', str(sec), '-i', str(final),
            '-frames:v', '1', str(image_path),
        ], check=True)
        subprocess.run([
            'ffmpeg', '-v', 'error', '-y', '-ss', str(sec), '-i', str(final),
            '-frames:v', '1', str(PREVIEW / f'frame-{sec:02}.png'),
        ], check=True)
        thumb = Image.open(image_path).convert('RGB')
        thumb.thumbnail((250, 444), Image.Resampling.LANCZOS)
        tile = Image.new('RGB', (270, 480), 'white')
        tile.paste(thumb, ((270 - thumb.width) // 2, 26))
        ImageDraw.Draw(tile).text((10, 6), f'{sec}s', fill=INK)
        thumbnails.append(tile)
    sheet = Image.new('RGB', (270 * 4, 480 * 2), '#E7DED2')
    for i, thumb in enumerate(thumbnails):
        sheet.paste(thumb, ((i % 4) * 270, (i // 4) * 480))
    sheet.save(PREVIEW / 'storyboard-contact-sheet.jpg', quality=92)
    print(f'Finished real-page promo: {final}')


if __name__ == '__main__':
    render()
