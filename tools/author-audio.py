#!/usr/bin/env python3
"""Author CC0 SFX + music layers for PumpRun. 100 BPM, 19.2s (matches music.wav)."""
from __future__ import annotations

import math
import os
import random
import struct
import wave

SR = 22050
BPM = 100
BEAT = 60.0 / BPM  # 0.6s
LOOP_BEATS = 32  # 19.2s
LOOP_DUR = LOOP_BEATS * BEAT
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")


def clamp(x, lo=-1.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def write_wav(name, samples):
    path = os.path.join(OUT, name)
    peak = max((abs(s) for s in samples), default=1.0) or 1.0
    # leave ~1 dB headroom
    norm = 0.89 / peak if peak > 0.89 else 1.0
    frames = b"".join(struct.pack("<h", int(clamp(s * norm) * 32767)) for s in samples)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)
    print(f"  wrote {name:18} {len(samples)/SR:.3f}s  peak={peak:.3f}")


def env_adsr(i, n, a=0.004, d=0.06, s=0.55, r=0.08):
    t = i / SR
    dur = n / SR
    if t < a:
        return t / a if a > 0 else 1.0
    if t < a + d:
        return 1.0 - (1.0 - s) * ((t - a) / d if d else 1.0)
    if t > dur - r:
        tail = max(0.0, dur - t)
        return s * (tail / r if r else 0.0)
    return s


def noise(rng):
    return rng.uniform(-1.0, 1.0)


def lowpass(x, prev, cut):
    # one-pole, cut in 0..1 (higher = brighter)
    return prev + cut * (x - prev)


def highpass(x, prev_x, prev_y, cut):
    y = cut * (prev_y + x - prev_x)
    return y


def mix_into(buf, start, src, gain=1.0):
    for i, s in enumerate(src):
        j = start + i
        if 0 <= j < len(buf):
            buf[j] += s * gain


# ---------- percussion loop ----------
def kick(n, rng):
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        f = 148 * math.exp(-t * 14) + 38
        tone = math.sin(2 * math.pi * f * t)
        click = math.sin(2 * math.pi * 980 * t) * math.exp(-t * 70)
        body = tone * math.exp(-t * 7.2) + click * 0.18
        lp = lowpass(body, lp, 0.28)
        out[i] = lp * env_adsr(i, n, 0.002, 0.05, 0.35, 0.12)
    return out


def snare(n, rng):
    out = [0.0] * n
    hp_x = hp_y = lp = 0.0
    for i in range(n):
        t = i / SR
        ns = noise(rng)
        hp_y = highpass(ns, hp_x, hp_y, 0.72)
        hp_x = ns
        lp = lowpass(hp_y, lp, 0.55)
        tone = math.sin(2 * math.pi * 196 * t) * math.exp(-t * 18)
        out[i] = (lp * 0.85 + tone * 0.35) * math.exp(-t * 12)
    return out


def hat(n, rng, open_=False):
    out = [0.0] * n
    hp_x = hp_y = 0.0
    decay = 18 if open_ else 55
    for i in range(n):
        t = i / SR
        ns = noise(rng)
        hp_y = highpass(ns, hp_x, hp_y, 0.88)
        hp_x = ns
        out[i] = hp_y * math.exp(-t * decay) * (0.55 if open_ else 0.38)
    return out


def clap(n, rng):
    out = [0.0] * n
    bursts = (0.0, 0.012, 0.024, 0.042)
    for i in range(n):
        t = i / SR
        acc = 0.0
        for b in bursts:
            if t >= b:
                acc += noise(rng) * math.exp(-(t - b) * 48)
        out[i] = acc * 0.45
    return out


def music_perc():
    rng = random.Random(11)
    n = int(LOOP_DUR * SR)
    buf = [0.0] * n
    k = kick(int(0.28 * SR), rng)
    s = snare(int(0.22 * SR), rng)
    h = hat(int(0.08 * SR), rng, False)
    ho = hat(int(0.16 * SR), rng, True)
    for beat in range(LOOP_BEATS):
        t0 = int(beat * BEAT * SR)
        mix_into(buf, t0, k, 0.92)
        if beat % 2 == 1:
            mix_into(buf, t0, s, 0.62)
        mix_into(buf, t0, h, 0.7)
        mix_into(buf, t0 + int(0.5 * BEAT * SR), h if beat % 4 != 3 else ho, 0.55)
        # extra 16ths in the back half so the loop itself evolves
        if beat >= 16 and beat % 2 == 0:
            mix_into(buf, t0 + int(0.25 * BEAT * SR), h, 0.32)
    return buf


