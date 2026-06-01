// src/components/ui/Badge.tsx
import type { ReactNode } from "react";

type Tone = "neutral" | "moss" | "ember" | "ok" | "danger" | "clay";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
