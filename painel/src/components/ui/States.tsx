// src/components/ui/States.tsx
// Estados transversais exigidos pelo briefing: loading (skeleton), vazio, erro.

import type { ReactNode } from "react";
import { Button } from "./Button";

/** Bloco de skeleton retangular. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
}) {
  return (
    <span
      className="skeleton"
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

/** Várias linhas de skeleton, para tabelas/listas. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" role="status" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-rows__row" key={i}>
          <Skeleton height={14} width={`${40 + ((i * 13) % 45)}%`} />
          <Skeleton height={14} width="20%" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = "✦",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="state state--empty">
      <div className="state__icon" aria-hidden>
        {icon}
      </div>
      <h3 className="state__title">{title}</h3>
      {description && <p className="state__desc">{description}</p>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Algo deu errado",
  description,
  onRetry,
}: {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="state state--error">
      <div className="state__icon" aria-hidden>
        ⚠
      </div>
      <h3 className="state__title">{title}</h3>
      {description && <p className="state__desc">{description}</p>}
      {onRetry && (
        <div className="state__action">
          <Button variant="secondary" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      )}
    </div>
  );
}

/** Spinner centralizado para áreas pequenas. */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status" aria-label={label ?? "Carregando"}>
      <span className="spinner" aria-hidden />
      {label && <span className="spinner-wrap__label">{label}</span>}
    </div>
  );
}