# ---------- bass loop (sub pulse — mostly unpitched so it sits under any key) ----------
def music_bass():
    rng = random.Random(23)
    n = int(LOOP_DUR * SR)
    buf = [0.0] * n
    # two-bar motif of subs, Hz
    notes = [55.0, 55.0, 61.7, 55.0, 49.0, 49.0, 41.2, 55.0]
    lp = 0.0
    for i in range(n):
        t = i / SR
        beat = t / BEAT
        bar2 = int(beat / 2) % 8
        f = notes[bar2]
        # slight 8th-note pulse
        eighth = (beat * 2) % 1.0
        gate = 1.0 if eighth < 0.62 else 0.12
        # fade the line in across the loop so a single cycle already builds
        build = 0.55 + 0.45 * min(1.0, t / (LOOP_DUR * 0.55))
        phase = 2 * math.pi * f * t
        # sine + tiny odd harmonic, no harsh square
        wave_ = math.sin(phase) + 0.18 * math.sin(phase * 2) + 0.06 * math.sin(phase * 3)
        click = math.sin(2 * math.pi * f * 3 * t) * math.exp(-(eighth * BEAT * 0.5) * 40) * 0.08
        sample = (wave_ * 0.72 + click) * gate * build
        lp = lowpass(sample, lp, 0.18)
        buf[i] = lp * 0.85
        # tiny noise to keep it from going sterile
        if rng.random() < 0.0004:
            buf[i] += rng.uniform(-0.02, 0.02)
    return buf


# ---------- drive loop (shaker + clap + air) ----------
def music_drive():
    rng = random.Random(41)
    n = int(LOOP_DUR * SR)
    buf = [0.0] * n
    h = hat(int(0.05 * SR), rng, False)
    ho = hat(int(0.12 * SR), rng, True)
    c = clap(int(0.2 * SR), rng)
    hp_x = hp_y = 0.0
    for i in range(n):
        t = i / SR
        # filtered noise bed that swells every 4 bars
        ns = noise(rng)
        hp_y = highpass(ns, hp_x, hp_y, 0.82)
        hp_x = ns
        swell = 0.5 + 0.5 * math.sin(2 * math.pi * t / (BEAT * 16))
        buf[i] += hp_y * 0.05 * swell
        # mid pulse on off-beats in the second half
        beat = t / BEAT
        if beat >= 16:
            pulse = max(0.0, math.sin(2 * math.pi * (beat % 1.0)))
            buf[i] += math.sin(2 * math.pi * 330 * t) * pulse * 0.04 * math.exp(-((beat % 1.0) * 8))
    for beat in range(LOOP_BEATS):
        t0 = int(beat * BEAT * SR)
        # 16th shaker
        for k in range(4):
            mix_into(buf, t0 + int(k * 0.25 * BEAT * SR), h, 0.22 if k else 0.34)
        if beat % 4 == 3:
            mix_into(buf, t0, ho, 0.28)
        if beat % 4 == 1 and beat >= 8:
            mix_into(buf, t0, c, 0.4)
    return buf


# ---------- one-shot SFX ----------
def sfx_slide():
    rng = random.Random(7)
    n = int(0.24 * SR)
    out = [0.0] * n
    lp = 0.0
    hp_x = hp_y = 0.0
    for i in range(n):
        t = i / SR
        f = 980 * math.exp(-t * 9) + 140
        ns = noise(rng)
        hp_y = highpass(ns, hp_x, hp_y, 0.7)
        hp_x = ns
        lp = lowpass(hp_y, lp, 0.22 + 0.35 * (1 - t / 0.24))
        body = math.sin(2 * math.pi * (90 - t * 40) * t) * math.exp(-t * 10)
        out[i] = lp * 0.7 * math.exp(-t * 6) + body * 0.35
    return out


def sfx_ramp():
    rng = random.Random(8)
    n = int(0.34 * SR)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        u = t / 0.34
        f = 180 + 1100 * (u ** 1.4)
        ns = noise(rng)
        lp = lowpass(ns, lp, 0.12 + 0.55 * u)
        tone = math.sin(2 * math.pi * f * t) * (0.18 + 0.22 * u)
        env = (u ** 0.45) * (1 - u) ** 0.35 * 2.1
        out[i] = (lp * 0.55 + tone) * env
    return out


def sfx_whoosh():
    rng = random.Random(9)
    n = int(0.3 * SR)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        u = t / 0.3
        # doppler-ish: rise then fall
        f = 420 + 780 * math.sin(math.pi * u)
        ns = noise(rng)
        lp = lowpass(ns, lp, 0.18 + 0.5 * math.sin(math.pi * u))
        tone = math.sin(2 * math.pi * f * t) * 0.22
        env = math.sin(math.pi * u) ** 1.1
        out[i] = (lp * 0.7 + tone) * env
    return out


