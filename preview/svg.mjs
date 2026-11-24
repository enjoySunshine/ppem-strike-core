// Shared SVG rendering for the previews. Every preview works in the font's
// design units, so the same numbers back both the drawn picture and the
// advance width a line of text would step by at that size.

function fmt(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Builds an SVG document for one glyph at one point size.
 *
 * At sizes where the glyph has a bitmap, the bitmap pixels are drawn and the
 * width is the bitmap strike's advance. Otherwise the outline path is drawn
 * and the width is the outline advance, so pixels and the line's step always
 * come from the same representation.
 *
 * @param {object} options
 * @param {import('fontkit').Glyph} options.glyph
 * @param {number} options.size requested point size
 * @param {number} [options.canvas] square canvas size in px
 * @param {boolean} [options.filled] fill the outline instead of stroking it
 * @return {{svg: string, mode: 'bitmap' | 'outline', advanceWidth: number}}
 */
export function renderGlyphSVG({ glyph, size, canvas = 480, filled = false }) {
  let bitmap =
    typeof glyph.getBitmapMetricsForSize === 'function'
      ? glyph.getBitmapMetricsForSize(size)
      : null;

  let mode;
  let body;
  let minX;
  let minY;
  let width;
  let height;
  let advanceWidth;

  if (bitmap) {
    mode = 'bitmap';
    let image = glyph.getImageForSize(size);
    let href =
      'data:' +
      mimeForImageType(image.type) +
      ';base64,' +
      image.data.toString('base64');

    minX = bitmap.minX;
    minY = bitmap.minY;
    width = bitmap.maxX - bitmap.minX;
    height = bitmap.maxY - bitmap.minY;
    advanceWidth = glyph.advanceWidthForSize(size);

    // SVG y grows downward while font y grows upward: flip around the
    // baseline (y = 0). The image origin is already in design units.
    body = `<image href="${href}" x="${fmt(bitmap.minX)}" y="${fmt(-bitmap.maxY)}" width="${fmt(width)}" height="${fmt(height)}"/>`;
  } else {
    mode = 'outline';
    let box = glyph.path.bbox;
    minX = box.minX;
    minY = box.minY;
    width = Math.max(1, Math.ceil(box.maxX - box.minX));
    height = Math.max(1, Math.ceil(box.maxY - box.minY));
    advanceWidth = glyph.advanceWidthForSize(size);

    // Emoji placeholder outlines can be zero-length subpaths, so stroke with
    // round caps to keep the thin contour visible. Real letter outlines are
    // rendered filled when requested.
    let paint = filled
      ? 'fill="#f4f1ea"'
      : 'fill="none" stroke="#f4f1ea" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"';
    body = `<path d="${glyph.path.toSVG()}" transform="scale(1,-1)" ${paint}/>`;
  }

  // Pad the view so strokes and the edges of a full-em bitmap stay on canvas.
  let padding = Math.max(width, height) * 0.02;
  let viewX = minX - padding;
  let viewY = -minY - height - padding;
  let viewWidth = width + padding * 2;
  let viewHeight = height + padding * 2;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(viewX)} ${fmt(viewY)} ${fmt(viewWidth)} ${fmt(viewHeight)}" width="${canvas}" height="${canvas}">
  <rect x="${fmt(viewX)}" y="${fmt(viewY)}" width="${fmt(viewWidth)}" height="${fmt(viewHeight)}" fill="#111"/>
  ${body}
</svg>
`;

  return { svg, mode, advanceWidth };
}

function mimeForImageType(type) {
  switch (type.trim()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'tiff':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

/**
 * The advance width of a run at a size, in design units. A glyph run drawn
 * from bitmaps steps by bitmap advances; without a suitable bitmap it steps
 * by the same outline advances the fallback outlines use.
 *
 * @param {import('fontkit').GlyphRun} run
 * @param {number} size
 * @return {number}
 */
export function runAdvanceWidthForSize(run, size) {
  return run.advanceWidthForSize(size);
}
