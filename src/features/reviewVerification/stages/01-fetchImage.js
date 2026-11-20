'use strict';
const crypto = require('crypto');
const sharp = require('sharp');
const { CODES, reason } = require('../reasonCodes');

const MAX_SIDE = 1600; // enough to read review text; keeps vision tokens down

/** Downloads the screenshot and prepares a re-encoded copy for the LLM (EXIF stripped). */
async function run(ctx, deps) {
  const { buffer } = await deps.legendDelivery.fetchScreenshot(ctx.input.reviewId);
  ctx.image = { buffer, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };

  try {
    const jpeg = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    ctx.image.llm = { mediaType: 'image/jpeg', data: jpeg.toString('base64') };
  } catch (err) {
    ctx.reasons.push(reason(CODES.IMAGE_UNREADABLE, err.message));
    ctx.stop = true;
  }
}

module.exports = { name: 'fetchImage', run };
