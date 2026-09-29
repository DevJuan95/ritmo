type Screen = 'today' | 'planner';

export function Sidebar({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  const date = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return <aside className="sidebar">
    <div>
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>ritmo<span className="brand-dot">.</span></span></div>
      <nav className="sidebar-nav" aria-label="Secciones">
        <button type="button" className={`nav-button ${screen === 'today' ? 'active' : ''}`} aria-current={screen === 'today' ? 'page' : undefined} onClick={() => onNavigate('today')}>Hoy</button>
        <button type="button" className={`nav-button ${screen === 'planner' ? 'active' : ''}`} aria-current={screen === 'planner' ? 'page' : undefined} onClick={() => onNavigate('planner')}>Planner</button>
      </nav>
    </div>
    <div className="sidebar-bottom"><div className="today-label">Hoy</div><div className="sidebar-date">{date}</div><p>Un bloque de atención a la vez.</p><span className="version">Versión inicial para macOS</span></div>
  </aside>;
}
