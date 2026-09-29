import { useCallback, useEffect, useRef, useState } from 'react'
import ChatInterface from './components/ChatInterface'
import Sidebar from './components/Sidebar'
import { getHealth, getSchema, queryDatabase } from './services/api'
import { addHistoryItem, clearHistory, loadHistory } from './utils/queryHistory'

let nextId = 1

export default function App() {
  const [messages, setMessages] = useState([])
  const [asking, setAsking] = useState(false)

  // Query history lives in localStorage (see utils/queryHistory.js) -- no
  // backend call, no loading state needed, it's available synchronously.
  const [history, setHistory] = useState(() => loadHistory())

  const [tables, setTables] = useState([])
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [schemaError, setSchemaError] = useState(null)

  const [health, setHealth] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const refreshSchema = useCallback(async () => {
    try {
      const t = await getSchema()
      setTables(t)
      setSchemaError(null)
    } catch (err) {
      setSchemaError(err.message)
    } finally {
      setSchemaLoading(false)
    }
  }, [])

  const refreshHealth = useCallback(async () => {
    try {
      const h = await getHealth()
      setHealth(h)
    } catch {
      setHealth({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    refreshSchema()
    refreshHealth()
    // Light polling so the connection indicator reflects a backend that goes
    // down/up while the app is open, without needing a websocket.
    const interval = setInterval(refreshHealth, 30_000)
    return () => clearInterval(interval)
  }, [refreshSchema, refreshHealth])

  const askingRef = useRef(false)

  async function handleAsk(question) {
    if (askingRef.current) return
    askingRef.current = true
    setAsking(true)

    const id = nextId++
    const timestamp = new Date().toISOString()
    setMessages((prev) => [...prev, { id, question, timestamp, status: 'loading', result: null }])

    const result = await queryDatabase(question)

    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'done', result } : m)))
    setAsking(false)
    askingRef.current = false

    // Only successful queries are saved to history.
    if (result.success) {
      setHistory(
        addHistoryItem({
          question: result.question,
          sql: result.sql,
          rowCount: result.row_count,
          columns: result.columns,
          rows: result.rows,
        }),
      )
    }
  }

  function handleNewQuery() {
    setMessages([])
    setSidebarOpen(false)
  }

  /**
   * Clicking a history item restores it instantly if the result was cached
   * (see MAX_CACHED_ROWS in utils/queryHistory.js); otherwise it falls back to
   * re-asking the question, which runs the pipeline again.
   */
  function handleSelectHistory(item) {
    setSidebarOpen(false)

    if (item.columns && item.rows) {
      const id = nextId++
      setMessages((prev) => [
        ...prev,
        {
          id,
          question: item.question,
          timestamp: item.timestamp,
          status: 'done',
          result: {
            success: true,
            question: item.question,
            sql: item.sql,
            columns: item.columns,
            rows: item.rows,
            row_count: item.rowCount,
            execution_time_ms: null,
            error: null,
          },
        },
      ])
      return
    }

    handleAsk(item.question)
  }

  function handleClearHistory() {
    setHistory(clearHistory())
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewQuery={handleNewQuery}
        history={history}
        onSelectHistory={handleSelectHistory}
        onClearHistory={handleClearHistory}
        tables={tables}
        schemaLoading={schemaLoading}
        schemaError={schemaError}
        health={health}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3.5 md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-slate-800">Ask your data</h1>
            <p className="truncate text-xs text-slate-500">
              {health?.database_path ? `Connected to ${health.database_path}` : 'Natural language to SQL'}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <ChatInterface messages={messages} onAsk={handleAsk} asking={asking} />
        </div>
      </div>
    </div>
  )
}
