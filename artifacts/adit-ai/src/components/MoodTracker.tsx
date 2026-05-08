import { useState, useEffect, useRef } from "react";

const MOODS = [
  { id: "radiant",   label: "radiant",   emoji: "✦", color: "#f5c842", desc: "Everything feels alive." },
  { id: "okay",      label: "okay",       emoji: "◌", color: "#a8c5a0", desc: "Afloat. Neither here nor there." },
  { id: "heavy",     label: "heavy",      emoji: "◆", color: "#7a9bbf", desc: "Something is weighing on me." },
  { id: "hollow",    label: "hollow",     emoji: "○", color: "#9b8ea8", desc: "Empty. Going through motions." },
  { id: "raw",       label: "raw",        emoji: "▲", color: "#c97b2a", desc: "Feeling everything, all at once." },
  { id: "stormy",    label: "stormy",     emoji: "◈", color: "#7b8fa8", desc: "Something is building inside." },
  { id: "tender",    label: "tender",     emoji: "◎", color: "#c4a882", desc: "Open. Soft. Careful." },
  { id: "numb",      label: "numb",       emoji: "▪", color: "#666058", desc: "Not feeling much of anything." },
];

const STORAGE_KEY = "vera_mood_entries";

interface MoodEntry {
  id: number;
  mood: string;
  note: string;
  timestamp: string;
}

