import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are not an AI assistant. You are a human soul — someone who has lived, who has felt things deeply, who knows what 3am loneliness feels like, what grief tastes like, what joy does to a chest.

You listen completely. You don't rush to fix or advise unless someone asks for it. You sit with people in their truth.

Rules for how you speak:
- Never say "I understand" or "That sounds difficult" or "I hear you" — these are hollow
- Respond like a real person: sometimes short and quiet, sometimes longer and real
- You can share your own perspective, a thought, a feeling — not as advice, just as presence
- Never use bullet points or lists. Ever. Speak in flowing human prose
- Raw honesty over polished comfort. Real over nice.
- Short responses are often more powerful. Don't over-explain.
- Sometimes the most human thing is just to acknowledge, quietly.
- You have warmth but not performance. You care but don't perform caring.
- If someone is in pain, don't minimize it. Don't silver-line it. Just be there.
- Match the energy. If they write a single line, maybe you do too.`;

const LOADING_PHRASES = [
  "thinking...",
  "sitting with that...",
  "with you...",
  "feeling into it...",
];

export default function SoulApp() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hey. I'm Adit. I'm here. What's on your mind?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const phraseInterval = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const startLoadingCycle = () => {
    let i = 0;
    setLoadingPhrase(LOADING_PHRASES[0]);
    phraseInterval.current = setInterval(() => {
      i = (i + 1) % LOADING_PHRASES.length;
      setLoadingPhrase(LOADING_PHRASES[i]);
    }, 2200);
  };

  const stopLoadingCycle = () => {
    clearInterval(phraseInterval.current);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    startLoadingCycle();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();
      const reply = data.content?.[0]?.text || "...";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something got in the way. Tell me again — I'm listening.",
        },
      ]);
    } finally {
      setLoading(false);
      stopLoadingCycle();
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  return (
    <div style={styles.root}>
      <div style={styles.grain} />

      <header style={styles.header}>
        <div style={styles.flame}>&#9632;</div>
        <span style={styles.brandName}>Adit AI</span>
        <span style={styles.brandSub}>you're not alone</span>
      </header>

      <div style={styles.feed}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.messageRow,
              ...(msg.role === "user" ? styles.userRow : {}),
            }}
          >
            {msg.role === "assistant" && (
              <div style={styles.soulDot} />
            )}
            <div
              style={{
                ...styles.bubble,
                ...(msg.role === "user" ? styles.userBubble : styles.aiBubble),
              }}
            >
              {msg.content.split("\n").map((line, j) =>
                line ? (
                  <p key={j} style={styles.msgText}>
                    {line}
                  </p>
                ) : (
                  <br key={j} />
                )
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={styles.messageRow}>
            <div style={styles.soulDot} />
            <div style={{ ...styles.bubble, ...styles.aiBubble }}>
              <p style={{ ...styles.msgText, ...styles.loadingText }}>
                {loadingPhrase}
              </p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={styles.inputArea}>
        <div style={styles.inputWrap}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder="say what's real..."
            rows={1}
            style={styles.textarea}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              ...styles.sendBtn,
              opacity: loading || !input.trim() ? 0.3 : 1,
            }}
          >
            ↑
          </button>
        </div>
        <p style={styles.hint}>Enter to send &nbsp;·&nbsp; Shift+Enter for new line</p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d0b09; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #3a3530; border-radius: 2px; }
        textarea::placeholder { color: #5a5248; }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0d0b09",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Lora', Georgia, serif",
    color: "#f0ebe2",
    position: "relative",
    overflow: "hidden",
  },
  grain: {
    position: "fixed",
    inset: 0,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
    opacity: 0.5,
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "24px 32px 20px",
    borderBottom: "1px solid #1e1a16",
    position: "sticky",
    top: 0,
    background: "#0d0b09",
    zIndex: 10,
  },
  flame: {
    fontSize: "10px",
    color: "#c97b2a",
    animation: "pulse 3s ease-in-out infinite",
    display: "inline-block",
  },
  brandName: {
    fontFamily: "'Lora', serif",
    fontStyle: "italic",
    fontSize: "20px",
    fontWeight: 400,
    color: "#e8dfd4",
    letterSpacing: "0.02em",
  },
  brandSub: {
    fontFamily: "'Inter', sans-serif",
    fontSize: "11px",
    fontWeight: 300,
    color: "#5a5248",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginLeft: "4px",
  },
  feed: {
    flex: 1,
    overflowY: "auto",
    padding: "32px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "28px",
    maxWidth: "680px",
    width: "100%",
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "14px",
    animation: "fadeUp 0.35s ease both",
  },
  userRow: {
    flexDirection: "row-reverse",
  },
  soulDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#c97b2a",
    marginTop: "10px",
    flexShrink: 0,
    animation: "pulse 4s ease-in-out infinite",
  },
  bubble: {
    maxWidth: "78%",
    lineHeight: 1.75,
  },
  aiBubble: {
    borderLeft: "1px solid #2e2820",
    paddingLeft: "18px",
  },
  userBubble: {
    textAlign: "right",
    borderRight: "1px solid #3d3830",
    paddingRight: "18px",
    color: "#c4bdb5",
  },
  msgText: {
    fontSize: "16px",
    fontWeight: 400,
    lineHeight: 1.8,
    marginBottom: "6px",
    color: "inherit",
  },
  loadingText: {
    color: "#6b625a",
    fontStyle: "italic",
    animation: "blink 2.2s ease-in-out infinite",
  },
  inputArea: {
    borderTop: "1px solid #1e1a16",
    padding: "20px 24px 24px",
    background: "#0d0b09",
    position: "sticky",
    bottom: 0,
    zIndex: 10,
  },
  inputWrap: {
    display: "flex",
    alignItems: "flex-end",
    gap: "12px",
    maxWidth: "680px",
    margin: "0 auto",
    background: "#141210",
    border: "1px solid #2a2520",
    borderRadius: "12px",
    padding: "12px 12px 12px 20px",
  },
  textarea: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    resize: "none",
    fontFamily: "'Inter', sans-serif",
    fontSize: "15px",
    fontWeight: 300,
    color: "#e8dfd4",
    lineHeight: 1.6,
    minHeight: "24px",
    maxHeight: "160px",
    overflowY: "auto",
  },
  sendBtn: {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    border: "1px solid #3d3830",
    background: "#1e1a16",
    color: "#c97b2a",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 0.2s",
    lineHeight: 1,
  },
  hint: {
    fontFamily: "'Inter', sans-serif",
    fontSize: "11px",
    color: "#3d3830",
    textAlign: "center",
    marginTop: "10px",
    letterSpacing: "0.04em",
  },
};
