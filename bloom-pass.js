class BloomPass {
  constructor() {
    this._canvas = document.createElement("canvas");
  }

  apply(src, intensity) {
    if (intensity <= 0) return src;

    const w = src.width;
    const h = src.height;

    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
    }

    const ctx = this._canvas.getContext("2d");
    const radius = Math.max(2, Math.round(w * 0.006 * (1 + intensity)));

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0);

    // Blurred copy blended with screen — creates additive glow on bright areas
    ctx.save();
    ctx.filter = `blur(${radius}px)`;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = intensity * 0.7;
    ctx.drawImage(src, 0, 0);
    ctx.restore();

    return this._canvas;
  }
}
