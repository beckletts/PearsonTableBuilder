import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a data analyst specialising in joining spreadsheets for educational datasets.

You will receive 2 or more spreadsheets, each with a name, column headers, and up to 20 sample rows.

Your task: find the ONE column in EACH spreadsheet that contains the same real-world identifiers — the join key that links all the sheets together. Focus on the actual cell VALUES, not just the column names. The same data often appears under different header names (e.g. "examination_code", "Component Code", "exam_code", "Unit Code" may all contain the same alphanumeric identifiers).

Look for:
- Shared alphanumeric codes (e.g. "31674H", "30012H", "A/507/6330")
- Shared reference numbers that appear in multiple sheets
- Columns where values in one sheet match values in another

Return ONLY valid JSON. No markdown, no explanation outside the JSON:
{
  "canonical_name": string,    // clean unified display name for the join key, e.g. "Examination Code"
  "confidence": number,         // 0.0–1.0 overall confidence
  "mappings": [
    {
      "source_name": string,   // spreadsheet name as provided
      "column": string,         // exact column header in that sheet
      "confidence": number      // 0.0–1.0
    }
  ],
  "reasoning": string,         // 1-2 sentences explaining which values matched across sheets
  "pattern": string            // describe the value pattern, e.g. "5–6 digit numbers followed by a letter, e.g. 31674H"
}

If no common key can be found with confidence > 0.4, set confidence to your best estimate and explain in reasoning.`;

async function validateUser(jwt: string): Promise<boolean> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
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

  interface SourceInput {
    name: string;
    headers: string[];
    sample_rows: Record<string, string>[];
  }

  let body: { sources?: SourceInput[] };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { sources } = body;
  if (!sources || sources.length < 2) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'At least 2 sources are required' }) };
  }

  const sourceDescriptions = sources.map((src) => {
    const sampleCsv = [
      src.headers.join(' | '),
      ...src.sample_rows.slice(0, 20).map((row) =>
        src.headers.map((h) => String(row[h] ?? '')).join(' | ')
      ),
    ].join('\n');
    return `=== ${src.name} ===\nColumns: ${src.headers.join(', ')}\n\nSample data:\n${sampleCsv}`;
  }).join('\n\n');

  const userMessage = `Analyze these ${sources.length} spreadsheets and find their common join key:\n\n${sourceDescriptions}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw);

    return { statusCode: 200, headers, body: JSON.stringify(json) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Claude analysis failed: ${msg}` }) };
  }
};

export { handler };
