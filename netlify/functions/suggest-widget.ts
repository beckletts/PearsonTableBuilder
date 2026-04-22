import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a UI design assistant for Pearson's internal Table Builder tool.
A colleague without coding experience wants to add a visual element to their published interactive data table.
Based on their request and the table's data structure, return a single widget configuration.

OUTPUT: ONLY valid JSON. No markdown fences, no explanation, no preamble. Match one of these exact structures:

INTRO BANNER — large heading section displayed above the search panel:
{ "type": "intro_banner", "config": { "heading": "string", "subtitle": "string" } }

CALLOUT BOX — important notice or context shown between the search panel and results:
{ "type": "callout_box", "config": { "text": "string" } }

STAT CARDS — 2 or 3 summary statistics computed from the dataset, shown above the search panel:
{ "type": "stat_cards", "config": { "stats": [{ "label": "string", "type": "total_rows" | "unique_values", "column": "exact_column_key (required when type=unique_values)" }] } }

CARD VIEW — displays results as visual cards instead of a table (adds a toggle to switch between views):
{ "type": "card_view", "config": { "titleColumn": "exact_column_key", "subtitleColumn": "exact_column_key", "badgeColumns": ["exact_column_key"], "linkColumn": "exact_column_key", "descriptionColumn": "exact_column_key" } }

FOOTER NOTE — custom text at the bottom of the page:
{ "type": "footer_note", "config": { "text": "string", "showCount": true | false } }

RULES:
- Use exact column "key" values (not display labels) for all column references
- For stat_cards: pick meaningful stats (e.g. total records, unique universities, unique countries)
- For card_view: titleColumn = most identifying column (name/title/degree); omit optional fields if no suitable column exists
- For intro_banner: write a concise professional heading and subtitle describing the dataset
- Return ONLY the JSON object, no other text`;

async function validateUser(jwt: string): Promise<boolean> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  return !error && !!user;
}

const handler: Handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };

  const jwt = (event.headers['authorization'] ?? '').replace('Bearer ', '');
  if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };

  const valid = await validateUser(jwt);
  if (!valid) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session' }) };

  let body: { prompt?: string; tableTitle?: string; columns?: Array<{ key: string; label: string; type: string; filterable: boolean }>; sampleRows?: Record<string, unknown>[] };
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { prompt, tableTitle, columns, sampleRows } = body;
  if (!prompt || !columns?.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'prompt and columns are required' }) };
  }

  const columnSummary = columns
    .map((c) => `  key="${c.key}"  label="${c.label}"  type=${c.type}  filterable=${c.filterable}`)
    .join('\n');

  const sampleStr = (sampleRows ?? []).slice(0, 10).map((r) => JSON.stringify(r)).join('\n');

  const userMessage = `Table: ${tableTitle ?? 'Untitled'}

Columns:
${columnSummary}

Sample rows:
${sampleStr}

User request: "${prompt}"`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI did not return a valid element. Please try again.' }) };

    let widget: unknown;
    try { widget = JSON.parse(jsonMatch[0]); }
    catch { return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI returned malformed JSON. Please try again.' }) }; }

    return { statusCode: 200, headers, body: JSON.stringify({ widget }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }) };
  }
};

export { handler };
