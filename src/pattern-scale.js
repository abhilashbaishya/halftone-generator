// Cell size is measured on an image whose longest edge is 1000 units.
// Viewport size, device pixel ratio and export resolution only scale that image.
export const PATTERN_REFERENCE_EDGE = 1000;

export function getImageCellSize(cellSize, width, height) {
  return cellSize * Math.max(width, height) / PATTERN_REFERENCE_EDGE;
}
