import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PearsonNav from '../components/layout/PearsonNav';
import './CoursePickerPage.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: `**Welcome to the Pearson Course Picker** 👋

I help FE/HE providers and students design 30-credit Higher National modules by combining two 15-credit units from Pearson's HN specifications.

**How it works:**
- Tell me a learning goal or upskilling need
- I'll suggest a 30-credit module built from two compatible units
- Units always come from the same parent qualification

**Try one of these to get started:**

> "Help me upskill in medtech compliance"
> "I need a module for digital marketing at HND level"
> "Build a module covering project management and business finance"

Or just describe what you're looking for in your own words.`,
};

const SUGGESTED_PROMPTS = [
  'Help me upskill in medtech compliance',
  'Create a module for digital marketing at HND level',
  'Design a computing module covering cybersecurity',
  'Suggest a module for health and social care leadership',
  'Build an engineering module for renewable energy',
];

function renderMarkdown(text: string): string {
  return text
    // Tables — convert markdown pipe tables to HTML
    .replace(/(\|.+\|\n)+/g, (table) => {
      const rows = table.trim().split('\n').filter((r) => r.trim());
      const htmlRows = rows
        .filter((r) => !/^\|[\s\-|]+\|$/.test(r)) // skip separator rows
        .map((row, i) => {
          const cells = row
            .split('|')
            .slice(1, -1)
            .map((cell) => {
              const tag = i === 0 ? 'th' : 'td';
              return `<${tag}>${cell.trim().replace(/\*\*/g, '')}</${tag}>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      return `<div class="cp-table-wrap"><table class="cp-table">${htmlRows}</table></div>`;
    })
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquotes (starter prompts)
    .replace(/^> (.+)$/gm, '<div class="cp-quote">$1</div>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.+<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    // Line breaks (double newline = paragraph break)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

export default function CoursePickerPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const updatedMessages = [...messages.filter((m) => m !== WELCOME_MESSAGE), userMsg];

    // Keep WELCOME_MESSAGE display-only; don't send it as a conversation turn
    const apiMessages = [...messages.filter((m) => m !== WELCOME_MESSAGE), userMsg];

    setMessages([WELCOME_MESSAGE, ...updatedMessages]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/.netlify/functions/course-picker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');

      const assistantMsg: Message = { role: 'assistant', content: data.message };
      setMessages([WELCOME_MESSAGE, ...updatedMessages, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestion = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const handleReset = () => {
    setMessages([WELCOME_MESSAGE]);
    setInput('');
    setError(null);
  };

  const nonWelcomeMessages = messages.filter((m) => m !== WELCOME_MESSAGE);

  return (
    <div className="cp-layout">
      <PearsonNav />

      <div className="cp-container">
        {/* Sidebar */}
        <aside className="cp-sidebar">
          <div className="cp-sidebar__section">
            <h3 className="cp-sidebar__heading">What it does</h3>
            <p className="cp-sidebar__text">
              Combine two 15-credit HN units from the same parent qualification into a 30-credit module — with AI-generated rationale.
            </p>
          </div>

          <div className="cp-sidebar__section">
            <h3 className="cp-sidebar__heading">Module rules</h3>
            <ul className="cp-rules">
              <li className="cp-rule">
                <span className="cp-rule__icon">✓</span>
                <span>2 units × 15 credits = 30 credits</span>
              </li>
              <li className="cp-rule">
                <span className="cp-rule__icon">✓</span>
                <span>Both units from the same parent qualification</span>
              </li>
              <li className="cp-rule">
                <span className="cp-rule__icon">✓</span>
                <span>Full units only — no fragments</span>
              </li>
            </ul>
          </div>

          <div className="cp-sidebar__section">
            <h3 className="cp-sidebar__heading">Try these</h3>
            <div className="cp-suggestions">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="cp-suggestion-btn"
                  onClick={() => handleSuggestion(prompt)}
                  disabled={loading}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {nonWelcomeMessages.length > 0 && (
            <div className="cp-sidebar__section">
              <button className="btn btn-secondary btn-sm cp-reset-btn" onClick={handleReset}>
                Start new conversation
              </button>
            </div>
          )}
        </aside>

        {/* Main chat area */}
        <main className="cp-main">
          <div className="cp-header">
            <div className="cp-header__left">
              <div className="cp-header__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h1 className="cp-header__title">Course Picker</h1>
                <p className="cp-header__sub">AI-powered HN module builder</p>
              </div>
            </div>
            <Link to="/dashboard" className="btn btn-secondary btn-sm">
              Back to dashboard
            </Link>
          </div>

          <div className="cp-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`cp-message cp-message--${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="cp-message__avatar cp-message__avatar--ai">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                <div className="cp-message__bubble">
                  <div
                    className="cp-message__content"
                    dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(msg.content)}</p>` }}
                  />
                </div>
                {msg.role === 'user' && (
                  <div className="cp-message__avatar cp-message__avatar--user">
                    You
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="cp-message cp-message--assistant">
                <div className="cp-message__avatar cp-message__avatar--ai">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="cp-message__bubble">
                  <div className="cp-typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="cp-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="cp-input-area" onSubmit={handleSubmit}>
            <div className="cp-input-wrap">
              <textarea
                ref={inputRef}
                className="cp-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your learning goal or upskilling need…"
                rows={1}
                disabled={loading}
                autoFocus
              />
              <button
                type="submit"
                className="cp-send-btn"
                disabled={!input.trim() || loading}
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <p className="cp-input-hint">Press Enter to send · Shift+Enter for new line</p>
          </form>
        </main>
      </div>
    </div>
  );
}
