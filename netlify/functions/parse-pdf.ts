import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a data extraction assistant for Pearson's internal Table Builder tool.
You will receive a PDF document (which may be a Pearson fees schedule, qualification catalogue, assessment timetable, or similar). Extract tabular data and return a single JSON object.

OUTPUT: ONLY valid JSON — no markdown fences, no explanation, no preamble.

EXACT OUTPUT STRUCTURE:
{
  "config": {
    "title": string,
    "description": string,
    "columns": [
      {
        "key": string,         // snake_case identifier, no spaces (e.g. "qual_code", "fee_amount")
        "label": string,       // Title Case display name (e.g. "Qualification Code", "Fee Amount")
        "visible": boolean,
        "filterable": boolean,
        "searchable": boolean,
        "type": "text" | "number" | "url" | "badge" | "date"
      }
    ],
    "primarySearchColumn": string,  // key of the best search column (name, title, or code)
    "defaultSort": { "column": string, "direction": "asc" | "desc" }
  },
  "rows": [
    { "column_key": "value", ... }
  ],
  "truncated": boolean,            // true if you could not fit all rows due to output length
  "totalRowsEstimate": number      // your estimate of the total rows in the document
}

TABLE IDENTIFICATION RULES:
- Scan every page of the PDF for tables (grids with headers and data rows)
- If multiple tables share the same columns (e.g. fees split across pages or qualification types), MERGE them into one dataset
- If multiple tables have DIFFERENT structures, choose the largest or most complete table
- Ignore decorative tables, navigation bars, or tables that are just section headers

COLUMN TYPE RULES:
- "number": clearly numeric values — fees (£12.00), counts, percentages
- "date": dates or periods — exam dates, academic years (2025-26), quarters
- "badge": categorical with ≤15 distinct values — qualification type, level, tier, region, subject area
- "url": web links or email addresses
- "text": everything else — names, codes, descriptions

COLUMN RULES:
- filterable = true for badge/categorical columns and date columns
- searchable = true for at most 2 columns — the primary name or code column
- Hide (visible: false) internal ID fields or system reference columns

ROW EXTRACTION RULES:
- Extract up to 200 rows. If the table has more, extract the first 200 and set "truncated": true
- Every row must have exactly the same keys as defined in config.columns
- Missing or empty cells → empty string ""
- Strip currency symbols from number values (£12.00 → "12.00")
- Preserve leading zeros in codes (e.g. "0123" not "123")

TITLE: Short, professional — infer from the document heading or filename context. Omit the word "Table".
DESCRIPTION: One sentence summarising what data this is and who it is for (e.g. "UK general qualification fees for centres registering candidates in 2025–26").`;

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
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            cache_control: { type: 'ephemeral' },
          } as Parameters<typeof client.messages.create>[0]['messages'][0]['content'][0],
          {
            type: 'text',
            text: 'Extract the tabular data from this PDF. Return the JSON exactly as specified — no markdown, no explanation.',
          },
        ],
      }],
    });

    if (message.stop_reason === 'max_tokens') {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'This PDF has too many tables or rows to extract in one go. Try uploading individual sections or pages of the document.',
        }),
      };
    }

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON — be tolerant of any leading/trailing text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'No table data found in this PDF. Make sure it contains a visible data table (not just charts or images).' }),
      };
    }

    let result: { config?: unknown; rows?: unknown[]; truncated?: boolean; totalRowsEstimate?: number };
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI returned malformed data. Please try again.' }) };
    }

    if (!result.config || !Array.isArray(result.rows) || result.rows.length === 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Could not extract table data from this PDF. The document may contain charts or images rather than data tables.' }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) };
  }
};

export { handler };
