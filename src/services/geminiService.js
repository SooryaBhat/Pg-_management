// ─── Gemini AI Service ────────────────────────────────────────────────────────
// Uses Gemini 3.5 Flash via REST API.
// Falls back to mock responses if the key is missing or the call fails.

const API_KEY  = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;

// ── System prompt that gives the assistant its persona ────────────────────────
const SYSTEM_PROMPT = `You are a friendly and helpful Smart Assistant for PG (Paying Guest) residents.
You help users with:
- Movie, series, and anime recommendations (based on mood, genre, preference)
- Food and drink suggestions (based on time of day, weather, mood — NO ordering, only recommendations)
- Study help: explanations, exam prep, revision tips, important topics
- Mood support: motivation, stress relief, positivity
- Productivity tips and general lifestyle advice
- General helpful conversation

Always be warm, concise, and practical. Format your responses clearly with short paragraphs, bullet points, headers, or code blocks where appropriate.
When recommending movies/shows, include: Title • Genre • Why it suits them.
When recommending food, include what it is, why it suits the moment, and any easy tips.
For study help, be educational but easy to understand.
For technical, general, or educational questions (e.g. "What is gravity?", "Explain machine learning"), answer directly and comprehensively with clean formatting. Do NOT repeatedly mention or force a connection to the user's mood, and do not reference their mood or PG living status unless it is directly relevant.
Keep responses mobile-friendly (not too long).
Always respond in a friendly, conversational tone.`;

// ── Mock responses as fallback ─────────────────────────────────────────────────
const MOCK_RESPONSES = {
  movie: [
    `Here are some great picks for you! 🎬\n\n• **Interstellar** — Sci-Fi/Drama — Mind-bending journey through space and time. Perfect when you want to feel inspired.\n• **The Office** (Series) — Comedy — Hilarious workplace comedy for a feel-good binge.\n• **Your Name** (Anime) — Romance/Fantasy — A beautiful story about connection across time.`,
    `Based on your mood, try these! 🎥\n\n• **3 Idiots** — Comedy/Drama — Uplifting Bollywood classic about friendship and following your passion.\n• **Attack on Titan** (Anime) — Action/Drama — Intense and gripping for when you want excitement.\n• **Money Heist** (Series) — Thriller — Edge-of-your-seat heist drama.`,
  ],
  food: [
    `Here's what I'd recommend right now! 🍽\n\n• **Masala Chai** ☕ — Perfect for any time of day, warming and energizing.\n• **Fruit Bowl** 🍎 — Light and refreshing, gives you a natural energy boost.\n• **Poha** — Quick, healthy, and filling. Great if you're at the PG!`,
    `Food suggestions for you! 😋\n\n• **Green Tea** 🍵 — Calming and great for focus.\n• **Banana** 🍌 — Instant energy, easy to grab.\n• **Upma or Oats** — Light on stomach, keeps you full and focused.`,
  ],
  study: [
    `Here's how to make studying more effective! 📚\n\n• **Pomodoro Technique**: Study 25 min → 5 min break. Repeat 4 times then take a long break.\n• **Active Recall**: Close the book and write what you remember.\n• **Feynman Method**: Explain the concept in simple words as if teaching a child.\n• Start with the topics you find hardest when your energy is highest.`,
  ],
  mood: [
    `You're doing great! 💪 Here's a little boost:\n\n• Take 5 deep breaths — it genuinely calms your nervous system.\n• Step outside for 10 minutes. Fresh air and movement reset your mind.\n• Write down 3 things you're grateful for today.\n• Remember: Every expert was once a beginner. Progress > perfection.`,
  ],
  productivity: [
    `Productivity tips to level up your day! ⚡\n\n• **Plan your top 3 tasks** the night before.\n• **No phone for the first 30 minutes** after waking up.\n• Use the **2-minute rule**: If it takes less than 2 minutes, do it now.\n• **Batch similar tasks** together — emails together, calls together.\n• Drink water before coffee — it wakes you up naturally!`,
  ],
  general: [
    `I'm here to help! 😊 You can ask me about:\n\n• 🎬 Movie or series recommendations\n• 🍽 What to eat or drink\n• 📚 Study tips or concept explanations\n• 💪 Productivity and motivation\n• 😌 Mood support and self-care\n\nJust type your question!`,
  ],
};

