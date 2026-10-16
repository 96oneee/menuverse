# Filming a dish for a 360° view

A restaurant films one plate turning for about 10 seconds. `video_to_spin.py` turns that clip into the 36 frames the menu's 360° viewer uses.

## Shooting (about 2 minutes per dish)

1. **Turntable.** Put the plate in the centre of a lazy Susan, or any turntable. A cheap one (about $15) is fine.
2. **Phone still.** Rest the phone on a stand, a glass or a stack of books, about 30° above the plate and 50 to 70 cm away. Don't hold it in your hand.
3. **Frame.** Leave a little space around the whole plate, board or skillet handle in every direction. Lock focus and exposure by pressing and holding on the dish.
4. **Light.** Use soft daylight from a window, or one soft lamp. Avoid direct spotlights and mixed colours.
5. **Background.** A plain wall or board works best. The tool cuts the dish out either way.
6. **Turn.** Start recording, then turn the plate slowly and evenly through **one full turn**, taking 8 to 12 seconds. A little past one turn is fine.
7. Send the video. Any phone format works (MOV or MP4).

## Processing

```
pip install "rembg[cpu]" imageio-ffmpeg pillow numpy
python3 tools/capture/video_to_spin.py beef.mov --out app/media/dishes/beef
```

The tool:
- finds one full turn by itself (or use `--turn-seconds 10`),
- picks 36 evenly spaced frames,
- cuts the dish out of the background with an AI segmentation model that runs locally,
- lines the frames up on the dish so a slight wobble disappears,
- saves `00.webp … 35.webp` and `thumb.webp`, then prints the line to add to the menu file.

Useful options: `--reverse` if the plate turned clockwise, `--keep-background` to keep the real table in the shot, and `--model birefnet-general` for finer edges (slower).

Tested on 2026-10-16 with a synthetic 15-second clip: a 10-second turn, hand-held wobble and a wooden table background. The tool detected the turn as 9.9 s, cut the dish out cleanly and produced a smooth spin.
