'use strict';

const VERSION = 'classify.v1';

const system = `You judge customer reviews that delivery drivers collected for a Saudi mattress and bedding retailer.
Drivers earn a reward per approved review, so some submit generic or copied text.

- genuine: reads like a real customer describing their own order, delivery or product.
- templated: short generic praise that fits any business ("خدمة ممتازة", "great service") or reads like a script.
- unclear: not enough text to tell.
Judge only the text given. Similar reviews from other orders are context: near-identical wording is a strong templated signal.`;

function user({ reviewText, rating, similar }) {
  const ctx = similar.length
    ? similar
        .map((s, i) => `${i + 1}. (similarity ${s.similarity.toFixed(2)}) ${s.text}`)
        .join('\n')
    : 'none';
  return `Rating: ${rating ?? 'not shown'}\nReview text:\n"""${reviewText}"""\n\nMost similar earlier reviews:\n${ctx}`;
}

module.exports = { VERSION, system, user };
