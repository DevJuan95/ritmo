import { useState } from 'react';
import { Sidebar } from './components/sidebar';
import { PlannerScreen } from './screens/planner-screen';
import { TodayScreen } from './screens/today-screen';
import { useRitmo } from './use-ritmo';
import { focusCountText } from './view';

export function App() {
  const [screen, setScreen] = useState<'today' | 'planner'>('today');
  const { state, error, run, showError } = useRitmo();
  return <div className="app-shell">
    <Sidebar screen={screen} onNavigate={setScreen} />
    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">Tu espacio de foco</div><h1>Haz espacio para avanzar.</h1></div><div className="focus-count">{state ? focusCountText(state.focusCount) : ''}</div></header>
      {(state?.blockError || error) && <div className="error-banner" role="alert">{state?.blockError || error}</div>}
      {state && (screen === 'today' ? <TodayScreen state={state} run={run} /> : <PlannerScreen state={state} run={run} showError={showError} />)}
    </main>
  </div>;
}