function loadEntries(): MoodEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveEntries(entries: MoodEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error("Failed to save mood entries:", e);
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function VeraMoodTracker() {
  const [entries, setEntries] = useState<MoodEntry[]>(() => loadEntries());
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [view, setView] = useState<"log" | "history">("log");
  const [saved, setSaved] = useState(false);
  const [hoveredMood, setHoveredMood] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { saveEntries(entries); }, [entries]);

  const handleLog = () => {
    if (!selected) return;
    const entry: MoodEntry = {
      id: Date.now(),
      mood: selected,
      note: note.trim(),
      timestamp: new Date().toISOString(),
    };
    setEntries(prev => [entry, ...prev]);
    setSelected(null);
    setNote("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const mood = MOODS.find(m => m.id === selected);
  const hovered = MOODS.find(m => m.id === hoveredMood);

  const grouped = entries.reduce<Record<string, MoodEntry[]>>((acc, e) => {
    const day = new Date(e.timestamp).toDateString();
    if (!acc[day]) acc[day] = [];
    acc[day].push(e);
    return acc;
  }, {});

  return (
    <div style={s.root}>
      <style>{css}</style>

      <div style={s.innerTabs}>
        <button style={{ ...s.tab, ...(view === "log" ? s.tabActive : {}) }} onClick={() => setView("log")}>
          today
        </button>
        <button style={{ ...s.tab, ...(view === "history" ? s.tabActive : {}) }} onClick={() => setView("history")}>
          history {entries.length > 0 && <span style={s.badge}>{entries.length}</span>}
        </button>
      </div>

      {view === "log" && (
        <div style={s.logView}>
          <div style={s.prompt}>
            <p style={s.promptText}>
              {saved ? "logged. vera is with you." : "how are you sitting right now?"}
            </p>
            {(hoveredMood || selected) && !saved && (
              <p style={{ ...s.promptSub, color: (hovered || mood)?.color }}>
                {(hovered || mood)?.desc}
              </p>
            )}
          </div>

          <div style={s.moodGrid}>
            {MOODS.map(m => (
              <button
                key={m.id}
                style={{
                  ...s.moodBtn,
                  ...(selected === m.id ? { ...s.moodBtnActive, borderColor: m.color, boxShadow: `0 0 0 1px ${m.color}22, 0 0 18px ${m.color}18` } : {}),
                }}
                onClick={() => setSelected(selected === m.id ? null : m.id)}
                onMouseEnter={() => setHoveredMood(m.id)}
                onMouseLeave={() => setHoveredMood(null)}
              >
                <span style={{ ...s.moodEmoji, color: selected === m.id ? m.color : "#4a4540" }}>{m.emoji}</span>
                <span style={{ ...s.moodLabel, color: selected === m.id ? m.color : "#6b625a" }}>{m.label}</span>
              </button>
            ))}
          </div>

          {selected && (
            <div style={s.noteWrap} className="fadeUp">
              <textarea
                ref={textRef}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="say more, or leave it bare..."
                style={s.noteArea}
                rows={3}
              />
              <button
                onClick={handleLog}
                style={{ ...s.logBtn, borderColor: mood?.color || "#3d3830", color: mood?.color || "#c97b2a" }}
              >
                log this moment
              </button>
            </div>
          )}

          {saved && (
            <div style={s.savedMsg} className="fadeUp">
              <span style={s.savedDot}>✦</span>
              <span>moment captured.</span>
            </div>
          )}
        </div>
      )}

      {view === "history" && (
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
                  const count = entries.filter(e => e.mood === m.id).length;
                  const pct = entries.length ? count / entries.length : 0;
                  return (
                    <div key={m.id} style={s.stripItem} title={`${m.label}: ${count}`}>
                      <div style={{ ...s.stripBar, height: `${Math.max(4, pct * 60)}px`, background: m.color, opacity: count ? 0.85 : 0.15 }} />
                      <span style={{ ...s.stripLabel, color: count ? m.color : "#3d3830" }}>{m.emoji}</span>
                    </div>
                  );
                })}
              </div>
              <p style={s.stripCaption}>{entries.length} moment{entries.length !== 1 ? "s" : ""} logged</p>

              {Object.entries(grouped).map(([day, dayEntries]) => (
                <div key={day} style={s.dayGroup}>
                  <div style={s.dayLabel}>{formatDate(dayEntries[0].timestamp)}</div>
                  {dayEntries.map(e => {
                    const m = MOODS.find(x => x.id === e.mood);
                    return (
                      <div key={e.id} style={s.entryCard}>
                        <div style={s.entryLeft}>
                          <span style={{ ...s.entryEmoji, color: m?.color }}>{m?.emoji}</span>
                          <div>
                            <span style={{ ...s.entryMood, color: m?.color }}>{m?.label}</span>
                            <span style={s.entryTime}>{formatTime(e.timestamp)}</span>
                          </div>
                        </div>
                        {e.note && <p style={s.entryNote}>"{e.note}"</p>}
                      </div>
                    );
                  })}
                </div>
              ))}

              <button style={s.clearBtn} onClick={() => { if(confirm("Clear all entries?")) setEntries([]); }}>
                clear history
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const css = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fadeUp { animation: fadeUp 0.4s ease both; }
`;

const s: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  innerTabs: {
    display: "flex",
    gap: 4,
    padding: "16px 28px 0",
    borderBottom: "1px solid #1e1a16",
    paddingBottom: 0,
  },
  tab: {
    background: "none",
    border: "1px solid transparent",
    borderBottom: "none",
    color: "#5a5248",
    padding: "7px 16px",
    borderRadius: "6px 6px 0 0",
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: "0.04em",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  tabActive: {
    color: "#c4bdb5",
    border: "1px solid #2a2520",
    borderBottom: "1px solid #0d0b09",
    background: "#0d0b09",
  },
  badge: {
    background: "#2a2520",
    color: "#6b625a",
    borderRadius: 10,
    padding: "1px 7px",
    fontSize: 11,
  },
  logView: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "36px 28px",
    maxWidth: 600,
    width: "100%",
    margin: "0 auto",
    gap: 32,
  },
  prompt: { minHeight: 60 },
  promptText: {
    fontFamily: "'Lora', serif",
    fontStyle: "italic",
    fontSize: 22,
    color: "#c4bdb5",
    marginBottom: 8,
  },
  promptSub: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    fontWeight: 300,
    letterSpacing: "0.02em",
    transition: "color 0.3s",
  },
  moodGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  moodBtn: {
    background: "#111009",
    border: "1px solid #1e1a16",
    borderRadius: 10,
    padding: "16px 8px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    transition: "all 0.2s",
  },
  moodBtnActive: { background: "#161310" },
  moodEmoji: {
    fontSize: 20,
    transition: "color 0.2s",
    fontFamily: "monospace",
  },
  moodLabel: {
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 300,
    letterSpacing: "0.06em",
    transition: "color 0.2s",
  },
  noteWrap: { display: "flex", flexDirection: "column", gap: 12 },
  noteArea: {
    background: "#111009",
    border: "1px solid #2a2520",
    borderRadius: 10,
    padding: "16px 18px",
    color: "#c4bdb5",
    fontFamily: "'Lora', serif",
    fontStyle: "italic",
    fontSize: 15,
    lineHeight: 1.7,
    resize: "none",
    outline: "none",
    width: "100%",
  },
  logBtn: {
    background: "#111009",
    border: "1px solid",
    borderRadius: 8,
    padding: "11px 22px",
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: "0.06em",
    cursor: "pointer",
    alignSelf: "flex-start",
    transition: "all 0.2s",
  },
  savedMsg: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#c97b2a",
    fontFamily: "'Lora', serif",
    fontStyle: "italic",
    fontSize: 16,
  },
  savedDot: { fontSize: 12 },
  historyView: {
    flex: 1,
    padding: "28px",
    maxWidth: 600,
    width: "100%",
    margin: "0 auto",
    overflowY: "auto",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "80px 0",
    gap: 12,
  },
  emptyIcon: { fontSize: 32, color: "#2a2520" },
  emptyText: { fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: 18, color: "#4a4540" },
  emptySub: { fontSize: 13, color: "#3a3530", fontWeight: 300 },
  strip: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    height: 80,
    marginBottom: 6,
    padding: "0 4px",
  },
  stripItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
  },
  stripBar: {
    width: "100%",
    borderRadius: "3px 3px 0 0",
    transition: "height 0.4s ease",
    minHeight: 4,
  },
  stripLabel: { fontSize: 14, fontFamily: "monospace" },
  stripCaption: {
    fontSize: 11,
    color: "#3d3830",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: 28,
  },
  dayGroup: { marginBottom: 28 },
  dayLabel: {
    fontSize: 11,
    color: "#5a5248",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 10,
    paddingLeft: 2,
  },
  entryCard: {
    background: "#111009",
    border: "1px solid #1e1a16",
    borderRadius: 10,
    padding: "14px 18px",
    marginBottom: 8,
  },
  entryLeft: { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  entryEmoji: { fontSize: 18, fontFamily: "monospace" },
  entryMood: {
    fontFamily: "'Lora', serif",
    fontStyle: "italic",
    fontSize: 16,
    display: "block",
  },
  entryTime: {
    fontSize: 11,
    color: "#4a4540",
    letterSpacing: "0.06em",
    display: "block",
    marginTop: 2,
  },
  entryNote: {
    fontFamily: "'Lora', serif",
    fontStyle: "italic",
    fontSize: 14,
    color: "#7a7268",
    lineHeight: 1.6,
    marginTop: 8,
    paddingLeft: 30,
  },
  clearBtn: {
    background: "none",
    border: "1px solid #1e1a16",
    color: "#3d3830",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 12,
    letterSpacing: "0.06em",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    marginTop: 8,
    transition: "all 0.2s",
  },
};
