// src/components/layout/Shell.tsx
// Layout geral: sidebar de navegação à esquerda, topo com seletor de tenant +
// usuário/sair, e a área de conteúdo (Outlet) à direita.

import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { TenantSelector } from "./TenantSelector";

const NAV = [
  { to: "/agentes", label: "Agentes", icon: AgentsIcon },
  { to: "/conversas", label: "Conversas", icon: ChatIcon },
  { to: "/uso", label: "Uso", icon: ChartIcon },
];

export function Shell() {
  const { user, signOut } = useAuth();
  const { papel } = useTenant();
  const email = user?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden>
            ◍
          </span>
          <span className="sidebar__brandtext">
            Agentes<span className="sidebar__brandsub">admin</span>
          </span>
        </div>

        <nav className="sidebar__nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `navitem ${isActive ? "navitem--active" : ""}`
              }
            >
              <item.icon />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__foot">
          {papel && (
            <span className={`role-tag role-tag--${papel}`}>
              {papel === "admin" ? "Administrador" : "Operador"}
            </span>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <TenantSelector />
          <div className="topbar__spacer" />
          <div className="topbar__user">
            <span className="avatar" aria-hidden>
              {initial}
            </span>
            <span className="topbar__email" title={email}>
              {email}
            </span>
            <button className="btn btn--ghost btn--sm" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* Ícones inline (sem dependência externa) */
function AgentsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="8" width="16" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8V4M8 13h.01M16 13h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3V6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 19V5M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 16v-4M13 16V8M17 16v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
