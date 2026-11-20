'use strict';
const sharp = require('sharp');

/**
 * 64-bit difference hash (dHash). Resizes to 9x8 greyscale and compares
 * neighbouring pixels. Robust to re-compression, resizing and small crops of
 * the same screenshot; returned as an unsigned BigInt.
 */
async function dHash(buffer) {
  const { data } = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

function hammingDistance(a, b) {
  let x = BigInt.asUintN(64, BigInt(a) ^ BigInt(b));
  let count = 0;
  while (x) {
    x &= x - 1n;
    count += 1;
  }
  return count;
}

/** Postgres bigint is signed: store as signed, read back with toUnsigned64. */
const toSigned64 = (h) => BigInt.asIntN(64, BigInt(h));
const toUnsigned64 = (h) => BigInt.asUintN(64, BigInt(h));

module.exports = { dHash, hammingDistance, toSigned64, toUnsigned64 };