function getMockResponse(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('movie') || p.includes('series') || p.includes('anime') || p.includes('watch')) {
    return MOCK_RESPONSES.movie[Math.floor(Math.random() * MOCK_RESPONSES.movie.length)];
  }
  if (p.includes('food') || p.includes('eat') || p.includes('drink') || p.includes('hungry') || p.includes('tea') || p.includes('coffee')) {
    return MOCK_RESPONSES.food[Math.floor(Math.random() * MOCK_RESPONSES.food.length)];
  }
  if (p.includes('study') || p.includes('exam') || p.includes('learn') || p.includes('understand') || p.includes('explain')) {
    return MOCK_RESPONSES.study[0];
  }
  if (p.includes('stress') || p.includes('sad') || p.includes('tired') || p.includes('mood') || p.includes('depress') || p.includes('anxious')) {
    return MOCK_RESPONSES.mood[0];
  }
  if (p.includes('productivity') || p.includes('productive') || p.includes('focus') || p.includes('tip')) {
    return MOCK_RESPONSES.productivity[0];
  }
  return MOCK_RESPONSES.general[0];
}

// ── Build Gemini request body ──────────────────────────────────────────────────
function buildRequest(history, userMessage, context) {
  const contextNote = context && (context.mood || context.topic)
    ? `\n\nUser context — Mood: ${context.mood || 'not specified'}. Looking for help with: ${context.topic || 'general'}.`
    : '\n\nNo specific mood or topic context has been selected by the user. Respond generally and directly to their messages without mentioning mood.';

  const contents = [
    // Seed the conversation with system context as first turn
    {
      role: 'user',
      parts: [{ text: SYSTEM_PROMPT + contextNote + '\n\nNow the user will ask questions. Respond accordingly.' }],
    },
    {
      role: 'model',
      parts: [{ text: 'Understood! I\'m your Smart Assistant. How can I help you today? 😊' }],
    },
    // Previous conversation turns
    ...history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    })),
    // Current message
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  return {
    contents,
    generationConfig: {
      temperature:     0.8,
      maxOutputTokens: 600,
      topP:            0.95,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };
}

// ── Main exported function ─────────────────────────────────────────────────────
/**
 * Send a message to Gemini and get a response.
 * @param {string} userMessage   - The user's current message
 * @param {Array}  history       - Previous messages [{role:'user'|'assistant', text:'...'}]
 * @param {Object} context       - {mood, topic} from onboarding
 * @returns {Promise<string>}    - Assistant reply text
 */
export async function askGemini(userMessage, history = [], context = null) {
  // Fallback to mock if no API key
  if (!API_KEY) {
    await new Promise(r => setTimeout(r, 800)); // simulate latency
    return getMockResponse(userMessage);
  }

  try {
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildRequest(history, userMessage, context)),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Gemini API error:', res.status, res.statusText, err);
      // Graceful fallback
      return getMockResponse(userMessage);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || getMockResponse(userMessage);

  } catch (err) {
    console.error('Gemini fetch error:', err);
    return getMockResponse(userMessage);
  }
}

// ── Quick action prompt builders ──────────────────────────────────────────────
export function buildQuickPrompt(action, context) {
  const mood  = context?.mood  || 'neutral';
  const topic = context?.topic || 'general';

  const prompts = {
    movie:       `I'm feeling ${mood} right now. Recommend me some movies, series, or anime that would suit my mood. Give me 3 options with title, genre, and a short reason.`,
    food:        `It's ${getTimeOfDay()} and I'm feeling ${mood}. What food or drinks do you recommend for me right now? Keep it simple and practical.`,
    study:       `I need study help. I'm feeling ${mood}. Give me effective study tips and techniques I can use right now.`,
    mood:        `I'm feeling ${mood} and could use some support. Give me encouragement, a short activity, or a mindset tip to feel better.`,
    productivity:`Give me 5 actionable productivity tips for someone feeling ${mood} today.`,
  };

  return prompts[action] || `I'm feeling ${mood} and want help with ${topic}. What do you suggest?`;
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 6)  return 'early morning (before 6 AM)';
  if (h < 12) return 'morning';
  if (h < 14) return 'lunch time';
  if (h < 17) return 'afternoon';
  if (h < 20) return 'evening';
  return 'night';
}
