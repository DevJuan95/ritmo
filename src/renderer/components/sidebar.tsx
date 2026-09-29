import { NavLink } from 'react-router';

export function Sidebar() {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">ritmo</span></div>
    <nav className="sidebar-nav" aria-label="Secciones">
      <NavLink to="/" end className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}>Hoy</NavLink>
      <NavLink to="/planner" className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}>Planner</NavLink>
    </nav>
    <p className="sidebar-note">Un bloque de atención a la vez.</p>
  </aside>;
}
