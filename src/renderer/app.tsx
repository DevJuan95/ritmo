import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { todayKey } from '../shared/validation';
import { Sidebar } from './components/sidebar';
import { PlannerScreen } from './screens/planner-screen';
import { TodayScreen } from './screens/today-screen';
import { useRitmo } from './use-ritmo';
import { focusCountText } from './view';

export function App() {
  const [plannerDate, setPlannerDate] = useState(todayKey);
  const [plannerTitle, setPlannerTitle] = useState('');
  const { state, error, run, showError } = useRitmo();
  return <div className="app-shell">
    <Sidebar />
    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">Tu espacio de foco</div><h1>Haz espacio para avanzar.</h1></div><div className="focus-count">{state ? focusCountText(state.focusCount) : ''}</div></header>
      {(state?.blockError || error) && <div className="error-banner" role="alert">{state?.blockError || error}</div>}
      <Routes>
        <Route path="/" element={state && <TodayScreen state={state} run={run} />} />
        <Route path="/planner" element={state && <PlannerScreen state={state} run={run} showError={showError} date={plannerDate} onDateChange={setPlannerDate} title={plannerTitle} onTitleChange={setPlannerTitle} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>;
}
