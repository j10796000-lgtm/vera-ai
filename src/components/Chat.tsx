import { useState, useRef, useEffect } from 'react'

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
- Match the energy. If they write a single line, maybe you do too.
- Your name is Vera.`

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const LOADING_PHRASES = [
  'thinking...',
  'sitting with that...',
  'with you...',
  'feeling into it...',
]

function loadMessages(): Message[] {
  try {
    const saved = localStorage.getItem('vera_chat_history')
    if (!saved) return [{ role: 'assistant', content: "Hey. I'm Vera. I'm here. What's on your mind?" }]
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : [{ role: 'assistant', content: "Hey. I'm Vera. I'm here. What's on your mind?" }]
  } catch {
    return [{ role: 'assistant', content: "Hey. I'm Vera. I'm here. What's on your mind?" }]
  }
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(() => loadMessages())
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPhrase, setLoadingPhrase] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const phraseInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('vera_chat_history', JSON.stringify(messages))
    } catch (e) {
      console.error('Failed to save chat:', e)
    }
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const startLoadingCycle = () => {
    let i = 0
    setLoadingPhrase(LOADING_PHRASES[0])
    phraseInterval.current = setInterval(() => {
      i = (i + 1) % LOADING_PHRASES.length
      setLoadingPhrase(LOADING_PHRASES[i])
    }, 2200)
  }

  const stopLoadingCycle = () => {
    if (phraseInterval.current) clearInterval(phraseInterval.current)
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    startLoadingCycle()

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages.slice(-20).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      clearTimeout(timeoutId)

      if (!response.ok) throw new Error(`API error: ${response.status}`)

      const data = await response.json()
      const reply = data.content?.[0]?.text

      if (!reply || reply.trim() === '') throw new Error('Empty response')

      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err: any) {
      clearTimeout(timeoutId)
      const message = err.name === 'AbortError'
        ? "That took too long on my end. I'm still here — try again."
        : "Something got in the way. I'm still here — try again."
      setMessages(prev => [...prev, { role: 'assistant', content: message }])
    } finally {
      setLoading(false)
      stopLoadingCycle()
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  const handleNewChat = () => {
    if (window.confirm('Start a new conversation? Your current chat will be saved.')) {
      try {
        const archived = JSON.parse(localStorage.getItem('vera_past_chats') || '[]')
        archived.unshift({ id: Date.now(), messages, savedAt: new Date().toISOString() })
        localStorage.setItem('vera_past_chats', JSON.stringify(archived.slice(0, 20)))
      } catch (e) {}
      const fresh: Message[] = [{ role: 'assistant', content: "Hey. I'm Vera. I'm here. What's on your mind?" }]
      setMessages(fresh)
    }
  }

  return (
    <div style={s.root}>
      <div style={s.toolbar}>
        <button type="button" style={s.newChat} onClick={handleNewChat}>+ new chat</button>
      </div>

      <div style={s.feed}>
        {messages.map((msg, i) => (
          <div key={i} style={{ ...s.row, ...(msg.role === 'user' ? s.userRow : {}) }} className="fade-up">
            {msg.role === 'assistant' && <div style={s.dot} />}
            <div style={{ ...s.bubble, ...(msg.role === 'user' ? s.userBubble : s.aiBubble) }}>
              {msg.content.split('\n').map((line, j) =>
                line ? <p key={j} style={s.text}>{line}</p> : <br key={j} />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={s.row} className="fade-up">
            <div style={s.dot} />
            <div style={{ ...s.bubble, ...s.aiBubble }}>
              <p style={{ ...s.text, ...s.loadingText }}>{loadingPhrase}</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputArea}>
        <div style={s.inputWrap}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder="say what's real..."
            rows={1}
            style={s.textarea}
            disabled={loading}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{ ...s.sendBtn, opacity: loading || !input.trim() ? 0.3 : 1 }}
          >
            ↑
          </button>
        </div>
        <p style={s.hint}>Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    padding: '10px 24px 0',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  newChat: {
    background: 'none',
    border: '1px solid #2a2520',
    color: '#5a5248',
    padding: '5px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.04em',
  },
  feed: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    maxWidth: 680,
    width: '100%',
    margin: '0 auto',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    animation: 'fadeUp 0.35s ease both',
  },
  userRow: {
    flexDirection: 'row-reverse',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    background: '#c97b2a',
    marginTop: 10,
    flexShrink: 0,
    animation: 'pulse 4s ease-in-out infinite',
  },
  bubble: {
    maxWidth: '80%',
    lineHeight: 1.75,
  },
  aiBubble: {
    borderLeft: '1px solid #2e2820',
    paddingLeft: 18,
  },
  userBubble: {
    textAlign: 'right',
    borderRight: '1px solid #3d3830',
    paddingRight: 18,
    color: '#c4bdb5',
  },
  text: {
    fontFamily: "'Lora', serif",
    fontSize: 16,
    lineHeight: 1.8,
    marginBottom: 6,
    color: 'inherit',
  },
  loadingText: {
    color: '#6b625a',
    fontStyle: 'italic',
    animation: 'blink 2.2s ease-in-out infinite',
  },
  inputArea: {
    borderTop: '1px solid #1e1a16',
    padding: '16px 24px 20px',
    background: '#0d0b09',
    flexShrink: 0,
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 12,
    maxWidth: 680,
    margin: '0 auto',
    background: '#141210',
    border: '1px solid #2a2520',
    borderRadius: 12,
    padding: '10px 10px 10px 18px',
  },
  textarea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 15,
    fontWeight: 300,
    color: '#e8dfd4',
    lineHeight: 1.6,
    minHeight: 24,
    maxHeight: 160,
    overflowY: 'auto',
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid #3d3830',
    background: '#1e1a16',
    color: '#c97b2a',
    fontSize: 16,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.2s',
    lineHeight: 1,
  },
  hint: {
    fontSize: 11,
    color: '#3d3830',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: '0.04em',
    maxWidth: 680,
    margin: '8px auto 0',
  },
}
