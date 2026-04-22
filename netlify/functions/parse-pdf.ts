import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a data extraction assistant for Pearson's internal Table Builder tool.
You will receive a PDF document. Extract all tabular data from it and return a single JSON object.

OUTPUT: ONLY valid JSON — no markdown fences, no explanation. Exact structure:

{
  "config": {
    "title": string,
    "description": string,
    "columns": [
      {
        "key": string,         // snake_case, no spaces (e.g. "subject_code", "first_name")
        "label": string,       // Title Case display name
        "visible": boolean,
        "filterable": boolean,
        "searchable": boolean,
        "type": "text" | "number" | "url" | "badge"
      }
    ],
    "primarySearchColumn": string,
    "defaultSort": { "column": string, "direction": "asc" | "desc" }
  },
  "rows": [
    { "column_key": "value" }
  ]
}

EXTRACTION RULES:
- Extract ALL rows from the table(s) found in the document
- If multiple tables exist, combine them if they share the same columns; otherwise use the largest
- Every row object must have exactly the same keys as defined in config.columns
- Missing cells should be empty string ""

COLUMN RULES:
- "badge" type: categorical with ≤10 distinct values (status, type, grade, region)
- "url" type: web addresses or email addresses
- "number" type: clearly numeric values (integers, decimals, percentages)
- "text" type: everything else
- filterable = true for categorical/badge columns
- searchable = true for at most 2 columns — the main name or title column only
- Hide (visible: false) columns that appear to be internal IDs or system fields

TITLE: Short, professional title inferred from the document — do not include the word "Table".
DESCRIPTION: One sentence describing what this data shows.`;

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

  let body: { pdfBase64?: string };
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { pdfBase64 } = body;
  if (!pdfBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'pdfBase64 is required' }) };

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          } as Parameters<typeof client.messages.create>[0]['messages'][0]['content'][0],
          { type: 'text', text: 'Extract all tabular data from this PDF and return the JSON as specified.' },
        ],
      }],
    });

    if (message.stop_reason === 'max_tokens') {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'PDF has too much data to extract in one pass. Try a PDF with fewer rows.' }) };
    }

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not extract table data from this PDF. Make sure it contains a visible table.' }) };

    let result: unknown;
    try { result = JSON.parse(jsonMatch[0]); }
    catch { return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI returned malformed JSON. Please try again.' }) }; }

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }) };
  }
};

export { handler };
