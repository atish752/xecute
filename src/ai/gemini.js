/**
 * XECUTE — Unified Gemini AI Client
 * Uses gemini-2.0-flash for all AI features.
 * API key loaded from env or user settings (localStorage).
 */

const GEMINI_MODEL = 'gemini-2.0-flash';
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Key Resolution ──────────────────────────────────────────────────────────
const getApiKey = () => {
  try {
    return (
      localStorage.getItem('xecute_gemini_key') ||
      import.meta.env.VITE_GEMINI_API_KEY ||
      ''
    );
  } catch {
    return import.meta.env.VITE_GEMINI_API_KEY || '';
  }
};

// ─── Core Caller ─────────────────────────────────────────────────────────────
const callGemini = async (prompt, maxTokens = 512, temperature = 0.7) => {
  const key = getApiKey();
  if (!key) {
    console.warn('[Xecute AI] No Gemini API key configured.');
    return null;
  }
  if (!navigator.onLine) {
    console.info('[Xecute AI] Offline — skipping AI call.');
    return null;
  }

  try {
    const res = await fetch(`${BASE_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
          topP: 0.9,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[Xecute AI] Gemini error:', res.status, err?.error?.message);
      return null;
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    console.warn('[Xecute AI] Network error:', e.message);
    return null;
  }
};

// ─── JSON helper ─────────────────────────────────────────────────────────────
const parseJSON = (text) => {
  if (!text) return null;
  try {
    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  FEATURE FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Execute Tab — Focus coach blurb before a session starts.
 */
export const getFocusCoach = async (taskTitle, intentionText, durationMinutes) => {
  const prompt = `You are a sharp focus coach for a productivity app called Xecute.
Write a 2-sentence strategy for this specific work session. Be direct, concrete, and motivating.

Task: "${taskTitle}"
Intention: "${intentionText || 'Not specified'}"
Session length: ${durationMinutes} minutes

Rules: No generic advice. No fluff. Address the actual task. End with a short energizing call-to-action.`;

  return await callGemini(prompt, 120, 0.75);
};

/**
 * Plan Tab — Refine a goal into SMART format.
 */
export const refineSMARTGoal = async (goalStatement) => {
  const prompt = `Rewrite this goal as a single SMART goal statement (Specific, Measurable, Achievable, Relevant, Time-bound).

Original goal: "${goalStatement}"

Return ONLY the refined one-sentence SMART goal. No explanation, no bullet points, no preamble.`;

  return await callGemini(prompt, 100, 0.5);
};

/**
 * Plan Tab — Generate a full plan template from a goal description.
 * Returns: { categories: [{ name, priority, tasks: [{ title, description, estimatedMinutes, priority }] }] }
 */
export const generatePlanTemplate = async (goalDescription) => {
  const prompt = `You are a productivity expert. Generate a structured action plan for this goal.

Goal: "${goalDescription}"

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "categories": [
    {
      "name": "string",
      "priority": "p1" | "p2" | "p3",
      "tasks": [
        {
          "title": "string",
          "description": "string",
          "estimatedMinutes": number,
          "priority": "p1" | "p2" | "p3"
        }
      ]
    }
  ]
}

Rules:
- 2–4 categories (phases or workstreams)
- 3–5 tasks per category
- Be specific and actionable — not generic
- estimatedMinutes: realistic (15–240)
- Use p1 for critical tasks, p2 for important, p3 for optional`;

  const raw = await callGemini(prompt, 1000, 0.6);
  return parseJSON(raw);
};

/**
 * Plan Tab — Break a vague task into 4–6 specific subtasks.
 * Returns: string[] (subtask titles)
 */
export const breakdownTask = async (taskTitle) => {
  const prompt = `Break this task into 4–6 specific, actionable subtasks that can each be completed in one focused session.

Task: "${taskTitle}"

Return ONLY a JSON array of strings. No markdown, no explanation.
Example: ["Research competitors", "Write outline", "Design wireframes"]

The subtasks should be concrete steps, not vague actions.`;

  const raw = await callGemini(prompt, 300, 0.6);
  const parsed = parseJSON(raw);
  return Array.isArray(parsed) ? parsed : [];
};

/**
 * Plan Tab — Suggest optimal task execution order.
 * Returns: number[] (task IDs in recommended order)
 */
export const suggestOptimalOrder = async (tasks) => {
  const taskList = tasks
    .map((t) => `ID:${t.id} | "${t.title}" | priority:${t.priority} | est:${t.estimatedMinutes}min`)
    .join('\n');

  const prompt = `Reorder these tasks for optimal execution. Consider: priority (p1>p2>p3), estimated duration, and logical flow.

Tasks:
${taskList}

Return ONLY a JSON array of task IDs in your recommended order. Example: [3, 1, 5, 2, 4]
No explanation, no markdown.`;

  const raw = await callGemini(prompt, 200, 0.4);
  const parsed = parseJSON(raw);
  return Array.isArray(parsed) ? parsed : tasks.map((t) => t.id);
};

/**
 * Analyse Tab — Generate 3 weekly productivity insights.
 * Returns: string[] (3 insight sentences)
 */
export const getWeeklyInsight = async (stats) => {
  const prompt = `You are a productivity analyst for the Xecute app. Based on this user's week, generate exactly 3 actionable insights.

User data:
- Total sessions: ${stats.totalSessions}
- Total focused time: ${stats.totalMinutes} minutes
- Current streak: ${stats.streak} days
- P1 task completion rate: ${stats.p1Rate}%
- Average session length: ${stats.avgLength || 0} minutes
- Break compliance: ${stats.breakCompliance || 0}%

Return ONLY a JSON array of exactly 3 strings. Each string is one insight (1–2 sentences, specific to their data).
Example: ["Your peak focus time appears to be...", "You've completed X% of...", "Consider..."]
No markdown, no explanation outside the JSON.`;

  const raw = await callGemini(prompt, 400, 0.7);
  const parsed = parseJSON(raw);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
};

/**
 * Analyse Tab — "Ask Xecute" — answer a user question with data context.
 */
export const askXecute = async (question, context) => {
  const prompt = `You are Xecute AI, a sharp productivity assistant built into the Xecute app.
Answer the user's question based on their actual data. Be concise (2–3 sentences max), direct, and data-driven.

User's data snapshot:
${JSON.stringify(context, null, 2)}

User's question: "${question}"

Answer directly. If data is insufficient, say so honestly and suggest what they should do.`;

  return await callGemini(prompt, 200, 0.65);
};

/**
 * Execute Tab — "Next Best Action" — instant recommendation.
 */
export const getNextBestAction = async (context) => {
  const taskList = (context.tasks || [])
    .map((t) => `ID:${t.id} | "${t.title}" | priority:${t.priority}`)
    .join('\n');

  const prompt = `You are a productivity AI inside the Xecute app. Analyze the user's current state and active tasks, and return the single best next action they should take.

Context:
- Time of day: ${context.timeOfDay}
- Current streak: ${context.streak} days
- Pending P1 tasks count: ${context.p1Count}
- Last session today: ${context.lastSession || 'None yet'}

Active Tasks:
${taskList || 'No active tasks found. Suggest creating a plan or capturing a task.'}

Return ONLY valid JSON (no markdown code blocks, no explanation) matching this schema:
{
  "recommendation": "specific action statement (e.g. 'Execute the critical setup task' or 'Add a new plan')",
  "reason": "short explanation of why this is the best choice (1 sentence)",
  "taskId": number | null
}

Rules:
- If there are active tasks, pick one of them to recommend, especially P1 tasks. Set the taskId field to that task's ID.
- Keep the reason direct, action-oriented, and under 15 words.`;

  const raw = await callGemini(prompt, 200, 0.6);
  return parseJSON(raw) || {
    recommendation: 'Start a focused work session',
    reason: 'Maintaining momentum is key to achieving your goals.',
    taskId: null
  };
};

/**
 * Execute/Plan — Celebration message on task completion.
 */
export const generateCompletionMessage = async (taskTitle) => {
  const prompt = `Generate a single powerful, brief congratulation message for completing a task.
Task: "${taskTitle}"

Rules: 5–10 words max. Direct. Bold tone. No emojis. No hashtags. No "Great job!"-type clichés.
Examples: "That's one more brick in the wall.", "Crushed it. What's next?", "Done. Another one bites the dust."`;

  return await callGemini(prompt, 40, 0.9);
};

/**
 * Morning Kickstart — Context-aware motivational quote.
 */
export const generateMorningQuote = async (userName, topTasks) => {
  const taskList = topTasks.slice(0, 3).join(', ');
  const prompt = `Generate one powerful, context-aware motivational line for ${userName || 'a focused person'} who is about to work on: ${taskList || 'their most important tasks'}.

Rules: 1 sentence max. Relevant to their actual work. Direct and energizing. No generic quotes. No author attribution.`;

  return await callGemini(prompt, 60, 0.85);
};

/**
 * Plan Tab — Suggest task order using natural language (simpler version).
 */
export const suggestTaskOrder = suggestOptimalOrder;

/**
 * Weekly Review — Generate a review summary based on reflection questions.
 */
export const generateWeeklyReviewSummary = async (wentWell, obstacles, nextWeekFocus, stats) => {
  const prompt = `You are an elite productivity mentor for the Xecute app.
Analyze the user's weekly review input and focus stats, and write a concise, motivating performance synthesis (2-3 sentences max).
Include a brief insight on how to overcome their obstacles next week.

Focus Stats:
- Focused time: ${stats.focusedMinutes || 0} minutes
- Sessions completed: ${stats.sessionsCount || 0}
- Momentum score: ${stats.momentumScore || 0}/100

User Reflections:
- What went well: "${wentWell || 'Not specified'}"
- Obstacles faced: "${obstacles || 'Not specified'}"
- Next week's main focus: "${nextWeekFocus || 'Not specified'}"

Rules: Keep it direct, crisp, and high-impact. Do not quote the user verbatim. Be extremely professional and motivating.`;

  return await callGemini(prompt, 200, 0.7);
};
