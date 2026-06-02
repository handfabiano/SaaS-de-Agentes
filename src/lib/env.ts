// src/lib/env.ts
// Leitura de variáveis de ambiente compatível com Node (process.env) e Deno
// (Deno.env) — o mesmo código roda nos testes (tsx) e nas Edge Functions.

export function getEnv(key: string): string | undefined {
  const g = globalThis as {
    Deno?: { env: { get(k: string): string | undefined } };
    process?: { env: Record<string, string | undefined> };
  };
  if (g.Deno?.env) return g.Deno.env.get(key) ?? undefined;
  if (g.process?.env) return g.process.env[key];
  return undefined;
}
