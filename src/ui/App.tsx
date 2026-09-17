import { useEffect, useMemo, useState } from 'react'
import { selectBudgetSummary, useAppStore } from '../state/store'
import type { Step } from '../persistence/session'
import { BudgetScreen } from './screens/BudgetScreen'
import { UploadScreen } from './screens/UploadScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { SelectScreen } from './screens/SelectScreen'
import { BudgetBar } from './components/BudgetBar'
import { StepNav } from './components/StepNav'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SuggestionsSheet } from './components/SuggestionsSheet'

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'rbo.theme'

function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      return saved === 'light' || saved === 'dark' ? saved : 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      if (theme === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Storage unavailable (private mode) — the theme still applies for this visit.
    }
  }, [theme])

  return [theme, setTheme]
}

export default function App() {
  const hydrated = useAppStore((s) => s.hydrated)
  const hydrate = useAppStore((s) => s.hydrate)
  const resetAll = useAppStore((s) => s.resetAll)
  const step = useAppStore((s) => s.step)
  const goTo = useAppStore((s) => s.goTo)
  const menu = useAppStore((s) => s.menu)
  const budget = useAppStore((s) => s.budget)
  const selections = useAppStore((s) => s.selections)
  const storageWarning = useAppStore((s) => s.storageWarning)

  const [theme, setTheme] = useTheme()
  const [confirmReset, setConfirmReset] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const summary = useMemo(
    () => selectBudgetSummary({ budget, menu, selections }),
    [budget, menu, selections],
  )

  const enabledSteps: Step[] = useMemo(() => {
    const steps: Step[] = ['budget', 'upload']
    if (menu.items.length > 0) steps.push('review')
    if (menu.confirmed) steps.push('select')
    return steps
  }, [menu.items.length, menu.confirmed])

  if (!hydrated) {
    return (
      <div className="app">
        <main className="app__main">
          <div className="empty" role="status">
            <span className="empty__icon" aria-hidden="true">🍽️</span>
            <p>טוען את הארוחה שלכם…</p>
          </div>
        </main>
      </div>
    )
  }

  const showBudgetBar = step === 'select'

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title">
          <h1>תקציב במסעדה</h1>
          <small>הכול נשאר במכשיר</small>
        </div>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
          aria-label={`ערכת נושא: ${theme === 'system' ? 'לפי המערכת' : theme === 'dark' ? 'כהה' : 'בהירה'}. לחצו להחלפה`}
        >
          {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '◐'}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => setConfirmReset(true)}
        >
          התחל מחדש
        </button>
      </header>

      <StepNav current={step} onNavigate={goTo} enabled={enabledSteps} />

      <main className={`app__main${showBudgetBar ? ' app__main--with-bar' : ''}`}>
        {!online ? (
          <div className="notice notice--warn">
            <span aria-hidden="true">📶</span>
            <span>
              אין חיבור לאינטרנט. חישוב התקציב ובחירת המנות ממשיכים לעבוד; זיהוי תמונות חדשות ידרוש
              חיבור אם קובצי השפה עדיין לא הורדו.
            </span>
          </div>
        ) : null}

        {storageWarning ? (
          <div className="notice notice--danger">
            <span aria-hidden="true">⚠</span>
            <span>{storageWarning}</span>
          </div>
        ) : null}

        {step === 'budget' ? <BudgetScreen /> : null}
        {step === 'upload' ? <UploadScreen /> : null}
        {step === 'review' ? <ReviewScreen /> : null}
        {step === 'select' ? <SelectScreen /> : null}
      </main>

      {showBudgetBar ? (
        <BudgetBar summary={summary}>
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginBlockStart: 8 }}
            onClick={() => setShowSuggestions(true)}
          >
            הצע ניצול מיטבי לתקציב
          </button>
        </BudgetBar>
      ) : null}

      <SuggestionsSheet open={showSuggestions} onClose={() => setShowSuggestions(false)} />

      <ConfirmDialog
        open={confirmReset}
        title="להתחיל מחדש?"
        body="כל הנתונים המקומיים יימחקו: התקציב, התפריט שחולץ, הבחירות ותמונות התפריט השמורות במכשיר. אי אפשר לשחזר."
        confirmLabel="מחק הכול"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          void resetAll()
          setConfirmReset(false)
        }}
      />
    </div>
  )
}
