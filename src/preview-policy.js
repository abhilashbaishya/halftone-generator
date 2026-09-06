// Drafts keep the same screen-space dot spacing, using fewer raster pixels.
export function getPreviewRenderPlan(width, height, settings, draft) {
  const scale = draft ? Math.min(0.65, Math.sqrt(180_000 / (width * height))) : 1;
  const renderWidth = Math.max(1, Math.floor(width * scale));
  const renderHeight = Math.max(1, Math.floor(height * scale));
  return {
    width: renderWidth, height: renderHeight, draft,
    settings: { ...settings, cellSize: settings.cellSize * renderWidth / width }
  };
}

export function shouldPresentPreview(job, generation, queued, interacting) {
  return job.generation === generation && (!queued || (job.draft && interacting));
}
