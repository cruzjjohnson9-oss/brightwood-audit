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

  const prompt = `You are an AI automation consultant. You've built a real AI operating system for coaches — 17 agents that run on a custom backend. Your job is to audit this coach and recommend the 5 most impactful agents for their situation.

COACH INFO:
- Niche: ${niche || 'coaching'}
- Clients: ${clients || 'unknown'} | Sessions/wk: ${sessionsPerWeek || 'unknown'} | Program: ${programLength || 'unknown'}
- Tools: ${tools || 'none'} | Admin hrs/wk: ${hoursPerWeek || 'unknown'}
- Doing manually: ${manualTasks || 'general admin'}
${extraContext ? `- Notes: ${extraContext}` : ''}

THE 17 AGENTS YOU'VE BUILT (pick the 5 most relevant for this coach):

1. Onboarding Agent — fires when a new client submits the intake form; auto-builds their dashboard, assigns starter resources, sends their login and a personalized welcome email.
2. Post-Call Agent — coach sends a voice note after any session; AI extracts the session summary, action items, and drafts a follow-up email for the coach to approve and send in one tap.
3. Session Prep Agent — sends the coach a full briefing before each call: last 3 session summaries, open to-dos, DISC profile, progress %, and a recommended opening question.
4. Follow-Up Agent — 2 days after every session, automatically drafts a personal check-in message to the client referencing what was covered and what they committed to.
5. Milestone Agent — auto-sends welcome emails at week 1, midpoint encouragement, and program-completion emails at exactly the right moment — no manual tracking needed.
6. Re-engagement Agent — detects clients who've gone quiet (open action items 5+ days old or no activity) and sends a personalized nudge to pull them back in.
7. Progress Report Agent — generates a detailed monthly progress report for each client covering sessions, to-dos, themes, and what's next — emails it after coach approval.
8. Resource Agent — coach says "send Sarah the goal-setting worksheet" and the agent finds it in the library, assigns it to the client, and sends it automatically.
9. DISC Agent — sends the DISC personality assessment to new clients at onboarding, stores their profile, and surfaces it every time the coach preps for a session.
10. Referral Agent — when a client completes the program, automatically drafts a warm referral request email timed to the moment they're most likely to refer.
11. Query Agent — coach asks "who's behind on their action items?" or "how is Sarah doing?" and gets an instant AI-generated answer from the client database.
12. Digest Agent — sends the coach a daily morning briefing via Telegram: today's sessions, overdue to-dos, clients in the follow-up queue, pending approvals.
13. Document Builder Agent — coach describes a resource they want to create from a voice note; AI builds it as a structured guide, tracker, or PDF outline and saves it to the library.
14. Email Agent — coach dictates any email from a voice note; AI drafts it in their voice, previews it for approval, and sends on one tap.
15. Client Portal Chatbot — AI assistant on the client-facing portal that answers client questions 24/7 in the coach's voice using their actual resource library.
16. Todo Agent — coach says "add X to Sarah's action items" from a voice note and it's instantly added to the client's dashboard without opening any app.
17. Royal Assistant (Jarvis) — the central AI brain that reads the coach's voice notes and routes every message to the right agent automatically — one inbox runs everything.

Pick the 5 agents that would save this coach the most time given what they're doing manually. Rank by impact.

Return ONLY valid JSON. No markdown. No extra text:

{
  "score": 15,
  "grade": "D",
  "grade_label": "Flying Blind",
  "hours_wasted": "12 hrs/wk",
  "hours_saved_total": "9 hrs/wk",
  "clients_now": "${clients || 'estimate'}",
  "clients_possible": "25 clients",
  "summary": "2 direct sentences. Reference their niche and their specific manual tasks. No fluff.",
  "automations": [
    {
      "rank": 1,
      "name": "Agent Name from the list above",
      "what_it_does": "One sentence — explain what it does for THIS specific coach and their niche.",
      "time_saved": "X hrs/wk",
      "impact": "high",
      "without_it": "One sentence on what it's costing them right now."
    }
  ]
}

GRADE SCALE: 0–20="Flying Blind", 21–40="Winging It Week to Week", 41–60="Some Systems, Still Leaking", 61–80="Getting There", 81–100="Well-Oiled Machine"
Give exactly 5 automations. hours_saved_total = realistic sum of all 5.`;

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
