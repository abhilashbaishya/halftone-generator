const OUTPUT_LABELS = { draft: 'Draft', high: 'High', ultra: 'Ultra', print: 'Print' };

function safePresetName(value) {
  const cleaned = String(value ?? '').normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, '-')
    .replace(/\s+/g, ' ').trim().replace(/^[. -]+|[. -]+$/g, '');
  // Leave room for the brand, profile, and extension on common filesystems.
  const encoder = new TextEncoder();
  let name = '', bytes = 0;
  for (const character of cleaned) {
    bytes += encoder.encode(character).length;
    if (bytes > 120) break;
    name += character;
  }
  return name.replace(/[. -]+$/g, '') || 'Custom';
}

export function createExportFilename(extension, { preset, quality } = {}) {
  const suffix = ['png', 'jpg', 'jpeg', 'webp'].includes(extension) ? extension : 'png';
  const profile = Object.hasOwn(OUTPUT_LABELS, quality) ? OUTPUT_LABELS[quality] : 'High';
  return `Halftone Studio - ${safePresetName(preset)} - ${profile}.${suffix}`;
}
