// Only actual files are accepted: text, links and internal UI drags stay native.
function hasFiles(transfer) {
  return Array.from(transfer?.types ?? []).includes('Files')
    || Boolean(transfer?.files?.length);
}

export function mountImageDrop(zone, { onFile, onError }) {
  if (!zone) return () => {};
  const document = zone.ownerDocument;
  const window = document.defaultView;
  let depth = 0;
  const reset = () => {
    depth = 0;
    zone.classList.remove('is-file-over');
  };
  const enter = (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    depth += 1;
    zone.classList.add('is-file-over');
  };
  const leave = () => {
    depth = Math.max(0, depth - 1);
    if (!depth) reset();
  };
  const over = (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    const inside = zone.contains(event.target);
    event.dataTransfer.dropEffect = inside ? 'copy' : 'none';
    zone.classList.toggle('is-file-over', inside);
    if (!inside) depth = 0;
  };
  const drop = (event) => {
    reset();
    if (!hasFiles(event.dataTransfer)) return;
    // Prevent file navigation even when the user misses the preview.
    event.preventDefault();
    if (!zone.contains(event.target)) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length !== 1) {
      onError('Drop one image at a time. Choose a static JPEG, PNG, or WebP.');
      return;
    }
    // Do not trust MIME metadata here; the upload pipeline checks file bytes.
    onFile(files[0]);
  };
  const keydown = (event) => { if (event.key === 'Escape') reset(); };
  zone.addEventListener('dragenter', enter);
  zone.addEventListener('dragleave', leave);
  document.addEventListener('dragover', over);
  document.addEventListener('drop', drop);
  document.addEventListener('dragend', reset);
  document.addEventListener('keydown', keydown);
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  return () => {
    reset();
    zone.removeEventListener('dragenter', enter);
    zone.removeEventListener('dragleave', leave);
    document.removeEventListener('dragover', over);
    document.removeEventListener('drop', drop);
    document.removeEventListener('dragend', reset);
    document.removeEventListener('keydown', keydown);
    window.removeEventListener('blur', reset);
    window.removeEventListener('pagehide', reset);
  };
}
