import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Sidebar } from './components/sidebar';
import { PlannerScreen } from './screens/planner-screen';
import { TodayScreen } from './screens/today-screen';
import { useRitmo } from './use-ritmo';
import { useToday } from './use-today';
import { dateLabel, focusCountText } from './view';

export function App() {
  const today = useToday();
  // Sin fecha elegida, el Planner sigue al día actual, también después de medianoche.
  const [plannerDate, setPlannerDate] = useState<string>();
  const [plannerTitle, setPlannerTitle] = useState('');
  const { state, error, run, showError } = useRitmo();
  return <div className="app-shell">
    <Sidebar />
    <main className="main-content">
      <header className="topbar"><h1 className="page-date">{dateLabel(today)}</h1><div className="focus-count">{state ? focusCountText(state.focusCount) : ''}</div></header>
      {state?.blockError && <div className="error-banner" role="alert">{state.blockError}</div>}
      {error && error !== state?.blockError && <div className="error-banner" role="alert">{error}</div>}
      <Routes>
        <Route path="/" element={state && <TodayScreen state={state} run={run} />} />
        <Route path="/planner" element={state && <PlannerScreen state={state} run={run} showError={showError} today={today} date={plannerDate ?? today} onDateChange={date => setPlannerDate(date === today ? undefined : date)} title={plannerTitle} onTitleChange={setPlannerTitle} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>;
}
