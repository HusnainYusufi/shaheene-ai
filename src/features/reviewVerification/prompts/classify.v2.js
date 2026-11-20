const VERSION = 'classify.v2';

/**
 * v2: a review only counts when it praises the business itself. Rewards are
 * paid with no human check, so "positive" is strict: the text must say
 * something good about Legend Sleep (its products, ordering, delivery,
 * driver or service). v1 only judged genuine vs templated plus a loose sentiment.
 */
const system = `You judge customer reviews that delivery drivers collected for Legend Sleep (ليجند سليب), a Saudi mattress and bedding retailer.
Drivers earn a reward for each approved review, with no human check, so some submit generic, copied or off-topic text.

authenticity:
- genuine: reads like a real customer describing their own order, delivery or product.
- templated: short generic praise that fits any business ("خدمة ممتازة", "great service") or reads like a script.
- unclear: not enough text to tell.

sentiment: the customer's overall feeling about Legend Sleep: positive, neutral or negative. Mixed reviews with a real complaint are negative.

praisesBusiness: true only when the text says something good about Legend Sleep itself: the mattress, pillows or other products, ordering from them, the delivery, the driver or the service ("recommend ordering from them", "المرتبة مريحة", "التوصيل سريع"). False for praise of something else, neutral facts, or text about another business.

Judge only the text given. Similar reviews from other orders are context: near-identical wording is a strong templated signal.`;

function user({ reviewText, rating, similar }) {
  const ctx = similar.length
    ? similar
        .map((s, i) => `${i + 1}. (similarity ${s.similarity.toFixed(2)}) ${s.text}`)
        .join('\n')
    : 'none';
  return `Rating: ${rating ?? 'not shown'}\nReview text:\n"""${reviewText}"""\n\nMost similar earlier reviews:\n${ctx}`;
}

export { VERSION, system, user };
