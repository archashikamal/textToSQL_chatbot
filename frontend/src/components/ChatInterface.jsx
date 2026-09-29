import { useEffect, useRef, useState } from 'react'
import Message from './Message'

const EXAMPLE_QUESTIONS = [
  'Show total sales',
  'Show top 10 products',
  'Show sales by month',
  'Count customers by region',
]

function EmptyState({ onPick }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-indigo-600">
          <path
            d="M4 6.5C4 5.12 7.58 4 12 4s8 1.12 8 2.5-3.58 2.5-8 2.5-8-1.12-8-2.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M4 6.5V17.5C4 18.88 7.58 20 12 20s8-1.12 8-2.5V6.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M4 12c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-800">Ask your database a question</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Questions are answered using retrieval-augmented SQL generation over your connected
        database — try one of these, or type your own below.
      </p>
      <div className="mt-5 grid w-full max-w-md gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-left text-sm text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ChatInterface({ messages, onAsk, asking }) {
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function submit() {
    const question = input.trim()
    if (!question || asking) return
    onAsk(question)
    setInput('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function handlePick(question) {
    setInput(question)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="thin-scrollbar flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <EmptyState onPick={handlePick} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your data… (e.g. How many sales were made in 2024?)"
            rows={1}
            className="thin-scrollbar max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim() || asking}
            className="inline-flex h-[42px] items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {asking ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Asking…
              </>
            ) : (
              <>
                Ask
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
                </svg>
              </>
            )}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-[11px] text-slate-500">
          Press Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </div>
  )
}
