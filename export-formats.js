export const DEFAULT_EXPORT_FORMAT = "png";

export const EXPORT_FORMATS = Object.freeze({
  png: Object.freeze({
    value: "png",
    label: "PNG",
    mimeType: "image/png",
    extension: "png",
    encoderQuality: undefined
  }),
  jpeg: Object.freeze({
    value: "jpeg",
    label: "JPEG",
    mimeType: "image/jpeg",
    extension: "jpg",
    encoderQuality: 0.92
  }),
  webp: Object.freeze({
    value: "webp",
    label: "WebP",
    mimeType: "image/webp",
    extension: "webp",
    encoderQuality: 0.9
  })
});

export const EXPORT_FORMAT_OPTIONS = Object.freeze(Object.values(EXPORT_FORMATS));

export function isExportFormat(value) {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(EXPORT_FORMATS, value);
}

export function getExportFormat(value) {
  return isExportFormat(value)
    ? EXPORT_FORMATS[value]
    : EXPORT_FORMATS[DEFAULT_EXPORT_FORMAT];
}

export function getEncoderQuality(format) {
  return format.encoderQuality;
}
