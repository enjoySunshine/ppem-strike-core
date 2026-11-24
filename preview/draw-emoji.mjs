import fs from 'node:fs';
import { openSync } from '../src/node.js';
import { renderGlyphSVG, runAdvanceWidthForSize } from './svg.mjs';

const fontUrl = new URL(
  '../test/data/ss-emoji/ss-emoji-apple.ttf',
  import.meta.url,
);
const font = openSync(fontUrl);
const outDir = new URL('./', import.meta.url);

const WINK = 0x1f61c; // 😜 stuckouttonguewinkingeye
const SPACE = 0x20; // one of the three glyphs whose 300ppem strike is empty
const SIZES = [32, 600];

let summary = {
  font: font.fullName,
  unitsPerEm: font.unitsPerEm,
  strikes: font.sbix.imageTables.map((table) => ({
    ppem: table.ppem,
    resolution: table.resolution,
  })),
  glyphs: {},
};

// Renders a glyph at every size and records both the picture's mode and the
// width a line steps by at that size, which must always come from the same
// representation (bitmap or outline).
function previewGlyph(label, glyph, run = null) {
  summary.glyphs[label] = {
    glyphId: glyph.id,
    name: glyph.name ?? null,
    outlineAdvanceWidth: glyph.advanceWidth,
    sizes: {},
  };

  for (let size of SIZES) {
    let { svg, mode, advanceWidth } = renderGlyphSVG({ glyph, size });
    let file = `${label}-${size}.svg`;
    fs.writeFileSync(new URL(file, outDir), svg);

    summary.glyphs[label].sizes[size] = {
      mode,
      glyphAdvanceWidth: advanceWidth,
      runAdvanceWidth: run ? runAdvanceWidthForSize(run, size) : advanceWidth,
      file,
    };
  }
}

// Small text must draw the 300ppem bitmap and step by its advance; large text
// keeps the outline and the outline's advance.
let wink = font.glyphForCodePoint(WINK);
previewGlyph('wink', wink, font.layout(String.fromCodePoint(WINK)));

// .notdef has a 121x301 bitmap but a 1024-unit outline advance. At small size
// the bitmap is drawn and the line steps by the bitmap-derived width, never
// the outline width; at large size both return to the outline.
previewGlyph('notdef', font.getGlyph(0));

// A glyph with no image in the strike falls back to the outline at every size,
// picture and advance together.
let space = font.glyphForCodePoint(SPACE);
previewGlyph('empty', space, font.layout(String.fromCodePoint(SPACE)));

// A line of winks: the whole line switches advance with the selected tier.
let line = font.layout(String.fromCodePoint(WINK));
summary.line = {
  text: '😜',
  outlineAdvanceWidth: line.advanceWidth,
  sizes: Object.fromEntries(
    SIZES.map((size) => [size, runAdvanceWidthForSize(line, size)]),
  ),
};

fs.writeFileSync(
  new URL('./emoji-summary.json', outDir),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(JSON.stringify(summary, null, 2));
