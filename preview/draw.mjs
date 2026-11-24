import fs from 'node:fs';
import { openSync } from '../src/node.js';
import { renderGlyphSVG } from './svg.mjs';

const font = openSync(
  new URL('../test/data/OpenSans/OpenSans-Regular.ttf', import.meta.url),
);
const glyph = font.glyphForCodePoint(0x41);
const { svg } = renderGlyphSVG({ glyph, size: font.unitsPerEm, filled: true });
fs.writeFileSync(new URL('./out.svg', import.meta.url), svg);

let box = glyph.path.bbox;
let w = Math.max(1, Math.ceil(box.maxX - box.minX));
let h = Math.max(1, Math.ceil(box.maxY - box.minY));
console.log('wrote preview/out.svg', w, h);
