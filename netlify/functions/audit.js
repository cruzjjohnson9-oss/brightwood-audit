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

  const prompt = `You are an expert AI automation consultant who audits coaching businesses. Be direct, specific, and no fluff.

COACH INFO:
- Niche: ${niche || 'coaching'}
- Active clients: ${clients || 'unknown'}
- Sessions/week: ${sessionsPerWeek || 'unknown'}
- Program length: ${programLength || 'unknown'}
- Tools used: ${tools || 'none specified'}
- Admin hours/week: ${hoursPerWeek || 'unknown'}
- Manual tasks: ${manualTasks || 'general admin'}
${extraContext ? `- Notes: ${extraContext}` : ''}

Return ONLY valid JSON. No markdown fences. No explanation. Fill every field:

{
  "score": 15,
  "grade": "D",
  "grade_label": "Fully Manual",
  "hours_wasted": "12 hrs/wk",
  "hours_after": "2 hrs/wk",
  "clients_now": "8",
  "clients_possible": "25",
  "revenue_unlock": "$4k–$6k/mo",
  "summary": "Two honest sentences about where they are and what it's costing them.",
  "automations": [
    {
      "rank": 1,
      "name": "Automated Client Onboarding",
      "what_it_does": "One sentence describing exactly what it does.",
      "time_saved": "3 hrs/wk",
      "impact": "high",
      "without_it": "One sentence on what breaks without it.",
      "build_with": ["tool1", "tool2"]
    },
    {
      "rank": 2,
      "name": "Session Prep & Notes AI",
      "what_it_does": "One sentence.",
      "time_saved": "2 hrs/wk",
      "impact": "high",
      "without_it": "One sentence.",
      "build_with": ["tool1", "tool2"]
    },
    {
      "rank": 3,
      "name": "Automated Follow-Up Sequences",
      "what_it_does": "One sentence.",
      "time_saved": "2 hrs/wk",
      "impact": "medium",
      "without_it": "One sentence.",
      "build_with": ["tool1", "tool2"]
    },
    {
      "rank": 4,
      "name": "Payment & Scheduling Automation",
      "what_it_does": "One sentence.",
      "time_saved": "1.5 hrs/wk",
      "impact": "medium",
      "without_it": "One sentence.",
      "build_with": ["tool1", "tool2"]
    },
    {
      "rank": 5,
      "name": "Progress Tracking & Reporting",
      "what_it_does": "One sentence.",
      "time_saved": "1.5 hrs/wk",
      "impact": "medium",
      "without_it": "One sentence.",
      "build_with": ["tool1", "tool2"]
    }
  ],
  "quick_wins": [
    "Specific action they can do this week.",
    "Second specific action.",
    "Third specific action."
  ],
  "roadmap_phases": [
    { "phase": "Week 1–2", "focus": "One sentence on what to build first and why." },
    { "phase": "Week 3–4", "focus": "One sentence on what to build next." },
    { "phase": "Month 2+", "focus": "One sentence on the long-term foundation." }
  ]
}

Be specific to their niche (${niche || 'coaching'}). Replace all placeholder text with real, tailored content. Score 0-100 based on how automated they currently are.`;

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