def sfx_catch():
    rng = random.Random(13)
    n = int(0.78 * SR)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        # sub drop
        fsub = 90 * math.exp(-t * 3.2) + 28
        sub = math.sin(2 * math.pi * fsub * t) * math.exp(-t * 2.4)
        # minor stab (A2 + Bb2)
        brass = (
            math.sin(2 * math.pi * 110 * t)
            + 0.7 * math.sin(2 * math.pi * 116.5 * t)
            + 0.35 * math.sin(2 * math.pi * 220 * t)
        ) * math.exp(-t * 4.5)
        ns = noise(rng)
        lp = lowpass(ns, lp, 0.4)
        hit = lp * math.exp(-t * 14) * 0.55
        out[i] = sub * 0.7 + brass * 0.38 + hit
    return out


def sfx_riser():
    rng = random.Random(17)
    n = int(0.9 * SR)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        u = t / 0.9
        f = 180 * (2 ** (u * 2.2))
        ns = noise(rng)
        lp = lowpass(ns, lp, 0.1 + 0.7 * u)
        tone = math.sin(2 * math.pi * f * t) * (0.12 + 0.2 * u)
        env = u ** 1.15
        # hard cutoff at the end so it punches into the next layer
        if u > 0.92:
            env *= (1 - u) / 0.08
        out[i] = (lp * 0.5 + tone) * env
    return out


def sfx_coin():
    """Soft gold-coin blip — metallic, short, pleasant. Pitch-shifts cleanly."""
    n = int(0.14 * SR)
    out = [0.0] * n
    # Inharmonic gold partials (not a square beep)
    parts = ((987.8, 1.0), (1480.0, 0.42), (1975.5, 0.18), (2637.0, 0.08))
    for i in range(n):
        t = i / SR
        env = math.exp(-t * 22) * (1.0 - math.exp(-t * 280))
        # tiny downward glint so it reads as a coin, not a UI beep
        drift = 1.0 - t * 0.12
        s = 0.0
        for f, a in parts:
            s += a * math.sin(2 * math.pi * f * drift * t)
        out[i] = s * env * 0.42
    return out


def sfx_register():
    """Cash-register cha-ching: bell + drawer clack."""
    rng = random.Random(101)
    n = int(0.62 * SR)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        # two-note ding (E6 then A6), slightly detuned for metal
        ding1 = 0.0
        if t < 0.42:
            e = math.exp(-t * 6.5) * (1.0 - math.exp(-t * 180))
            ding1 = (
                math.sin(2 * math.pi * 1318.5 * t)
                + 0.45 * math.sin(2 * math.pi * 2637.0 * t)
                + 0.18 * math.sin(2 * math.pi * 3951.0 * t)
            ) * e
        ding2 = 0.0
        if t > 0.07:
            u = t - 0.07
            e = math.exp(-u * 5.8) * (1.0 - math.exp(-u * 160))
            ding2 = (
                math.sin(2 * math.pi * 1760.0 * u)
                + 0.35 * math.sin(2 * math.pi * 3520.0 * u)
            ) * e * 0.72
        # drawer thunk + slide
        ns = noise(rng)
        lp = lowpass(ns, lp, 0.22)
        clack = 0.0
        if t < 0.09:
            clack = (lp * 0.55 + math.sin(2 * math.pi * 168 * t) * 0.35) * math.exp(-t * 28)
        slide = 0.0
        if 0.02 < t < 0.22:
            slide = lp * 0.22 * math.sin(math.pi * (t - 0.02) / 0.2)
        out[i] = ding1 * 0.55 + ding2 * 0.48 + clack * 0.5 + slide
    return out


def sfx_vault():
    """Big 10k vault: air whoosh + deep bell cluster + coin shower."""
    rng = random.Random(202)
    n = int(0.95 * SR)
    out = [0.0] * n
    lp = 0.0
    hits = (0.08, 0.14, 0.19, 0.25, 0.32, 0.4)
    for i in range(n):
        t = i / SR
        u = t / 0.95
        ns = noise(rng)
        lp = lowpass(ns, lp, 0.16 + 0.4 * math.sin(math.pi * min(1.0, u * 1.4)))
        whoosh = lp * 0.55 * math.sin(math.pi * min(1.0, t / 0.38)) * math.exp(-max(0.0, t - 0.2) * 3.2)
        bell = 0.0
        if t > 0.06:
            b = t - 0.06
            e = math.exp(-b * 3.4) * (1.0 - math.exp(-b * 80))
            bell = (
                math.sin(2 * math.pi * 523.25 * b)
                + 0.55 * math.sin(2 * math.pi * 659.25 * b)
                + 0.28 * math.sin(2 * math.pi * 1046.5 * b)
            ) * e
        shower = 0.0
        for k, ht in enumerate(hits):
            if t >= ht:
                d = t - ht
                pe = math.exp(-d * 18)
                pf = 1174.7 * (1.08 ** k)
                shower += math.sin(2 * math.pi * pf * d) * pe * 0.22
        out[i] = whoosh * 0.7 + bell * 0.5 + shower
    return out


