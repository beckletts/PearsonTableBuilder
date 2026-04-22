import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a data analyst assistant for Pearson's internal Table Builder tool.
You will receive spreadsheet column headers and up to 20 sample rows.
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
      "type": "text" | "number" | "url" | "badge"
    }
  ],
  "primarySearchColumn": string,
  "defaultSort": { "column": string, "direction": "asc" | "desc" }
}

COLUMN TYPE RULES:
- "number": values are clearly numeric (integers, decimals, percentages)
- "url": values appear to be URLs or email addresses
- "badge": categorical column with ≤10 distinct values (status, type, tier, grade, region)
- "text": everything else

VISIBILITY RULES:
- Hide columns named id, ID, _id, uuid, guid, or containing "internal" or "sys_"
- Hide columns where over 40% of sample rows are empty
- Show everything else

FILTERABLE RULES:
- true for clearly categorical columns (type, status, region, subject, grade, category)
- false for free-text, numeric ranges, or nearly-unique columns like names or URLs

SEARCHABLE RULES:
- true for at most 2 columns — the primary name or title column only
- primarySearchColumn = the single best column for a search box

TITLE: Short, professional. Infer from column names and data. Don't include the word "Table".
DESCRIPTION: One sentence describing what this data shows.`;

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
    ...sampleRows.slice(0, 20).map((row) =>
      columnHeaders
        .map((h) => {
          const v = String(row[h] ?? '');
          return v.includes(',') ? `"${v}"` : v;
        })
        .join(','),
    ),
  ].join('\n');

  const userMessage = `Column headers: ${columnHeaders.join(', ')}\n\nSample data:\n\n${csvSample}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
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
