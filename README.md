# Halftone Studio

A browser-based halftone image generator for brand design and print-style graphics. Upload any image, adjust tone and dot parameters, and export high-resolution halftone PNGs.

## Features

- **Real-time preview** with before/after split comparison
- **Quality modes** — Draft, High, and Ultra with increasing fidelity
- **Fine-grained controls** — Cell size, screen angle, contrast, gamma, tone curve, jitter, micro-dots, and minimum dot size
- **Custom ink and paper colors** for branded output
- **Built-in presets** — Clean Editorial, Bold Poster, Subtle Texture, Flash Poster
- **Save and manage custom presets** via localStorage
- **High-res PNG export** with quality-scaled resolution (up to 3x)
- **Web Worker rendering** keeps the UI responsive during generation
- **Seeded randomization** for reproducible results

## How it works

The engine converts images to a luminance map using an integral image for O(1) box sampling, then places dots on a rotated grid. Each dot's size is driven by local darkness, Sobel edge detection, and 8x8 Bayer dithering. Stratified micro-dots fill in highlight detail.

## Local preview

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deployment (GitHub Pages)

1. Push this project to the `main` branch of a GitHub repo.
2. In the repo, open **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` and wait for the `Deploy static site to GitHub Pages` workflow to finish.
5. Your public URL will be `https://<username>.github.io/<repo-name>/`.

## Files

- `index.html` — UI layout and controls
- `script.js` — Application logic, presets, and main-thread rendering fallback
- `renderer-worker.js` — Web Worker for off-thread halftone rendering
- `styles.css` — Responsive dark-themed styles
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment
