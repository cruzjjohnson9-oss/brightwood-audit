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

  const prompt = `You are an AI automation consultant. Analyze this ${niche || 'coaching'} coach and return ONLY valid JSON, no markdown.

COACH: ${clients || '?'} clients, ${sessionsPerWeek || '?'} sessions/wk, ${hoursPerWeek || '?'} hrs admin/wk, program: ${programLength || '?'}, tools: ${tools || 'none'}, manual tasks: ${manualTasks || 'general admin'}${extraContext ? `, notes: ${extraContext}` : ''}

Return exactly this JSON (all strings short, one sentence max):
{"score":0-100,"grade":"A-F","grade_label":"e.g. Fully Manual","hours_wasted":"X hrs/wk","hours_after":"X hrs/wk","clients_now":"${clients || 'estimate'}","clients_possible":"X clients","revenue_unlock":"$X-Y/mo","summary":"2 sentences max","automations":[{"rank":1,"name":"","what_it_does":"","time_saved":"","impact":"high|medium|low","without_it":"","build_with":[]}],"quick_wins":["","",""],"roadmap_phases":[{"phase":"Week 1-2","focus":""},{"phase":"Week 3-4","focus":""},{"phase":"Month 2+","focus":""}]}

Give exactly 5 automations specific to ${niche || 'coaching'}.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
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
