// src/components/charts/BarChart.tsx
// Gráfico de barras leve em SVG (sem dependências). Usado no dashboard de uso.

import { useState } from "react";

export interface BarDatum {
  label: string;
  value: number;
  /** Rótulo curto no eixo X (ex.: "12/05"). */
  tick: string;
}

export function BarChart({
  data,
  format,
  height = 200,
}: {
  data: BarDatum[];
  format: (v: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const barGap = 4;

  return (
    <div className="barchart" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const active = hover === i;
        return (
          <div
            className="barchart__col"
            key={i}
            style={{ marginInline: barGap / 2 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {active && (
              <div className="barchart__tip">
                <strong>{format(d.value)}</strong>
                <span>{d.label}</span>
              </div>
            )}
            <div className="barchart__track">
              <div
                className={`barchart__bar ${active ? "is-active" : ""}`}
                style={{ height: `${Math.max(pct, d.value > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="barchart__tick">{d.tick}</span>
          </div>
        );
      })}
    </div>
  );
}
