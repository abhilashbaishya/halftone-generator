export function createExportFilename(extension, date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const localDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `Halftone Studio - ${localDate}.${extension}`;
}
