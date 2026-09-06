# Halftone Studio

A browser-based halftone image generator for brand design and print-style graphics. Upload any image, adjust tone and dot parameters, and export high-resolution halftone artwork.

## Features

- **Real-time preview** with before/after split comparison
- **Render profiles** — Draft, High, Ultra, and Print treatments
- **Fine-grained controls** — Cell size, screen angle, contrast, gamma, tone curve, jitter, micro-dots, and minimum dot size
- **Custom ink and paper colors** — HEX, RGB/HSL, OKLCH, Display P3, and opacity; canvas output is sRGB
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

## Controls

The editor uses the dependency-free DialKit 2 vanilla adapter. React and Motion are not part of the runtime. Sliders use pointer adjustment and click-to-edit numeric values; DialKit’s added slider keyboard shortcuts are disabled. Folder headers use native buttons; closed sections are removed from keyboard navigation. Preset names remain single-line.

Colors keep their CSS representation in saved presets and render through the browser’s sRGB canvas. PNG and WebP support transparency; JPEG does not. Existing HEX presets and the 40 MB upload policy remain supported.

## Deployment (GitHub Pages)

Pushes to `main` run the GitHub Pages workflow. It installs the locked dependencies,
builds the Vite app, and publishes the `dist` directory.

## Files

- `index.html` — Vite entry point and native rendering controls
- `src/main.js` — Lightweight desktop/phone entry point
- `src/studio-panel.js` — DialKit 2 vanilla controls, color picker, and preset UI
- `src/dial-panel.css` — DialKit-specific styling
- `script.js` — Application logic, presets, and main-thread rendering fallback
- `renderer-core.js` — Shared deterministic halftone renderer
- `renderer-worker.js` — Web Worker for off-thread preview rendering
- `export-worker.js` — Cancellable export worker with progress reporting
- `styles.css` — Responsive dark-themed styles
- `vite.config.js` — Production and development build configuration
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment
