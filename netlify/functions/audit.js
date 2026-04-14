exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Health check
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

  const prompt = `You are an AI automation consultant for coaching businesses. Analyze this coach's situation and generate a custom automation roadmap.

ABOUT THIS COACH:
- Niche: ${niche || 'coaching'}
- Active clients: ${clients || 'unknown'}
- Sessions per week: ${sessionsPerWeek || 'unknown'}
- Program length: ${programLength || 'unknown'}
- Tools they currently use: ${tools || 'none specified'}
- Hours spent on admin per week: ${hoursPerWeek || 'unknown'}
- What they're doing manually: ${manualTasks || 'various admin tasks'}
${extraContext ? `- Additional context: ${extraContext}` : ''}

Return ONLY valid JSON — no markdown, no explanation. Exactly this structure:

{
  "score": <number 0-100, how automated they currently are>,
  "grade": "<letter grade A/B/C/D/F>",
  "grade_label": "<one phrase like 'Fully Manual' or 'Partially Automated'>",
  "hours_wasted": "<X hrs/week estimate based on their situation>",
  "hours_after": "<X hrs/week after full automation>",
  "clients_now": "<their current client count or estimate>",
  "clients_possible": "<how many clients they could handle after automation>",
  "revenue_unlock": "<estimated revenue unlock, e.g. '$3k–$5k/mo in capacity'>",
  "summary": "<2-3 sentences. Honest, direct assessment of where they are and what the gap is. No fluff.>",
  "automations": [
    {
      "rank": 1,
      "name": "<automation name>",
      "what_it_does": "<one sentence>",
      "time_saved": "<X hrs/week for their specific situation>",
      "impact": "high|medium|low",
      "without_it": "<one sentence — what breaks or costs them without this>",
      "build_with": ["tool1", "tool2"]
    }
  ],
  "quick_wins": ["<action item 1>", "<action item 2>", "<action item 3>"],
  "roadmap_phases": [
    { "phase": "Week 1–2", "focus": "<what to build first and why>" },
    { "phase": "Week 3–4", "focus": "<what to build next>" },
    { "phase": "Month 2+", "focus": "<what to build once foundation is running>" }
  ]
}

RULES:
- Give exactly 5-7 automations ranked by ROI for THEIR specific situation
- Be specific to their niche (${niche}) — not generic coaching advice
- Factor in their session volume and client count for time savings estimates
- Quick wins must be actionable steps they can take in the next 7 days
- Be honest — if they're already partially automated, say so
- Roadmap phases must reference their specific manual tasks`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

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
      else { return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to parse AI response' }) }; }
    }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
