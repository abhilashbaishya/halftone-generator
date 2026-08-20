# Halftone Studio

A browser-based halftone image generator for brand design and print-style graphics. Upload any image, adjust tone and dot parameters, and export high-resolution halftone artwork.

## Features

- **Real-time preview** with before/after split comparison
- **Render profiles** — Draft, High, Ultra, and Print treatments
- **Fine-grained controls** — Cell size, screen angle, contrast, gamma, tone curve, jitter, micro-dots, and minimum dot size
- **Custom ink and paper colors** for branded output
- **Built-in presets** — Clean Editorial, Bold Poster, Subtle Texture, Flash Poster
- **Save and manage custom presets** via localStorage
- **WebP, JPEG, and lossless PNG export** with size estimates, device-safe memory limits, progress, and cancellation
- **Web Worker rendering** keeps previews and exports responsive
- **Seeded randomization** for reproducible results

## How it works

The engine converts images to a luminance map using an integral image for O(1) box sampling, then places dots on a rotated grid. Each dot's size is driven by local darkness, Sobel edge detection, and 8x8 Bayer dithering. Stratified micro-dots fill in highlight detail.

## Local development

```bash
npm ci
npm run dev
```

Vite prints the desktop and local-network URLs when it starts.

Create a production build with:

```bash
npm run build
```

## Deployment (GitHub Pages)

Pushes to `main` run the GitHub Pages workflow. It installs the locked dependencies,
builds the Vite app, and publishes the `dist` directory.

## Files

- `index.html` — Vite entry point and native rendering controls
- `src/main.jsx` — React application shell and DialKit control panel
- `src/dial-panel.css` — DialKit-specific styling
- `script.js` — Application logic, presets, and main-thread rendering fallback
- `renderer-core.js` — Shared deterministic halftone renderer
- `renderer-worker.js` — Web Worker for off-thread preview rendering
- `export-worker.js` — Cancellable export worker with progress reporting
- `styles.css` — Responsive dark-themed styles
- `vite.config.js` — Production and development build configuration
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment
