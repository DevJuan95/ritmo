import { NavLink } from 'react-router';

export function Sidebar() {
  const date = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return <aside className="sidebar">
    <div>
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>ritmo<span className="brand-dot">.</span></span></div>
      <nav className="sidebar-nav" aria-label="Secciones">
        <NavLink to="/" end className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}>Hoy</NavLink>
        <NavLink to="/planner" className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}>Planner</NavLink>
      </nav>
    </div>
    <div className="sidebar-bottom"><div className="today-label">Hoy</div><div className="sidebar-date">{date}</div><p>Un bloque de atención a la vez.</p><span className="version">Versión inicial para macOS</span></div>
  </aside>;
}
