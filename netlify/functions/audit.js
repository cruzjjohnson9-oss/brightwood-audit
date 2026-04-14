exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, key: !!process.env.ANTHROPIC_API_KEY }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { niche, clients, sessionsPerWeek, programLength, tools, manualTasks, hoursPerWeek, extraContext } = body;

  const prompt = `You are an expert AI automation consultant who audits coaching businesses. Be direct, specific, no fluff. Think like someone who has built AI systems for hundreds of coaches.

COACH INFO:
- Niche: ${niche || 'coaching'}
- Active clients: ${clients || 'unknown'}
- Sessions/week: ${sessionsPerWeek || 'unknown'}
- Program length: ${programLength || 'unknown'}
- Tools used: ${tools || 'none specified'}
- Admin hours/week: ${hoursPerWeek || 'unknown'}
- Manual tasks: ${manualTasks || 'general admin'}
${extraContext ? `- Notes: ${extraContext}` : ''}

Return ONLY valid JSON. No markdown. No extra text. Fill every field with real, specific content for this coach:

{
  "score": 15,
  "grade": "D",
  "grade_label": "Flying Blind",
  "hours_wasted": "12 hrs/wk",
  "hours_saved_total": "9 hrs/wk",
  "clients_now": "8",
  "clients_possible": "25",
  "summary": "2 honest sentences. Name exactly what's costing them — their specific tasks, their niche. No generic statements.",
  "automations": [
    {
      "rank": 1,
      "name": "Specific Automation Name",
      "what_it_does": "One concrete sentence — what triggers it, what it produces, where it sends it.",
      "time_saved": "3 hrs/wk",
      "impact": "high",
      "without_it": "One sentence on the real cost — lost clients, burnout, dropped balls."
    },
    {
      "rank": 2,
      "name": "Specific Automation Name",
      "what_it_does": "One concrete sentence.",
      "time_saved": "2 hrs/wk",
      "impact": "high",
      "without_it": "One sentence."
    },
    {
      "rank": 3,
      "name": "Specific Automation Name",
      "what_it_does": "One concrete sentence.",
      "time_saved": "2 hrs/wk",
      "impact": "medium",
      "without_it": "One sentence."
    },
    {
      "rank": 4,
      "name": "Specific Automation Name",
      "what_it_does": "One concrete sentence.",
      "time_saved": "1.5 hrs/wk",
      "impact": "medium",
      "without_it": "One sentence."
    },
    {
      "rank": 5,
      "name": "Specific Automation Name",
      "what_it_does": "One concrete sentence.",
      "time_saved": "1 hr/wk",
      "impact": "low",
      "without_it": "One sentence."
    }
  ]
}

GRADE LABELS to choose from based on their score:
- 0–20: "Flying Blind"
- 21–40: "Winging It Week to Week"
- 41–60: "Some Systems, Still Leaking"
- 61–80: "Getting There"
- 81–100: "Well-Oiled Machine"

Be specific to their niche (${niche || 'coaching'}). The automation names and descriptions must reflect their actual tasks — not generic placeholders. hours_saved_total = sum of all 5 time_saved values.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 24000);

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: `API error: ${err}` }) };
    }

    const data = await res.json();
    const text = data.content[0].text.trim();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { parsed = JSON.parse(match[0]); }
      else { return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to parse AI response', raw: text.slice(0, 300) }) }; }
    }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { statusCode: 504, headers, body: JSON.stringify({ error: 'Request timed out — AI took too long. Try again.' }) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
