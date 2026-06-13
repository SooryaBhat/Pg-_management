import { useState, useEffect, useRef, useCallback } from 'react';
import { askGemini, buildQuickPrompt } from '../services/geminiService';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOODS = [
  { id: 'happy',     label: 'Happy',     emoji: '😊' },
  { id: 'bored',     label: 'Bored',     emoji: '😐' },
  { id: 'stressed',  label: 'Stressed',  emoji: '😰' },
  { id: 'motivated', label: 'Motivated', emoji: '💪' },
  { id: 'tired',     label: 'Tired',     emoji: '😴' },
];

const TOPICS = [
  { id: 'movie',       label: 'Movies',      emoji: '🎬' },
  { id: 'food',        label: 'Food',        emoji: '🍽' },
  { id: 'study',       label: 'Studies',     emoji: '📚' },
  { id: 'productivity',label: 'Productivity',emoji: '⚡' },
  { id: 'general',     label: 'General Chat',emoji: '💬' },
];

const QUICK_ACTIONS = [
  { id: 'movie',        label: 'Recommend a Movie',     emoji: '🎬', color: '#6366f1', bg: '#ede9fe' },
  { id: 'food',         label: 'Recommend Food',        emoji: '🍽', color: '#f59e0b', bg: '#fef3c7' },
  { id: 'study',        label: 'Study Help',            emoji: '📚', color: '#3b82f6', bg: '#dbeafe' },
  { id: 'mood',         label: 'Mood Support',          emoji: '😌', color: '#ec4899', bg: '#fce7f3' },
  { id: 'productivity', label: 'Smart Spending Tips',   emoji: '💰', color: '#10b981', bg: '#d1fae5' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function greetingByTime() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 20) return 'Good evening';
  return 'Good night';
}

// Converts **bold** and bullet lists to inline styled spans
function renderMarkdown(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Bold: **text**
    const parts = line.split(/\*\*(.*?)\*\*/g);
    const formatted = parts.map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p));

    if (line.startsWith('• ') || line.startsWith('- ')) {
      return (
        <div key={i} className="sa-md-bullet">
          <span className="sa-md-dot">•</span>
          <span>{formatted.slice(1)}</span>
        </div>
      );
    }
    if (line.trim() === '') return <div key={i} className="sa-md-spacer" />;
    return <div key={i}>{formatted}</div>;
  });
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="sa-msg assistant">
      <div className="sa-avatar ai">✨</div>
      <div className="sa-bubble assistant typing-bubble">
        <span className="dot" /><span className="dot" /><span className="dot" />
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`sa-msg ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <div className="sa-avatar ai">✨</div>}
      <div className={`sa-bubble ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? msg.text : renderMarkdown(msg.text)}
        <div className="sa-msg-time">{msg.time}</div>
      </div>
      {isUser && <div className="sa-avatar user-av">{msg.initials}</div>}
    </div>
  );
}

