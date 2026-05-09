import { useState, useEffect } from 'react'

const MOODS = [
  { id: 'radiant', label: 'radiant', emoji: '✦', color: '#f5c842', desc: 'Everything feels alive.' },
  { id: 'okay',    label: 'okay',    emoji: '◌', color: '#a8c5a0', desc: 'Afloat. Neither here nor there.' },
  { id: 'heavy',   label: 'heavy',   emoji: '◆', color: '#7a9bbf', desc: 'Something is weighing on me.' },
  { id: 'hollow',  label: 'hollow',  emoji: '○', color: '#9b8ea8', desc: 'Empty. Going through motions.' },
  { id: 'raw',     label: 'raw',     emoji: '▲', color: '#c97b2a', desc: 'Feeling everything, all at once.' },
  { id: 'stormy',  label: 'stormy',  emoji: '◈', color: '#7b8fa8', desc: 'Something is building inside.' },
  { id: 'tender',  label: 'tender',  emoji: '◎', color: '#c4a882', desc: 'Open. Soft. Careful.' },
  { id: 'numb',    label: 'numb',    emoji: '▪', color: '#666058', desc: 'Not feeling much of anything.' },
]

interface Entry {
  id: number
  mood: string
  note: string
  timestamp: string
}

function loadEntries(): Entry[] {
  try {
    const data = localStorage.getItem('vera_mood_entries')
    if (!data) return []
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveEntries(entries: Entry[]) {
  try {
    localStorage.setItem('vera_mood_entries', JSON.stringify(entries))
  } catch (e) {
    console.error('Failed to save mood entries:', e)
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function MoodTracker() {
  const [entries, setEntries] = useState<Entry[]>(() => loadEntries())
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [view, setView] = useState<'log' | 'history'>('log')
  const [saved, setSaved] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => { saveEntries(entries) }, [entries])

  const handleLog = () => {
    if (!selected) return
    const entry: Entry = { id: Date.now(), mood: selected, note: note.trim(), timestamp: new Date().toISOString() }
    setEntries(prev => [entry, ...prev])
    setSelected(null)
    setNote('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const mood = MOODS.find(m => m.id === selected)
  const hoveredMood = MOODS.find(m => m.id === hovered)

  const grouped = entries.reduce((acc: Record<string, Entry[]>, e) => {
    const day = new Date(e.timestamp).toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(e)
    return acc
  }, {})

  return (
    <div style={s.root}>
      <div style={s.subtabs}>
        <button type="button" style={{ ...s.subtab, ...(view === 'log' ? s.subtabActive : {}) }} onClick={() => setView('log')}>today</button>
        <button type="button" style={{ ...s.subtab, ...(view === 'history' ? s.subtabActive : {}) }} onClick={() => setView('history')}>
          history {entries.length > 0 && <span style={s.badge}>{entries.length}</span>}
        </button>
      </div>

      {view === 'log' && (
        <div style={s.logView}>
          <div style={s.prompt}>
            <p style={s.promptText}>
              {saved ? 'logged. vera is with you.' : 'how are you sitting right now?'}
            </p>
            {(hovered || selected) && !saved && (
              <p style={{ ...s.promptSub, color: (hoveredMood || mood)?.color }}>
                {(hoveredMood || mood)?.desc}
              </p>
            )}
          </div>

          <div style={s.grid}>
            {MOODS.map(m => (
              <button
                type="button"
                key={m.id}
                style={{
                  ...s.moodBtn,
                  ...(selected === m.id ? { ...s.moodBtnActive, borderColor: m.color } : {}),
                }}
                onClick={() => setSelected(selected === m.id ? null : m.id)}
                onMouseEnter={() => setHovered(m.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span style={{ ...s.emoji, color: selected === m.id ? m.color : '#4a4540' }}>{m.emoji}</span>
                <span style={{ ...s.moodLabel, color: selected === m.id ? m.color : '#6b625a' }}>{m.label}</span>
              </button>
            ))}
          </div>

          {selected && (
            <div style={s.noteWrap} className="fade-up">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="say more, or leave it bare..."
                style={s.noteArea}
                rows={3}
              />
              <button
                type="button"
                onClick={handleLog}
                style={{ ...s.logBtn, borderColor: mood?.color || '#3d3830', color: mood?.color || '#c97b2a' }}
              >
                log this moment
              </button>
            </div>
          )}

          {saved && (
            <div style={s.savedMsg} className="fade-up">
              <span style={{ color: '#c97b2a' }}>✦</span>
              <span>moment captured.</span>
            </div>
          )}
        </div>
      )}

      {view === 'history' && (
        <div style={s.historyView}>
          {entries.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>○</div>
              <p style={s.emptyText}>no entries yet.</p>
              <p style={s.emptySub}>your moods will live here.</p>
            </div>
          ) : (
            <>
              <div style={s.strip}>
                {MOODS.map(m => {
                  const count = entries.filter(e => e.mood === m.id).length
                  const pct = entries.length ? count / entries.length : 0
                  return (
                    <div key={m.id} style={s.stripItem}>
                      <div style={{ ...s.stripBar, height: `${Math.max(4, pct * 60)}px`, background: m.color, opacity: count ? 0.85 : 0.15 }} />
                      <span style={{ ...s.stripLabel, color: count ? m.color : '#3d3830' }}>{m.emoji}</span>
                    </div>
                  )
                })}
              </div>
              <p style={s.stripCaption}>{entries.length} moment{entries.length !== 1 ? 's' : ''} logged</p>

              {Object.entries(grouped).map(([day, dayEntries]) => (
                <div key={day} style={s.dayGroup}>
                  <div style={s.dayLabel}>{formatDate(dayEntries[0].timestamp)}</div>
                  {dayEntries.map(e => {
                    const m = MOODS.find(x => x.id === e.mood)
                    return (
                      <div key={e.id} style={s.card}>
                        <div style={s.cardLeft}>
                          <span style={{ ...s.cardEmoji, color: m?.color }}>{m?.emoji}</span>
                          <div>
                            <span style={{ ...s.cardMood, color: m?.color }}>{m?.label}</span>
                            <span style={s.cardTime}>{formatTime(e.timestamp)}</span>
                          </div>
                        </div>
                        {e.note && <p style={s.cardNote}>"{e.note}"</p>}
                      </div>
                    )
                  })}
                </div>
              ))}

              <button type="button" style={s.clearBtn} onClick={() => { if (window.confirm('Clear all entries?')) setEntries([]) }}>
                clear history
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  subtabs: { display: 'flex', gap: 4, padding: '12px 24px 0', maxWidth: 600, width: '100%', margin: '0 auto' },
  subtab: {
    background: 'none', border: '1px solid transparent', color: '#5a5248',
    padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.04em',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  subtabActive: { color: '#c4bdb5', border: '1px solid #2a2520', background: '#141210' },
  badge: { background: '#2a2520', color: '#6b625a', borderRadius: 10, padding: '1px 7px', fontSize: 11 },

  logView: {
    flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 24px',
    maxWidth: 600, width: '100%', margin: '0 auto', gap: 28, overflowY: 'auto',
  },
  prompt: { minHeight: 56 },
  promptText: { fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 20, color: '#c4bdb5', marginBottom: 8 },
  promptSub: { fontSize: 14, fontWeight: 300, transition: 'color 0.3s' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  moodBtn: {
    background: '#111009', border: '1px solid #1e1a16', borderRadius: 10,
    padding: '16px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 8, transition: 'all 0.2s',
  },
  moodBtnActive: { background: '#161310' },
  emoji: { fontSize: 20, transition: 'color 0.2s', fontFamily: 'monospace' },
  moodLabel: { fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: '0.06em', transition: 'color 0.2s' },

  noteWrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  noteArea: {
    background: '#111009', border: '1px solid #2a2520', borderRadius: 10,
    padding: '14px 16px', color: '#c4bdb5', fontFamily: "'Lora', serif",
    fontStyle: 'italic', fontSize: 15, lineHeight: 1.7, resize: 'none', outline: 'none', width: '100%',
  },
  logBtn: {
    background: '#111009', border: '1px solid', borderRadius: 8, padding: '10px 20px',
    fontSize: 13, fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.06em',
    cursor: 'pointer', alignSelf: 'flex-start', transition: 'all 0.2s',
  },
  savedMsg: { display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 16, color: '#c4bdb5' },

  historyView: { flex: 1, padding: '20px 24px', maxWidth: 600, width: '100%', margin: '0 auto', overflowY: 'auto' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 },
  emptyIcon: { fontSize: 32, color: '#2a2520' },
  emptyText: { fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 18, color: '#4a4540' },
  emptySub: { fontSize: 13, color: '#3a3530', fontWeight: 300 },

  strip: { display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 6, padding: '0 4px' },
  stripItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  stripBar: { width: '100%', borderRadius: '3px 3px 0 0', transition: 'height 0.4s ease', minHeight: 4 },
  stripLabel: { fontSize: 14, fontFamily: 'monospace' },
  stripCaption: { fontSize: 11, color: '#3d3830', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24 },

  dayGroup: { marginBottom: 24 },
  dayLabel: { fontSize: 11, color: '#5a5248', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 },
  card: { background: '#111009', border: '1px solid #1e1a16', borderRadius: 10, padding: '12px 16px', marginBottom: 8 },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 },
  cardEmoji: { fontSize: 18, fontFamily: 'monospace' },
  cardMood: { fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 16, display: 'block' },
  cardTime: { fontSize: 11, color: '#4a4540', letterSpacing: '0.06em', display: 'block', marginTop: 2 },
  cardNote: { fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 14, color: '#7a7268', lineHeight: 1.6, marginTop: 6, paddingLeft: 30 },
  clearBtn: {
    background: 'none', border: '1px solid #1e1a16', color: '#3d3830', borderRadius: 6,
    padding: '8px 16px', fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", marginTop: 8,
  },
}
