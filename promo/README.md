# 测测be宣传片工程

当前成片为约 45 秒的 9:16 产品宣传片，1080×1920、30 fps、H.264/AAC、MP4，配普通话旁白、原创氛围配乐、轻音效、较大烧录字幕及独立 SRT。画面使用网站真实移动端页面截图；镜头固定，只在场景交界处做 0.6 秒柔和溶解，不做画面缩放或镜头漂移。

## 重建

```bash
node promo/scripts/capture_real_pages.mjs
python3 promo/scripts/make_voice.py
python3 promo/scripts/make_audio.py
python3 promo/scripts/render_real_video.py
```

需要 Node.js、Playwright 和 Chromium，以及 FFmpeg、Pillow、NumPy、Noto Sans CJK SC 字体和可用的 edge-tts 服务。`capture_real_pages.mjs` 只浏览和截图，不会生成测试、提交答案或创建分享链接。为了拍到真实结果页，本次成片使用了一条实际完成的公开计算机知识测试结果；该答卷全部正确，令公开完成数增加了 1。

旁白为 Microsoft Edge TTS 的 zh-CN-XiaoxiaoNeural，授权和服务使用条件见 `licenses/README.md`。配乐和音效由工程脚本合成，无外部音频素材。

正式输出在 `promo/exports/`：MP4、真实页面封面 PNG、SRT、独立旁白 WAV 和混音母带。脚本、页面截图与音频素材留在本目录。短版不在本工程范围。
