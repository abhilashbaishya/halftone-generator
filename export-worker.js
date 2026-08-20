import { renderHalftoneAsync } from "./renderer-core.js";

const sourceCanvas = new OffscreenCanvas(1, 1);
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const outputCanvas = new OffscreenCanvas(1, 1);
const outputCtx = outputCanvas.getContext("2d");
const cancelledRequests = new Set();

function isCancelled(requestId) {
  return cancelledRequests.has(requestId);
}

async function renderExport(message) {
  const { requestId, width, height, settings, sourceBitmap, needsPostEffects } = message;
  let lastProgress = -1;
  const postProgress = (value) => {
    const percent = Math.min(100, Math.max(0, Math.round(value * 100)));
    if (percent === lastProgress) return;
    lastProgress = percent;
    self.postMessage({ type: "export-progress", requestId, progress: percent });
  };

  try {
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    outputCanvas.width = width;
    outputCanvas.height = height;

    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.imageSmoothingEnabled = true;
    sourceCtx.imageSmoothingQuality = "high";
    sourceCtx.drawImage(sourceBitmap, 0, 0, width, height);
    if (typeof sourceBitmap.close === "function") sourceBitmap.close();
    postProgress(0.04);

    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const result = await renderHalftoneAsync(outputCtx, imageData.data, width, height, settings, {
      shouldCancel: () => isCancelled(requestId),
      onProgress: (progress) => postProgress(0.04 + progress * 0.84)
    });

    if (result.cancelled || isCancelled(requestId)) {
      self.postMessage({ type: "export-cancelled", requestId });
      return;
    }

    if (needsPostEffects) {
      const bitmap = outputCanvas.transferToImageBitmap();
      postProgress(0.9);
      self.postMessage({ type: "export-rendered", requestId, bitmap }, [bitmap]);
      return;
    }

    postProgress(0.92);
    const blob = await outputCanvas.convertToBlob({ type: "image/png" });
    if (isCancelled(requestId)) {
      self.postMessage({ type: "export-cancelled", requestId });
      return;
    }

    postProgress(1);
    self.postMessage({ type: "export-complete", requestId, blob });
  } catch (error) {
    if (typeof sourceBitmap.close === "function") sourceBitmap.close();
    self.postMessage({
      type: "export-error",
      requestId,
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    cancelledRequests.delete(requestId);
  }
}

self.onmessage = (event) => {
  const message = event.data || {};

  if (message.type === "cancel-export") {
    cancelledRequests.add(message.requestId);
    return;
  }

  if (message.type === "export" && message.sourceBitmap && message.settings) {
    renderExport(message);
  }
};
