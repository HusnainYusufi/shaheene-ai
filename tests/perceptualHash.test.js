// Run: node tests/perceptualHash.test.js
import assert from 'node:assert';
import sharp from 'sharp';
import { dHash, hammingDistance, toSigned64, toUnsigned64 } from '../src/utils/perceptualHash.js';

/** Synthetic "screenshot": a gradient with dark blocks, no real images needed. */
async function makeImage({ width = 400, height = 800, flip = false } = {}) {
  const px = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = Math.floor((x / width) * 200 + (y / height) * 55);
      if ((Math.floor(y / 100) + Math.floor(x / 100)) % 3 === 0) v = 20;
      if (flip) v = 255 - v;
      px.fill(v, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return sharp(px, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

(async () => {
  const original = await makeImage();
  const h1 = await dHash(original);

  // Same image re-encoded as JPEG and resized: what a re-upload looks like.
  const reencoded = await sharp(original).resize(300).jpeg({ quality: 60 }).toBuffer();
  const h2 = await dHash(reencoded);
  assert.ok(hammingDistance(h1, h2) <= 4, `re-encoded distance ${hammingDistance(h1, h2)}`);
  console.log(`ok - re-encoded copy is near (distance ${hammingDistance(h1, h2)})`);

  const different = await makeImage({ flip: true });
  const h3 = await dHash(different);
  assert.ok(hammingDistance(h1, h3) > 20, `different distance ${hammingDistance(h1, h3)}`);
  console.log(`ok - different image is far (distance ${hammingDistance(h1, h3)})`);

  assert.strictEqual(hammingDistance(h1, h1), 0);
  assert.strictEqual(hammingDistance(0n, 0xffffffffffffffffn), 64);
  console.log('ok - hamming bounds');

  const big = 0xfedcba9876543210n;
  assert.ok(toSigned64(big) < 0n);
  assert.strictEqual(toUnsigned64(toSigned64(big)), big);
  console.log('ok - signed bigint round trip');

  console.log('\n4 passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
