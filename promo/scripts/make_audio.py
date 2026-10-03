#!/usr/bin/env python3
"""Synthesize an original 45-second ambient cue and restrained UI sound effects."""
from pathlib import Path
import numpy as np
import wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/audio"
SR, DUR = 48000, 45.0

def save_wav(path, samples):
    samples = np.clip(samples, -1, 1)
    pcm = (samples * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    n = int(SR * DUR)
    t = np.arange(n, dtype=np.float64) / SR
    # D major family of open, warm voicings: D, A, Bm, G, D, A.
    chords = [
        (73.416, 110.0, 146.832, 220.0),
        (55.0, 82.407, 110.0, 164.814),
        (61.735, 92.499, 123.471, 185.0),
        (49.0, 73.416, 98.0, 146.832),
        (73.416, 110.0, 146.832, 220.0),
        (55.0, 82.407, 110.0, 164.814),
    ]
    bars = 7.5
    music = np.zeros(n, dtype=np.float64)
    for i, freqs in enumerate(chords):
        mask = (t >= i * bars) & (t < min((i + 1) * bars, DUR))
        local = t[mask] - i * bars
        fade_in = np.minimum(1, local / 1.8)
        fade_out = np.minimum(1, np.maximum(0, ((i + 1) * bars - t[mask]) / 1.2))
        env = fade_in * fade_out
        for j, freq in enumerate(freqs):
            phase = (i * 7 + j * 3) % 6
            detune = 1 + (0.0016 if j == 3 else -0.001 if j == 2 else 0)
            vibrato = np.sin(2 * np.pi * (0.08 + 0.025 * j) * local + phase) * (0.002 if j > 0 else 0.0008)
            music[mask] += env * (0.13 / (j + 1) ** 0.72) * np.sin(2 * np.pi * freq * detune * (1 + vibrato) * local + phase)
    # Delicate glassy, pentatonic notes, intentionally sparse and quiet.
    notes = [293.665, 369.994, 440.0, 554.365, 493.883, 369.994, 329.628, 440.0,
             587.33, 493.883, 440.0, 369.994, 659.255, 554.365, 493.883, 440.0]
    for k, start in enumerate([4.5, 7.8, 11.0, 14.2, 17.3, 20.8, 24.1, 27.4, 30.6, 34.0, 37.2, 40.0, 42.0]):
        f = notes[(k * 3 + 1) % len(notes)]
        ix = (t >= start) & (t < start + 2.6)
        u = t[ix] - start
        env = (1 - np.exp(-u * 16)) * np.exp(-u * 2.0)
        music[ix] += 0.042 * env * (np.sin(2 * np.pi * f * u) + 0.24 * np.sin(2 * np.pi * f * 2.01 * u))
    # A very light pulse enters after the opening; never becomes a loud beat.
    bpm = 76
    beat = 60 / bpm
    for i in range(12, int(DUR / beat)):
        start = i * beat
        ix = (t >= start) & (t < start + 0.17)
        u = t[ix] - start
        if i % 4 in (0, 2):
            music[ix] += 0.014 * np.exp(-u * 22) * np.sin(2 * np.pi * (88 - 34 * u) * u)
    # Warm stereo width and a slow 3.5-second fade at the tail.
    fade = np.minimum(1, t / 2.5) * np.minimum(1, np.maximum(0, (DUR - t) / 3.5))
    left = music * fade
    right = np.roll(music, int(SR * 0.013)) * fade
    stereo = np.column_stack((left, right))
    stereo *= 0.42 / max(0.001, np.max(np.abs(stereo)))
    save_wav(OUT / 'music/original-ambient.wav', stereo)

    # Self-generated short, low-level sine based UI sounds with tiny decays.
    sfxdir = OUT / 'sfx'; sfxdir.mkdir(parents=True, exist_ok=True)
    for name, f0, f1, length, gain in [
        ('tap.wav', 840, 610, .18, .16),
        ('select.wav', 660, 990, .28, .12),
        ('bloom.wav', 380, 820, .75, .09),
        ('soft-swish.wav', 240, 480, .62, .07),
    ]:
        count = int(length * SR); x = np.arange(count) / SR
        curve = f0 + (f1 - f0) * x / length
        tone = gain * (1 - np.exp(-x * 38)) * np.exp(-x * (5.6 if name != 'bloom.wav' else 3.8)) * np.sin(2 * np.pi * curve * x)
        tone += 0.18 * gain * np.exp(-x * 8) * np.sin(2 * np.pi * curve * 2.02 * x)
        save_wav(sfxdir / name, np.column_stack((tone, np.roll(tone, 80))))
    print('Generated original music cue and four original UI effects.')
if __name__ == '__main__': main()
