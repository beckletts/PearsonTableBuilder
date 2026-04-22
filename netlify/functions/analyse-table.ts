import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a data analyst assistant for Pearson's internal Table Builder tool.
You will receive spreadsheet column headers and up to 50 sample rows.
Return a JSON configuration object that drives an interactive data table.

OUTPUT RULES:
- Output ONLY valid JSON. No markdown fences, no explanation, no preamble.
- The JSON must exactly match this structure:

{
  "title": string,
  "description": string,
  "columns": [
    {
      "key": string,       // exact original header — never change this
      "label": string,     // Title Case display name, no underscores
      "visible": boolean,
      "filterable": boolean,
      "searchable": boolean,
      "type": "text" | "number" | "url" | "badge" | "date"
    }
  ],
  "primarySearchColumn": string,
  "defaultSort": { "column": string, "direction": "asc" | "desc" }
}

COLUMN TYPE RULES:
- "number": values are clearly numeric (integers, decimals, percentages — e.g. 42, 3.14, 95%)
- "url": values appear to be URLs (http/https) or email addresses
- "badge": categorical column with ≤15 distinct non-empty values (status, type, tier, grade, region, subject)
- "date": values are dates or date-times (e.g. 2024-01-15, 15/01/2024, Jan 2024, Q1 2025)
- "text": everything else (names, descriptions, free text, codes with many unique values)

VISIBILITY RULES:
- Hide columns named id, ID, _id, uuid, guid, or containing "internal", "sys_", or "_key"
- Hide columns where over 40% of sample rows are empty or null
- Show everything else

FILTERABLE RULES:
- true for clearly categorical columns (type, status, region, subject, grade, category, level, tier)
- true for date columns (allow filtering by year/period)
- false for free-text, high-cardinality columns like names, descriptions, or nearly-unique identifiers
- false for URL columns

SEARCHABLE RULES:
- true for at most 2 columns — the primary name, title, or code column
- primarySearchColumn = the single best column for a main search box (prefer a name or title field)

DEFAULT SORT:
- Sort by the most natural ordering column (date desc, name asc, order/rank asc)
- If no obvious sort column, use the first visible column ascending

TITLE: Short, professional title describing the dataset. Infer from column names and data context. Do not include the word "Table".
DESCRIPTION: One clear sentence describing what this dataset shows and who it is for.`;

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

  let body: { headers?: string[]; sampleRows?: Record<string, string>[] };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { headers: columnHeaders, sampleRows } = body;
  if (!columnHeaders?.length || !sampleRows?.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'headers and sampleRows are required' }) };
  }

  const csvSample = [
    columnHeaders.join(','),
    ...sampleRows.slice(0, 50).map((row) =>
      columnHeaders
        .map((h) => {
          const v = String(row[h] ?? '');
          return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(','),
    ),
  ].join('\n');

  const userMessage = `Spreadsheet columns: ${columnHeaders.join(', ')}\n\nSample data (${Math.min(sampleRows.length, 50)} rows):\n\n${csvSample}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    if (message.stop_reason === 'max_tokens') {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Response truncated — spreadsheet has too many columns. Try uploading fewer columns.' }) };
    }

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI did not return a valid configuration. Please try again.' }) };
    }

    let config: unknown;
    try {
      config = JSON.parse(jsonMatch[0]);
    } catch {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI returned malformed JSON. Please try again.' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ config }) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) };
  }
};

export { handler };
