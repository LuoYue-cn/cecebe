#!/usr/bin/env python3
"""Generate original Mandarin narration in seven timed phrases with Edge TTS."""
import asyncio
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/audio/voice"
VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "-7%"
LINES = [
    "今天，你好奇什么？",
    "关于知识，关于关系，也关于自己。",
    "把一个问题，变成一次探索。",
    "认真回答，慢慢发现。",
    "看见你的知识版图，也看见下一步方向。",
    "把这份发现，分享给朋友。",
    "测测be。给好奇，一点答案。",
]
async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i, text in enumerate(LINES, 1):
        dest = OUT / f"line-{i:02}.mp3"
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(dest))
        print(f"{dest.name}: {text}")
asyncio.run(main())
