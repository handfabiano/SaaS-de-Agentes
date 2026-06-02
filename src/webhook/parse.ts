// src/webhook/parse.ts
// Normaliza o payload bruto do Evolution (evento MESSAGES_UPSERT) para o nosso
// formato interno `MensagemRecebida`. Tolerante às variações de shape do Evolution.

import type { MensagemRecebida } from "./types.ts";

/** Extrai o texto da mensagem cobrindo os formatos comuns do WhatsApp/Evolution. */
function extrairTexto(message: Record<string, unknown> | undefined): string {
  if (!message) return "";
  const conv = message.conversation;
  if (typeof conv === "string") return conv;
  const ext = message.extendedTextMessage as { text?: unknown } | undefined;
  if (ext && typeof ext.text === "string") return ext.text;
  // legendas de imagem/vídeo
  const img = message.imageMessage as { caption?: unknown } | undefined;
  if (img && typeof img.caption === "string") return img.caption;
  const vid = message.videoMessage as { caption?: unknown } | undefined;
  if (vid && typeof vid.caption === "string") return vid.caption;
  return "";
}

/**
 * Converte o body do webhook do Evolution em `MensagemRecebida`.
 * Retorna null quando não é uma mensagem de texto processável.
 */
export function parseEvolution(body: unknown): MensagemRecebida | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // Evolution manda event como "messages.upsert"
  const evento = String(b.event ?? "").toLowerCase();
  if (evento && !evento.includes("messages.upsert")) return null;

  const instancia = String(b.instance ?? b.instanceName ?? "").trim();
  const data = b.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const key = data.key as
    | { remoteJid?: string; fromMe?: boolean; id?: string }
    | undefined;
  if (!key) return null;

  const externalId = String(key.id ?? "").trim();
  const remoteJid = String(key.remoteJid ?? "");
  const contatoExterno = remoteJid.split("@")[0] ?? "";
  const fromMe = Boolean(key.fromMe);
  const texto = extrairTexto(data.message as Record<string, unknown> | undefined).trim();

  if (!externalId || !contatoExterno) return null;

  return {
    canal: "whatsapp",
    instancia,
    contatoExterno,
    texto,
    externalId,
    fromMe,
  };
}
