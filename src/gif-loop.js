import { GIFEncoder, applyPalette, quantize } from "gifenc/dist/gifenc.esm.js";

export const GIF_MAX_EDGE = 640;

export function gifFrameDelay(fps) {
  return Math.max(20, Math.round(1000 / Math.max(1, fps)));
}

function paletteSample(frames) {
  const parts = [];
  for (const frame of frames) {
    for (let index = 0; index < frame.length; index += 32) {
      parts.push(frame[index], frame[index + 1], frame[index + 2], frame[index + 3]);
    }
  }
  return Uint8Array.from(parts);
}

function hasTransparency(frames) {
  for (const frame of frames) {
    for (let index = 3; index < frame.length; index += 16) {
      if (frame[index] < 255) return true;
    }
  }
  return false;
}

function transparentIndex(palette) {
  return palette.findIndex((color) => color.length > 3 && color[3] === 0);
}

// One palette for the whole loop, so ink and paper do not flicker between frames.
export function encodeLoopGif(frames, width, height, delay) {
  const sample = paletteSample(frames);
  const transparent = hasTransparency(frames);
  const format = transparent ? "rgba4444" : "rgb565";
  const palette = quantize(sample, 256, transparent ? { format, oneBitAlpha: 127 } : { format });
  const clear = transparentIndex(palette);
  const gif = GIFEncoder();
  frames.forEach((frame, index) => {
    gif.writeFrame(applyPalette(frame, palette, format), width, height, {
      palette: index === 0 ? palette : null,
      delay,
      repeat: 0,
      transparent: clear >= 0,
      transparentIndex: Math.max(0, clear)
    });
  });
  gif.finish();
  return gif.bytes();
}
