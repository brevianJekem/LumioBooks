// ─── LumioBooks AI Engine ─────────────────────────────────────────────────────
// Powered by Claude — semantic search, recommendations, summaries

const CLAUDE_MODEL = 'claude-sonnet-4-6';

async function callClaude(prompt, maxTokens = 1000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ─── 1. Semantic Search ───────────────────────────────────────────────────────
// Takes a natural language query + list of books
// Returns ranked book IDs with relevance reasoning
export async function semanticSearch(query, books) {
  if (!books.length) return [];

  const bookList = books.map((b, i) =>
    `[${i}] ID:${b.id} | Title: ${b.title} | Author: ${b.author} | Category: ${b.category} | Description: ${b.description || 'none'}`
  ).join('\n');

  const prompt = `You are a librarian AI. A user searched: "${query}"

Here are the available books:
${bookList}

Return ONLY a JSON array of the most relevant book indices (0-based), ranked by relevance, max 12. Example: [3,0,7,2]
If none are relevant, return [].
No explanation, just the JSON array.`;

  try {
    const text    = await callClaude(prompt, 200);
    const match   = text.match(/\[[\d,\s]*\]/);
    const indices = match ? JSON.parse(match[0]) : [];
    return indices.map(i => books[i]).filter(Boolean);
  } catch {
    return books;
  }
}

// ─── 2. Smart Query Expansion ─────────────────────────────────────────────────
// Expands a natural language query into search keywords for Gutenberg/OpenLibrary
export async function expandQuery(query) {
  const prompt = `Convert this natural language book search into 2-4 short search keywords for a library API.
Query: "${query}"
Return ONLY a JSON array of keyword strings. Example: ["renewable energy","Africa","sustainability"]
No explanation.`;

  try {
    const text  = await callClaude(prompt, 100);
    const match = text.match(/\[.*?\]/s);
    return match ? JSON.parse(match[0]) : [query];
  } catch {
    return [query];
  }
}

// ─── 3. Book Recommendations ──────────────────────────────────────────────────
// Given a book, suggest related titles from the library
export async function getRecommendations(book, allBooks) {
  if (allBooks.length < 2) return [];

  const others = allBooks
    .filter(b => b.id !== book.id)
    .map((b, i) => `[${i}] ${b.title} by ${b.author} (${b.category})`)
    .join('\n');

  const prompt = `A reader just opened "${book.title}" by ${book.author} (${book.category}).
${book.description ? `Description: ${book.description}` : ''}

From this library, suggest the 4 most relevant books they'd enjoy next:
${others}

Return ONLY a JSON array of indices. Example: [2,5,0,8]`;

  try {
    const text    = await callClaude(prompt, 100);
    const match   = text.match(/\[[\d,\s]*\]/);
    const indices = match ? JSON.parse(match[0]) : [];
    const filtered = allBooks.filter(b => b.id !== book.id);
    return indices.map(i => filtered[i]).filter(Boolean).slice(0, 4);
  } catch {
    return [];
  }
}

// ─── 4. AI Summary ───────────────────────────────────────────────────────────
// Generate a compelling 2-sentence summary for a book
export async function generateSummary(book) {
  const prompt = `Write a compelling 2-sentence summary for this book that would make a reader want to read it.
Title: ${book.title}
Author: ${book.author}
Category: ${book.category}
${book.description ? `Known about it: ${book.description}` : ''}
${book.year ? `Year: ${book.year}` : ''}

Write only the 2 sentences. No quotes, no preamble.`;

  try {
    return await callClaude(prompt, 150);
  } catch {
    return book.description || '';
  }
}

// ─── 5. Search Intent Detection ──────────────────────────────────────────────
// Detects if a query is natural language (semantic) or a simple keyword
export function isSemanticQuery(query) {
  if (!query || query.length < 8) return false;
  const semanticSignals = [
    /show me/i, /find books?/i, /looking for/i, /about/i,
    /discuss(ing)?/i, /related to/i, /written (after|before|in)/i,
    /post-\d{4}/i, /\d{4}s?/i, /east africa/i, /kenya/i,
    /that (deal|talk|focus)/i, /explain/i, /help me understand/i,
  ];
  return semanticSignals.some(r => r.test(query)) || query.split(' ').length > 3;
}