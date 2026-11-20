'use strict';
const { z } = require('zod');

/** Second-pass judgement on the review text. */
const ClassificationSchema = z.object({
  authenticity: z
    .enum(['genuine', 'templated', 'unclear'])
    .describe('templated = generic text that could be pasted for any order or business'),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  mentionsProduct: z.boolean().describe('Mentions a product, delivery, driver or service detail'),
  confidence: z.number().min(0).max(1),
  rationale: z.string().describe('One or two short sentences, English'),
});

module.exports = { ClassificationSchema };