// ─── Onboarding Step ─────────────────────────────────────────────────────────
function OnboardingStep({ step, context, onSelect }) {
  if (step === 'mood') {
    return (
      <div className="sa-onboard-card">
        <div className="sa-onboard-emoji">👋</div>
        <h3 className="sa-onboard-title">How are you feeling today?</h3>
        <p className="sa-onboard-sub">I'll personalise my suggestions just for you</p>
        <div className="sa-chip-grid">
          {MOODS.map(m => (
            <button
              key={m.id}
              className={`sa-chip ${context.mood === m.id ? 'selected' : ''}`}
              onClick={() => onSelect('mood', m.id)}
            >
              <span className="sa-chip-emoji">{m.emoji}</span>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'topic') {
    return (
      <div className="sa-onboard-card">
        <div className="sa-onboard-emoji">🎯</div>
        <h3 className="sa-onboard-title">What do you want help with?</h3>
        <p className="sa-onboard-sub">Pick what interests you most right now</p>
        <div className="sa-chip-grid">
          {TOPICS.map(t => (
            <button
              key={t.id}
              className={`sa-chip ${context.topic === t.id ? 'selected' : ''}`}
              onClick={() => onSelect('topic', t.id)}
            >
              <span className="sa-chip-emoji">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Home Screen ──────────────────────────────────────────────────────────────
function HomeScreen({ currentUser, context, onQuickAction, onStartChat }) {
  const name = currentUser?.fullName?.split(' ')[0] || currentUser?.name?.split(' ')[0] || 'there';
  return (
    <div className="sa-home">
      {/* Greeting */}
      <div className="sa-greeting-card">
        <div className="sa-greeting-glow" />
        <div className="sa-greeting-emoji">✨</div>
        <h2 className="sa-greeting-title">{greetingByTime()}, {name}!</h2>
        <p className="sa-greeting-sub">
          {context.mood
            ? `Feeling ${context.mood}? Let me help you!`
            : 'Your personal AI assistant is ready.'}
        </p>
        {context.mood && (
          <div className="sa-context-pills">
            <span className="sa-ctx-pill mood">
              {MOODS.find(m => m.id === context.mood)?.emoji} {context.mood}
            </span>
            {context.topic && (
              <span className="sa-ctx-pill topic">
                {TOPICS.find(t => t.id === context.topic)?.emoji} {context.topic}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="sa-section-label">Quick Actions</div>
      <div className="sa-actions-grid">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            className="sa-action-card"
            style={{ '--action-color': action.color, '--action-bg': action.bg }}
            onClick={() => onQuickAction(action)}
          >
            <span className="sa-action-emoji">{action.emoji}</span>
            <span className="sa-action-label">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Free chat CTA */}
      <button className="sa-free-chat-btn" onClick={onStartChat}>
        <span>💬</span>
        Ask anything…
      </button>
    </div>
  );
}

// ─── Main SmartAssistant Component ────────────────────────────────────────────
function SmartAssistant({ currentUser }) {
  // 'onboard_mood' | 'onboard_topic' | 'home' | 'chat'
  const [screen,  setScreen]  = useState('onboard_mood');
  const [context, setContext] = useState({ mood: null, topic: null });
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  const initials = (currentUser?.fullName || currentUser?.name || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  // Auto-scroll when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Onboarding select ───────────────────────────────────────────────────────
  const handleOnboardSelect = (key, value) => {
    const newCtx = { ...context, [key]: value };
    setContext(newCtx);

    if (key === 'mood') {
      // Short delay then move to topic step
      setTimeout(() => setScreen('onboard_topic'), 280);
    } else {
      // Done onboarding → go to home
      setTimeout(() => setScreen('home'), 280);
    }
  };

  // ── Quick action → auto-send a prompt ──────────────────────────────────────
  const handleQuickAction = useCallback(async (action) => {
    const prompt = buildQuickPrompt(action.id, context);
    setScreen('chat');

    const userMsg = {
      role:     'user',
      text:     `${action.emoji} ${action.label}`,
      time:     new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      initials,
    };
    setMessages([userMsg]);
    setLoading(true);

    try {
      const reply = await askGemini(prompt, [], context);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: reply,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Sorry, I had trouble connecting. Please try again!',
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      }]);
    } finally {
      setLoading(false);
    }
  }, [context, initials]);

  // ── Free text send ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    inputRef.current?.focus();

    const userMsg = {
      role:     'user',
      text,
      time:     new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      initials,
    };

    // Keep only last 12 messages for history (to stay within token limits)
    const history = messages.slice(-12).map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const reply = await askGemini(text, history, context);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: reply,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Sorry, I had trouble connecting. Please try again!',
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, context, initials]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Back navigation ─────────────────────────────────────────────────────────
  const handleBack = () => {
    if (screen === 'chat')          { setScreen('home'); }
    else if (screen === 'home')     { setScreen('onboard_mood'); }
    else if (screen === 'onboard_topic') { setScreen('onboard_mood'); }
  };

  // ── Clear chat ──────────────────────────────────────────────────────────────
  const handleClearChat = () => { setMessages([]); };

  return (
    <div className="sa-container">

      {/* ── Header ── */}
      <div className="sa-header">
        {screen !== 'onboard_mood' && (
          <button className="sa-back-btn" onClick={handleBack}>‹</button>
        )}
        <div className="sa-header-center">
          <div className="sa-header-icon">✨</div>
          <div>
            <div className="sa-header-title">Smart Assistant</div>
            <div className="sa-header-sub">
              {loading ? 'Thinking…' : 'AI powered · Always here'}
            </div>
          </div>
        </div>
        {screen === 'chat' && messages.length > 0 && (
          <button className="sa-clear-btn" onClick={handleClearChat} title="Clear chat">
            🗑
          </button>
        )}
        {screen === 'home' && (
          <button
            className="sa-reset-btn"
            onClick={() => { setScreen('onboard_mood'); setContext({ mood: null, topic: null }); }}
            title="Change mood"
          >
            ↺
          </button>
        )}
      </div>

      {/* ── Onboarding ── */}
      {(screen === 'onboard_mood' || screen === 'onboard_topic') && (
        <div className="sa-onboard-wrap">
          <OnboardingStep
            step={screen === 'onboard_mood' ? 'mood' : 'topic'}
            context={context}
            onSelect={handleOnboardSelect}
          />
          {screen === 'onboard_topic' && (
            <button className="sa-skip-btn" onClick={() => setScreen('home')}>
              Skip → Go to home
            </button>
          )}
        </div>
      )}

      {/* ── Home ── */}
      {screen === 'home' && (
        <div className="sa-scroll-area">
          <HomeScreen
            currentUser={currentUser}
            context={context}
            onQuickAction={handleQuickAction}
            onStartChat={() => setScreen('chat')}
          />
        </div>
      )}

      {/* ── Chat ── */}
      {screen === 'chat' && (
        <>
          <div className="sa-messages-area">
            {/* Welcome bubble if no messages */}
            {messages.length === 0 && (
              <div className="sa-welcome-bubble">
                <div className="sa-msg assistant">
                  <div className="sa-avatar ai">✨</div>
                  <div className="sa-bubble assistant">
                    {renderMarkdown(
                      `Hi! I'm your Smart Assistant 😊\n\nYou can ask me about:\n• 🎬 Movies, series, anime\n• 🍽 Food and drink recommendations\n• 📚 Study help and exam tips\n• 💪 Motivation and mood support\n• ⚡ Productivity and life tips\n\nJust type anything below!`
                    )}
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Suggestion chips (shown only when conversation is empty) */}
          {messages.length === 0 && !loading && (
            <div className="sa-suggestions">
              {[
                'Recommend a movie for tonight 🎬',
                'What should I eat for dinner? 🍽',
                'Help me study better 📚',
                'Give me a productivity tip ⚡',
              ].map((s, i) => (
                <button
                  key={i}
                  className="sa-suggestion-chip"
                  onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="sa-input-bar">
            <textarea
              ref={inputRef}
              className="sa-input"
              placeholder="Ask me anything…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading}
            />
            <button
              className="sa-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || loading}
            >
              {loading ? (
                <div className="sa-send-spinner" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default SmartAssistant;
