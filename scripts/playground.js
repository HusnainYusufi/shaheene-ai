/**
 * Semantic search playground: learn pgvector with made-up reviews.
 *
 *   npm run db:up
 *   npm run playground                              # seed + demo searches
 *   npm run playground -- "المندوب كان محترم"         # search with your own text
 *
 * It works in a separate `playground` schema, so it never touches the service's tables.
 * Needs no API key: embeddings come from a local model (downloaded once into .models/).
 */
import path from 'node:path';
import pg from 'pg';
import { pipeline, env as hf } from '@huggingface/transformers';

hf.cacheDir = path.resolve(import.meta.dirname, '../.models');
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://shaheen:shaheen@localhost:5433/shaheen_ai';
const MODEL = 'Xenova/multilingual-e5-small'; // 384 numbers per text, Arabic + English

// Made-up demo reviews. `kind` is only there so you can see what each result is.
const REVIEWS = [
  ['genuine', 'المرتبة ممتازة والتوصيل كان سريع جدا والمندوب محترم'],
  ['copy-reworded', 'المرتبة رائعة والتوصيل سريع والمندوب كان محترم جدا'],
  ['copy-exact', 'المرتبة ممتازة والتوصيل كان سريع جدا والمندوب محترم'],
  ['translation', 'Great mattress, fast delivery and a polite driver'],
  ['genuine', 'وصلت المرتبة في نفس اليوم والمندوب ساعدنا نطلعها للدور الثاني'],
  ['genuine', 'The driver called before arriving and carried the bed frame upstairs'],
  ['generic', 'خدمة ممتازة'],
  ['generic', 'ممتاز جدا شكرا'],
  ['generic', 'Excellent service'],
  ['complaint', 'المندوب تأخر ثلاث ساعات ولم يرد على الهاتف'],
  ['complaint', 'The mattress arrived with a torn cover and nobody answered my calls'],
  ['other-business', 'مطعم البيك أفضل مطعم في جدة'],
  ['other-business', 'Best coffee in Riyadh, friendly barista'],
  ['product', 'المخدة مريحة جدا وساعدتني على النوم بدون ألم في الرقبة'],
];

const DEMO_QUERIES = [
  'المرتبة ممتازة والتوصيل كان سريع جدا والمندوب محترم', // exact copy hunt
  'the delivery guy was late and rude', // meaning, different language and words
  'نوم مريح', // "comfortable sleep": no word overlap with the pillow review
];

const toVector = (v) => `[${v.join(',')}]`;

async function main() {
  console.log(`Loading ${MODEL} (first run downloads ~120 MB)...`);
  const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const embed = async (texts) =>
    (
      await extractor(
        texts.map((t) => `query: ${t}`),
        { pooling: 'mean', normalize: true },
      )
    ).tolist();

  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();

  // 1. A table with a vector column. vector(384) = exactly 384 numbers per row.
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE SCHEMA IF NOT EXISTS playground;
    DROP TABLE IF EXISTS playground.reviews;
    CREATE TABLE playground.reviews (
      id        serial PRIMARY KEY,
      kind      text NOT NULL,
      text      text NOT NULL,
      embedding vector(384) NOT NULL
    );`);

  // 2. Turn every review into numbers (an embedding) and store it.
  const vectors = await embed(REVIEWS.map(([, text]) => text));
  for (const [i, [kind, text]] of REVIEWS.entries()) {
    await db.query('INSERT INTO playground.reviews (kind, text, embedding) VALUES ($1, $2, $3)', [
      kind,
      text,
      toVector(vectors[i]),
    ]);
  }
  console.log(`\nStored ${REVIEWS.length} reviews. First 5 of the 384 numbers for review 1:`);
  console.log(
    `  [${vectors[0]
      .slice(0, 5)
      .map((x) => x.toFixed(4))
      .join(', ')}, ...]`,
  );

  // 3. An HNSW index: finds the nearest vectors without comparing against every row.
  await db.query('CREATE INDEX ON playground.reviews USING hnsw (embedding vector_cosine_ops)');

  // 4. Semantic search: <=> is cosine distance. Similarity = 1 - distance.
  const queries = process.argv.slice(2).length ? process.argv.slice(2) : DEMO_QUERIES;
  for (const q of queries) {
    const [qv] = await embed([q]);
    const { rows } = await db.query(
      `SELECT id, kind, text, 1 - (embedding <=> $1) AS similarity
         FROM playground.reviews
        ORDER BY embedding <=> $1
        LIMIT 5`,
      [toVector(qv)],
    );
    console.log(`\nSearch: "${q}"`);
    for (const r of rows) {
      console.log(
        `  ${Number(r.similarity).toFixed(3)}  #${String(r.id).padEnd(3)} ${r.kind.padEnd(15)} ${r.text}`,
      );
    }
  }

  console.log(`
Now open pgAdmin (http://localhost:5050) > shaheen-ai (local) > shaheen_ai > Query Tool, and try:

  -- every review, nearest first, compared with review #1
  SELECT b.id, b.kind, b.text, round((1 - (a.embedding <=> b.embedding))::numeric, 3) AS similarity
    FROM playground.reviews a, playground.reviews b
   WHERE a.id = 1
   ORDER BY a.embedding <=> b.embedding;

  -- look at the raw vector
  SELECT id, vector_dims(embedding), embedding FROM playground.reviews WHERE id = 1;
`);
  await db.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
