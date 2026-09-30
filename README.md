# Halftone Studio

A browser-based halftone image generator for brand design and print-style graphics. Upload any image, adjust tone and dot parameters, and export high-resolution halftone artwork.

**Live:** [abhilashbaishya.com/tools/halftone-studio](https://abhilashbaishya.com/tools/halftone-studio/)

## Features

- **Real-time preview** with before/after split comparison
- **Output sizes** — Draft, High, Ultra, and Print resolutions with consistent halftone treatment
- **Dot shapes** — Round, square, diamond, and line screens
- **Fine-grained controls** — Cell size, screen angle, contrast, gamma, tone curve, invert tone, grain, bloom, and CRT
- **Custom ink and paper colors** — HEX, RGB/HSL, OKLCH, Display P3, and opacity; canvas output is sRGB
- **Built-in presets** — Crimson Poster, Amber Press, Electric, Blueprint, Fine Screen
- **Save, import, and export custom presets** via localStorage and JSON files
- **Resume editing after refresh** — the selected preset and unsaved adjustments restore alongside the uploaded image
- **WebP, JPEG, and lossless PNG export** with size estimates, device-safe memory limits, progress, and cancellation
- **Copy image** — puts a PNG at the selected output size on the clipboard
- **Web Worker rendering** keeps previews and exports responsive

## How it works

The renderer works per pixel on a rotated screen. Each pixel's darkness, after contrast, gamma, and tone curve, is compared with how much of its cell the chosen dot shape would cover at that point. So detail finer than a cell survives, and every shape grows continuously from clean paper to solid ink. Optional preset texture offsets each dot and adds seeded micro-dots in highlights.

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

Presets may carry dot irregularity, micro-dots, and a texture seed (Amber Press does). These have no panel controls; they are saved, imported, and exported with the preset.

The editor saves adjustments locally after a short pause and flushes pending changes when the page is hidden or left. Refresh restores the active preset and unsaved edits; panel position, split, and zoom reset. No sign-in or server storage is involved.

## Deployment (GitHub Pages)

Pushes to `main` run the GitHub Pages workflow. It installs the locked dependencies,
builds the Vite app, and publishes the `dist` directory.

## Files

- `index.html` — Vite entry point and native rendering controls
- `src/main.js` — Lightweight desktop/phone entry point
- `src/studio-panel.js` — DialKit 2 vanilla controls, color picker, and preset UI
- `src/dial-panel.css` — DialKit-specific styling
- `script.js` — Application logic, presets, and main-thread rendering fallback
- `src/halftone-renderer.js` — Shared per-pixel halftone renderer for preview and export
- `renderer-worker.js` — Web Worker for off-thread preview rendering
- `export-worker.js` — Cancellable export worker with progress reporting
- `styles.css` — Responsive dark-themed styles
- `vite.config.js` — Production and development build configuration
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment
