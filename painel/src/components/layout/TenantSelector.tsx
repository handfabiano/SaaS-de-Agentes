// src/components/layout/TenantSelector.tsx
// Seletor de tenant no topo. Só aparece quando o usuário tem +1 tenant;
// com um único tenant, mostra apenas o nome.

import { useEffect, useRef, useState } from "react";
import { useTenant } from "../../context/TenantContext";

export function TenantSelector() {
  const { tenants, activeTenant, setActiveTenant } = useTenant();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!activeTenant) return null;

  if (tenants.length <= 1) {
    return (
      <div className="tenant-pill tenant-pill--static">
        <span className="tenant-pill__mark" aria-hidden>
          {activeTenant.nome.charAt(0).toUpperCase()}
        </span>
        <span className="tenant-pill__name">{activeTenant.nome}</span>
      </div>
    );
  }

  return (
    <div className="tenant-select" ref={ref}>
      <button
        className="tenant-pill"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="tenant-pill__mark" aria-hidden>
          {activeTenant.nome.charAt(0).toUpperCase()}
        </span>
        <span className="tenant-pill__name">{activeTenant.nome}</span>
        <span className="tenant-pill__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <ul className="tenant-menu" role="listbox">
          {tenants.map((t) => (
            <li key={t.id} role="option" aria-selected={t.id === activeTenant.id}>
              <button
                className={`tenant-menu__item ${
                  t.id === activeTenant.id ? "is-active" : ""
                }`}
                onClick={() => {
                  setActiveTenant(t.id);
                  setOpen(false);
                }}
              >
                <span className="tenant-pill__mark" aria-hidden>
                  {t.nome.charAt(0).toUpperCase()}
                </span>
                <span className="tenant-menu__name">{t.nome}</span>
                {t.id === activeTenant.id && (
                  <span className="tenant-menu__check" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
