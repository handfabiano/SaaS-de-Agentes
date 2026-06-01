// src/lib/chunk.ts
// Divide um texto em trechos para indexação. Respeita limites de parágrafo
// quando possível e aplica sobreposição para não perder contexto nas bordas.

export interface ChunkOptions {
  /** Tamanho-alvo de cada trecho, em caracteres. */
  maxChars?: number;
  /** Sobreposição entre trechos consecutivos, em caracteres. */
  overlap?: number;
}

/** Quebra o texto em trechos. Retorna [] para texto vazio. */
export function chunkText(texto: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 1500;
  const overlap = Math.min(opts.overlap ?? 200, Math.floor(maxChars / 2));

  const limpo = texto.replace(/\r\n/g, "\n").trim();
  if (!limpo) return [];
  if (limpo.length <= maxChars) return [limpo];

  // Quebra por parágrafos; parágrafos grandes são fatiados por tamanho.
  const paragrafos = limpo.split(/\n{2,}/).flatMap((p) => fatiarDuro(p.trim(), maxChars));

  const chunks: string[] = [];
  let atual = "";
  for (const p of paragrafos) {
    if (!p) continue;
    if (atual && atual.length + p.length + 2 > maxChars) {
      chunks.push(atual);
      // começa o próximo com a cauda do anterior (overlap)
      atual = overlap > 0 ? atual.slice(-overlap) + "\n\n" + p : p;
    } else {
      atual = atual ? `${atual}\n\n${p}` : p;
    }
  }
  if (atual.trim()) chunks.push(atual.trim());
  return chunks;
}

/** Fatia um bloco que sozinho já excede maxChars (sem pontos de parágrafo). */
function fatiarDuro(bloco: string, maxChars: number): string[] {
  if (bloco.length <= maxChars) return [bloco];
  const partes: string[] = [];
  let i = 0;
  while (i < bloco.length) {
    partes.push(bloco.slice(i, i + maxChars));
    i += maxChars;
  }
  return partes;
}
