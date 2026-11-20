'use strict';

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigits(s) {
  return s.replace(ARABIC_DIGITS, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/**
 * Normalise Arabic (and mixed) text for matching and embeddings:
 * strips diacritics and tatweel, unifies alef / yaa / taa marbuta forms,
 * converts Arabic-Indic digits, lowercases Latin, collapses whitespace.
 */
function normalizeArabic(input) {
  if (input == null) return '';
  return toLatinDigits(String(input))
    .normalize('NFKC')
    .replace(TASHKEEL, '')
    .replace(TATWEEL, '')
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ؤ/g, 'و') // ؤ -> و
    .replace(/ئ/g, 'ي') // ئ -> ي
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Comparison key for names: normalised, punctuation and spaces removed. */
function nameKey(input) {
  return normalizeArabic(input).replace(/[^\p{L}\p{N}]+/gu, '');
}

// Saudi mobiles (+966 5x / 05x / 5x) and any other run of 9+ digits with separators.
const PHONE = /(?:\+|00)?\d(?:[\s\-().]*\d){8,}/g;

/** Replace phone numbers with [PHONE] before text leaves the service or is stored. */
function scrubPhones(input) {
  if (input == null) return '';
  return toLatinDigits(String(input)).replace(PHONE, '[PHONE]');
}

module.exports = { normalizeArabic, nameKey, scrubPhones, toLatinDigits };
