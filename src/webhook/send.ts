// src/webhook/send.ts
// Envio de mensagens pelo Evolution API (WhatsApp). Endpoint v2:
//   POST {baseUrl}/message/sendText/{instancia}
//   headers: { apikey }, body: { number, text }

export interface EvolutionCreds {
  baseUrl: string;
  apiKey: string;
  instancia: string;
}

/** Envia uma mensagem de texto via Evolution. Lança em caso de falha HTTP. */
export async function enviarTextoEvolution(
  creds: EvolutionCreds,
  numero: string,
  texto: string
): Promise<void> {
  const url = `${creds.baseUrl.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(
    creds.instancia
  )}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: creds.apiKey,
    },
    body: JSON.stringify({ number: numero, text: texto }),
  });

  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    throw new Error(
      `Evolution sendText falhou (${resp.status}): ${corpo.slice(0, 300)}`
    );
  }
}
