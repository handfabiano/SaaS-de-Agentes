// src/lib/format.ts
// Formatadores de exibição (pt-BR). Custo estimado em USD (preços do backend são USD).

const dtf = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dtfFull = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const nf = new Intl.NumberFormat("pt-BR");

const usd = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdPrecise = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dtf.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dtfFull.format(d);
}

export function formatNumber(n: number): string {
  return nf.format(n);
}

/** Custo em USD. Para valores muito pequenos, mostra mais casas. */
export function formatMoney(n: number): string {
  return n > 0 && n < 0.01 ? usdPrecise.format(n) : usd.format(n);
}

/** "agora há pouco", "há 3 h", "há 2 dias"… para listas. */
export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  return formatDate(iso);
}
