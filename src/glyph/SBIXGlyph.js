import TTFGlyph from './TTFGlyph';
import * as r from 'restructure';

let SBIXImage = new r.Struct({
  originX: r.uint16,
  originY: r.uint16,
  type: new r.String(4),
  data: new r.Buffer((t) => t.parent.buflen - t._currentOffset),
});

// Reads the width and height out of a PNG's IHDR chunk without a decoder.
function pngDimensions(data) {
  let signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || !signature.every((byte, i) => data[i] === byte)) {
    return null;
  }

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

/**
 * Represents a color (e.g. emoji) glyph in Apple's SBIX format.
 */
export default class SBIXGlyph extends TTFGlyph {
  type = 'SBIX';

  // An sbix font stores one image table (strike) per bitmap size. Images are
  // only ever taken from a strike, so the chosen strike decides both what is
  // drawn and every bitmap metric for a given requested point size.
  _getStrike(size) {
    let tables = this._font.sbix.imageTables;
    let table = tables[tables.length - 1];
    for (let i = 0; i < tables.length; i++) {
      if (tables[i].ppem >= size) {
        table = tables[i];
        break;
      }
    }

    return table;
  }

  /**
   * Returns an object representing a glyph image at the given point size.
   * The object has a data property with a Buffer containing the actual image data,
   * along with the image type, and origin.
   *
   * @param {number} size
   * @return {object}
   */
  getImageForSize(size) {
    let table = this._getStrike(size);
    let offsets = table.imageOffsets;
    let start = offsets[this.id];
    let end = offsets[this.id + 1];

    if (start === end) {
      return null;
    }

    this._font.stream.pos = start;
    return SBIXImage.decode(this._font.stream, { buflen: end - start });
  }

  // Returns the strike and decoded image for a size, or null when this glyph
  // has no bitmap in the strike that size selects.
  _getBitmapForSize(size) {
    let table = this._getStrike(size);
    let image = this.getImageForSize(size);
    if (image == null) {
      return null;
    }

    let dimensions =
      image.type.trim() === 'png' ? pngDimensions(image.data) : null;

    return {
      ppem: table.ppem,
      resolution: table.resolution,
      image,
      dimensions,
    };
  }

  /**
   * Whether rendering this glyph at the given point size draws a bitmap.
   *
   * Bitmaps are designed for their strike's ppem and are used for every size
   * up to it: small text takes the first strike whose ppem is at least the
   * requested size. A size larger than every strike (the last strike's ppem
   * is below it) has no suitable bitmap and is rendered from the outline,
   * even though the strike still contains an image for the glyph. When this
   * is false, both the picture and every metric fall back to the outline as
   * one representation.
   *
   * @param {number} size
   * @return {boolean}
   */
  hasBitmapAtSize(size) {
    return (
      this._getStrike(size).ppem >= size && this.getImageForSize(size) != null
    );
  }

  /**
   * The metrics of the bitmap selected for the given point size, expressed in
   * the font's design units. Both the rendered pixels and these values come
   * from the same sbix strike, so a bitmap never borrows the outline's
   * advance width.
   *
   * Returns null when the size is rendered from the outline instead: either
   * the selected strike has no image for this glyph, or the requested size is
   * larger than every available strike.
   *
   * @param {number} size
   * @return {object|null}
   */
  getBitmapMetricsForSize(size) {
    if (!this.hasBitmapAtSize(size)) {
      return null;
    }

    let bitmap = this._getBitmapForSize(size);
    if (bitmap == null || bitmap.dimensions == null) {
      return null;
    }

    let unitsPerPixel = this._font.unitsPerEm / bitmap.ppem;
    let { width, height } = bitmap.dimensions;
    let { originX, originY } = bitmap.image;

    // sbix origins are measured up from the baseline, in design units.
    return {
      ppem: bitmap.ppem,
      resolution: bitmap.resolution,
      width,
      height,
      originX,
      originY,
      minX: originX,
      minY: originY - height * unitsPerPixel,
      maxX: originX + width * unitsPerPixel,
      maxY: originY,
      advanceWidth: width * unitsPerPixel,
      advanceHeight: height * unitsPerPixel,
      unitsPerPixel,
    };
  }

  /**
   * The glyph's advance width at the given point size, in design units.
   *
   * When the size selects a strike containing a bitmap for this glyph, the
   * advance is derived from that bitmap's width and belongs to the strike,
   * matching the pixels that would be drawn. Otherwise the outline's
   * typographic advance from `hmtx` is used.
   *
   * @param {number} size
   * @return {number}
   */
  advanceWidthForSize(size) {
    let metrics = this.getBitmapMetricsForSize(size);
    return metrics == null ? this.advanceWidth : metrics.advanceWidth;
  }

  render(ctx, size) {
    if (this.hasBitmapAtSize(size)) {
      let img = this.getImageForSize(size);
      let scale = size / this._font.unitsPerEm;
      ctx.image(img.data, {
        height: size,
        x: img.originX,
        y: (this.bbox.minY - img.originY) * scale,
      });

      // The font may ask for the outline drawn underneath the bitmap.
      if (this._font.sbix.flags.renderOutlines) {
        super.render(ctx, size);
      }
      return;
    }

    // No bitmap is drawn at this size (none exists, or the size is above every
    // strike), so render the outline, whose metrics advanceWidthForSize uses.
    super.render(ctx, size);
  }
}
