import { z } from 'zod';

/** Second-pass judgement on the review text. */
const ClassificationSchema = z.object({
  authenticity: z
    .enum(['genuine', 'templated', 'unclear'])
    .describe('templated = generic text that could be pasted for any order or business'),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  praisesBusiness: z
    .boolean()
    .describe(
      'The text says something good about Legend Sleep: products, ordering, delivery, driver or service',
    ),
  mentionsProduct: z.boolean().describe('Mentions a product, delivery, driver or service detail'),
  confidence: z.number().min(0).max(1),
  rationale: z.string().describe('One or two short sentences, English'),
});

export { ClassificationSchema };
