import { renderHalftoneSync } from "./renderer-core.js";

const hiddenCanvas = new OffscreenCanvas(1, 1);
const hiddenCtx = hiddenCanvas.getContext("2d", { willReadFrequently: true });
const outputCanvas = new OffscreenCanvas(1, 1);
const outputCtx = outputCanvas.getContext("2d");

self.onmessage = async (event) => {
  const { type, requestId, width, height, settings, sourceBitmap } = event.data || {};
  if (type !== "render" || !sourceBitmap || !settings) return;

  try {
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;
    outputCanvas.width = width;
    outputCanvas.height = height;

    hiddenCtx.clearRect(0, 0, width, height);
    hiddenCtx.drawImage(sourceBitmap, 0, 0, width, height);
    if (typeof sourceBitmap.close === "function") sourceBitmap.close();

    const imageData = hiddenCtx.getImageData(0, 0, width, height);
    renderHalftoneSync(outputCtx, imageData.data, width, height, settings);

    let bitmap;
    if (typeof outputCanvas.transferToImageBitmap === "function") {
      bitmap = outputCanvas.transferToImageBitmap();
    } else {
      const blob = await outputCanvas.convertToBlob({ type: "image/png" });
      bitmap = await createImageBitmap(blob);
    }

    self.postMessage({ type: "rendered", requestId, bitmap }, [bitmap]);
  } catch (error) {
    if (typeof sourceBitmap.close === "function") sourceBitmap.close();
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