def music_theme():
    """Upbeat synthwave / electro-hop bed. 19.2s / 100 BPM, loops with perc+bass+drive."""
    rng = random.Random(77)
    n = int(LOOP_DUR * SR)
    buf = [0.0] * n
    # Am – F – G – Em, two bars each, twice
    chords = [
        (220.00, 261.63, 329.63),  # A3 C4 E4
        (174.61, 220.00, 261.63),  # F3 A3 C4
        (196.00, 246.94, 293.66),  # G3 B3 D4
        (164.81, 196.00, 246.94),  # E3 G3 B3
    ]
    lp_pad = 0.0
    lp_bass = 0.0
    for i in range(n):
        t = i / SR
        beat = t / BEAT
        bar = int(beat / 2) % 8
        chord = chords[bar % 4]
        # pad
        pad = 0.0
        for f in chord:
            pad += math.sin(2 * math.pi * f * t) * 0.34
            pad += math.sin(2 * math.pi * f * 2 * t) * 0.08
        lp_pad = lowpass(pad, lp_pad, 0.08)
        # bass pulse (root / 2)
        root = chord[0] * 0.5
        eighth = (beat * 2) % 1.0
        gate = 1.0 if eighth < 0.7 else 0.08
        bass = math.sin(2 * math.pi * root * t) + 0.22 * math.sin(2 * math.pi * root * 2 * t)
        lp_bass = lowpass(bass * gate, lp_bass, 0.16)
        # 16th arp
        step = int(beat * 4) % 12
        arp_f = chord[step % 3] * (2 if step % 6 < 3 else 4)
        arp_ph = (beat * 4) % 1.0
        arp = math.sin(2 * math.pi * arp_f * t) * (1.0 - arp_ph) * 0.16
        # second half: brighter lead
        lead = 0.0
        if beat >= 16:
            lf = chord[0] * 2
            lead = math.sin(2 * math.pi * lf * t + 0.4 * math.sin(2 * math.pi * 3 * t)) * 0.11
            lead *= 0.5 + 0.5 * math.sin(2 * math.pi * beat / 8)
        buf[i] = lp_pad * 0.42 + lp_bass * 0.55 + arp + lead
        if rng.random() < 0.0003:
            buf[i] += rng.uniform(-0.01, 0.01)
    # light kick so the bed has pulse even without perc layer
    k = kick(int(0.22 * SR), rng)
    for beat in range(LOOP_BEATS):
        mix_into(buf, int(beat * BEAT * SR), k, 0.38)
        if beat % 2 == 1:
            mix_into(buf, int(beat * BEAT * SR), clap(int(0.16 * SR), rng), 0.28)
    return buf


def sfx_stumble():
    """Body thud + effort grunt (no speech) when the cop hits an obstacle."""
    rng = random.Random(31)
    n = int(0.38 * SR)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        ns = noise(rng)
        lp = lowpass(ns, lp, 0.28)
        thud = math.sin(2 * math.pi * (92 - t * 50) * t) * math.exp(-t * 9)
        body = lp * math.exp(-t * 11) * 0.7
        # low effort vowel-less burst
        grunt = math.sin(2 * math.pi * 148 * t) * math.exp(-t * 7) * 0.28
        grunt += math.sin(2 * math.pi * 110 * t) * math.exp(-t * 8) * 0.18
        out[i] = thud * 0.7 + body + grunt
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    if "--music" in os.sys.argv:
        print("[audio] authoring CC0 synthwave bed @ 100 BPM / 19.2s")
        write_wav("music.wav", music_theme())
        print("[audio] done")
        return
    if "--stumble" in os.sys.argv:
        write_wav("stumble.wav", sfx_stumble())
        return
    only_money = "--money" in os.sys.argv
    if only_money:
        print("[audio] authoring CC0 money SFX")
        write_wav("coin.wav", sfx_coin())
        write_wav("register.wav", sfx_register())
        write_wav("vault.wav", sfx_vault())
        print("[audio] done")
        return
    print("[audio] authoring CC0 layers + SFX @ 100 BPM / 19.2s")
    write_wav("music_perc.wav", music_perc())
    write_wav("music_bass.wav", music_bass())
    write_wav("music_drive.wav", music_drive())
    write_wav("slide.wav", sfx_slide())
    write_wav("ramp.wav", sfx_ramp())
    write_wav("whoosh.wav", sfx_whoosh())
    write_wav("catch.wav", sfx_catch())
    write_wav("riser.wav", sfx_riser())
    write_wav("coin.wav", sfx_coin())
    write_wav("register.wav", sfx_register())
    write_wav("vault.wav", sfx_vault())
    print("[audio] done")


if __name__ == "__main__":
    main()
