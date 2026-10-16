#!/usr/bin/env python3
"""MENUVERSE capture: turn a phone video of a dish on a turntable into a 360° spin.

    python3 video_to_spin.py dish.mp4 --out app/media/dishes/<dish-id> [--frames 36]

Steps
  1. Decode the video (ffmpeg) at a working resolution.
  2. Find one full turn automatically: the first moment the plate looks like
     frame 0 again, after it has clearly turned away from it.
  3. Pick N frames evenly spread over that turn.
  4. Cut the dish out of the background (rembg, a local AI segmentation model).
  5. Stabilise: line every frame up on the dish's centre, so a hand-held or
     slightly off-centre turntable still spins smoothly.
  6. Crop all frames with one shared square, resize, and save transparent WebP
     frames plus a thumbnail, ready for the menu's viewer.

Needs: pip install "rembg[cpu]" imageio-ffmpeg pillow numpy
"""
import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def decode(video, workdir, width, fps):
    pattern = os.path.join(workdir, "f%05d.png")
    vf = f"fps={fps},scale={width}:-2"
    subprocess.run([ffmpeg_exe(), "-loglevel", "error", "-i", video, "-vf", vf, pattern], check=True)
    files = sorted(Path(workdir).glob("f*.png"))
    if len(files) < 12:
        sys.exit("The video is too short. Film one slow full turn of the plate (8 to 12 seconds).")
    return files


def signature(path):
    """Small, blurred, centre-weighted grey image used to compare frames."""
    im = Image.open(path).convert("L")
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)).resize((72, 72)).filter(ImageFilter.GaussianBlur(1.2))
    a = np.asarray(im, dtype=np.float32)
    a = (a - a.mean()) / (a.std() + 1e-6)
    return a


def find_turn(files, fps, min_turn_s):
    """Return the frame count of one full rotation."""
    sigs = [signature(f) for f in files]
    d = np.array([np.mean(np.abs(s - sigs[0])) for s in sigs])
    peak = d.max()
    start = int(min_turn_s * fps)
    # after the plate has turned away (difference high), find where it comes back
    turned_away = np.where(d > 0.55 * peak)[0]
    if len(turned_away) == 0:
        return None, d
    first_away = max(turned_away[0], start)
    cand = range(first_away, len(d))
    best = min(cand, key=lambda i: d[i], default=None)
    # refine: the first local minimum close to the global best
    thresh = d[best] + 0.15 * (peak - d[best]) if best is not None else None
    for i in cand:
        if d[i] <= thresh and (i + 1 >= len(d) or d[i] <= d[i + 1]) and d[i] <= d[i - 1]:
            return i, d
    return best, d


def cut_out(paths, model):
    from rembg import new_session, remove
    session = new_session(model)
    out = []
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGB")
        rgba = remove(im, session=session, post_process_mask=True)
        out.append(rgba)
        print(f"  cut out {i + 1}/{len(paths)}", end="\r", flush=True)
    print()
    return out


def stabilise_and_crop(frames, size, margin):
    alphas = [np.asarray(f.split()[-1], dtype=np.float32) / 255 for f in frames]
    cents = []
    for a in alphas:
        ys, xs = np.nonzero(a > 0.5)
        if len(xs) == 0:
            cents.append((a.shape[1] / 2, a.shape[0] / 2))
        else:
            cents.append((xs.mean(), ys.mean()))
    cents = np.array(cents)
    # smooth the centre path so we remove wobble but keep the real motion of nothing
    target = cents.mean(axis=0)
    shifted = []
    for f, (cx, cy) in zip(frames, cents):
        dx, dy = int(round(target[0] - cx)), int(round(target[1] - cy))
        canvas = Image.new("RGBA", f.size, (0, 0, 0, 0))
        canvas.paste(f, (dx, dy), f)
        shifted.append(canvas)
    # one shared square crop that contains the dish in every frame
    boxes = [s.split()[-1].point(lambda v: 255 if v > 24 else 0).getbbox() for s in shifted]
    boxes = [b for b in boxes if b]
    l = min(b[0] for b in boxes); t = min(b[1] for b in boxes)
    r = max(b[2] for b in boxes); btm = max(b[3] for b in boxes)
    side = int(max(r - l, btm - t) * (1 + margin))
    cx, cy = (l + r) / 2, (t + btm) / 2
    box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
    result = []
    for s in shifted:
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(s.crop(box), (0, 0))
        result.append(sq.resize((size, size), Image.LANCZOS))
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--out", required=True, help="output folder, e.g. app/media/dishes/steak")
    ap.add_argument("--frames", type=int, default=36)
    ap.add_argument("--size", type=int, default=900)
    ap.add_argument("--fps", type=float, default=15, help="analysis frame rate")
    ap.add_argument("--turn-seconds", type=float, help="skip detection: one full turn takes this long")
    ap.add_argument("--start", type=float, default=0, help="seconds to skip at the start")
    ap.add_argument("--min-turn", type=float, default=3, help="a full turn takes at least this many seconds")
    ap.add_argument("--reverse", action="store_true", help="plate turned clockwise as seen from above")
    ap.add_argument("--keep-background", action="store_true", help="do not cut out the dish")
    ap.add_argument("--model", default="isnet-general-use", help="rembg model (isnet-general-use, u2net, birefnet-general)")
    ap.add_argument("--margin", type=float, default=0.06)
    a = ap.parse_args()

    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        print("1/5 decoding video")
        files = decode(a.video, tmp, 1080, a.fps)
        files = files[int(a.start * a.fps):]
        print(f"     {len(files)} frames")
        print("2/5 finding one full turn")
        if a.turn_seconds:
            turn = int(round(a.turn_seconds * a.fps))
        else:
            turn, _ = find_turn(files, a.fps, a.min_turn)
            if not turn:
                sys.exit("Could not find a full turn. Make sure the plate turns all the way round, or pass --turn-seconds.")
        if turn >= len(files):
            sys.exit("The video ends before the plate finishes one turn.")
        print(f"     one turn = {turn / a.fps:.1f} s")
        idx = [int(round(i * turn / a.frames)) for i in range(a.frames)]
        if a.reverse:
            idx = [idx[0]] + idx[:0:-1]
        picked = [files[i] for i in idx]
        print("3/5 cutting out the dish" if not a.keep_background else "3/5 keeping background")
        frames = [Image.open(p).convert("RGBA") for p in picked] if a.keep_background else cut_out(picked, a.model)
        print("4/5 stabilising and cropping")
        frames = stabilise_and_crop(frames, a.size, a.margin) if not a.keep_background else [f.resize((a.size, int(a.size * f.height / f.width))) for f in frames]
        print("5/5 saving")
        for i, f in enumerate(frames):
            f.save(out / f"{i:02d}.webp", "WEBP", quality=86, method=6)
        frames[0].resize((420, 420), Image.LANCZOS).save(out / "thumb.webp", "WEBP", quality=82, method=6)
    rel = out.as_posix().split("app/", 1)[-1]
    print("done. Add this to the dish in the menu file:")
    print(json.dumps({"media": {"spin": {"path": rel, "frames": a.frames}}}))


if __name__ == "__main__":
    main()
