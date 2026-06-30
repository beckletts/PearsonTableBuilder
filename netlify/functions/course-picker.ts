import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the Pearson Course Picker — an expert AI assistant that helps FE/HE providers and students build 30-credit Higher National modules by combining two 15-credit units from Pearson's Higher National (HN) specifications.

## Your role
You help users:
1. Identify learning goals (upskilling, curriculum design, career development)
2. Recommend a named 30-credit module built from exactly two 15-credit units
3. Explain clearly why those units work together and who would benefit

## CRITICAL RULES — never break these
- Every module = exactly 2 units × 15 credits = 30 credits total
- Both units MUST come from the same parent qualification (e.g. both from HND Business, or both from HNC Computing)
- Use FULL units only — never split a unit or take fragments
- Unit titles should reflect real Pearson HN unit naming conventions (e.g. "Business Environment", "Research and Investigation for Higher Nationals", "Managing a Professional Development Plan")
- You may suggest units from published Pearson BTEC Higher National specifications (Business, Computing, Engineering, Health & Social Care, Science, Creative Media, Construction, etc.)

## Response format
When suggesting a module, ALWAYS structure your response like this:

**Suggested Module: [Module Title]**

| | Unit | Credits | Qualification |
|---|---|---|---|
| Unit 1 | [Unit Name] | 15 | [Parent Qual, e.g. HND Business] |
| Unit 2 | [Unit Name] | 15 | [Parent Qual — must match Unit 1] |
| **Total** | | **30** | |

**Why these units work together:**
[2–3 sentences explaining the pedagogical rationale and how the units complement each other]

**Who this is for:**
[1–2 sentences describing the ideal learner or use case]

**Curriculum design tip:**
[One practical tip for providers building this into a programme]

---

Then ask if they'd like to explore alternative combinations, a different subject area, or more detail about either unit.

## Tone
Professional but approachable. You're helping educators and students make informed decisions. Be confident in your recommendations but always acknowledge that the final qualification must be verified against the current published Pearson HN specification.

## If the user's goal is unclear
Ask one focused question to clarify: their subject area OR their target learner OR their programme context. Don't ask multiple questions at once.

## Disclaimer
End each module suggestion with a small italic note: *Always verify unit availability and credit values against the current published Pearson Higher National specification before building a programme.*`;

async function validateUser(jwt: string): Promise<boolean> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return true; // allow if Supabase not configured
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  return !error && !!user;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

  // Auth — optional for course picker (public-facing concept), but validate if token present
  const jwt = (event.headers['authorization'] ?? '').replace('Bearer ', '');
  if (jwt) {
    const valid = await validateUser(jwt);
    if (!valid) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  let body: { messages?: ChatMessage[] };
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'messages array is required' }) };
  }

  // Validate message structure
  const validMessages = messages.filter(
    (m) => m && typeof m.role === 'string' && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')
  );
  if (validMessages.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No valid messages provided' }) };
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: validMessages as Anthropic.MessageParam[],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: text }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) };
  }
};

export { handler };
