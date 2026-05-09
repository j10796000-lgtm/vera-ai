import { useState } from 'react'
import Chat from './components/Chat'
import MoodTracker from './components/MoodTracker'

type Tab = 'chat' | 'mood'

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.ember} />
          <span style={styles.brandName}>Vera</span>
          <span style={styles.brandSub}>feel heard</span>
        </div>
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'chat' ? styles.tabActive : {}) }}
            onClick={() => setTab('chat')}
          >
            chat
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'mood' ? styles.tabActive : {}) }}
            onClick={() => setTab('mood')}
          >
            mood
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {tab === 'chat' ? <Chat /> : <MoodTracker />}
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0d0b09',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 28px',
    borderBottom: '1px solid #1e1a16',
    background: '#0d0b09',
    flexShrink: 0,
    zIndex: 10,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  ember: {
    width: 8,
    height: 8,
    borderRadius: 2,
    background: '#c97b2a',
    animation: 'pulse 3s ease-in-out infinite',
  },
  brandName: {
    fontFamily: "'Lora', serif",
    fontStyle: 'italic',
    fontSize: 20,
    color: '#e8dfd4',
  },
  brandSub: {
    fontSize: 11,
    fontWeight: 300,
    color: '#5a5248',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  tabs: {
    display: 'flex',
    gap: 4,
  },
  tab: {
    background: 'none',
    border: '1px solid transparent',
    color: '#5a5248',
    padding: '6px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.04em',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#c4bdb5',
    border: '1px solid #2a2520',
    background: '#141210',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
}
