// src/components/knowledge/KnowledgeBase.tsx
// Base de conhecimento de um agente. Lista knowledge_sources e permite adicionar
// documento (upload de arquivo OU texto colado).
//
// IMPORTANTE: o processamento (extrair texto → gerar embeddings → inserir em
// knowledge_chunks) acontece no BACKEND (Edge Function). O painel só envia o
// conteúdo e mostra o status. Nada de embeddings no cliente.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import type { KnowledgeSource } from "../../lib/database.types";
import { formatDate } from "../../lib/format";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { TextField } from "../ui/Field";
import { EmptyState, ErrorState, Spinner } from "../ui/States";

/** Edge Function responsável por indexar o documento no backend. */
const INDEX_FUNCTION = "indexar-documento";

export function KnowledgeBase({
  agentId,
  readOnly,
}: {
  agentId: string;
  readOnly: boolean;
}) {
  const { activeTenant } = useTenant();
  const toast = useToast();

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Ids recém-enviados que ainda estão sendo indexados (status só de UI).
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!activeTenant) return;
    setStatus("loading");
    setError(null);
    const { data, error: err } = await supabase
      .from("knowledge_sources")
      .select("id, tenant_id, agent_id, titulo, origem, created_at")
      .eq("agent_id", agentId)
      .eq("tenant_id", activeTenant.id)
      .order("created_at", { ascending: false });

    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setSources((data ?? []) as KnowledgeSource[]);
    setStatus("ok");
  }, [agentId, activeTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remover(source: KnowledgeSource) {
    if (!activeTenant) return;
    if (!window.confirm(`Remover “${source.titulo}”? Os trechos indexados também serão apagados.`))
      return;
    const { error: err } = await supabase
      .from("knowledge_sources")
      .delete()
      .eq("id", source.id)
      .eq("tenant_id", activeTenant.id);
    if (err) {
      toast.error(`Não foi possível remover: ${err.message}`);
      return;
    }
    toast.success("Documento removido.");
    setSources((list) => list.filter((s) => s.id !== source.id));
  }

  return (
    <section className="card kb">
      <header className="kb__head">
        <div>
          <h3 className="kb__title">Base de conhecimento</h3>
          <p className="field__hint">
            Documentos que o agente consulta para responder (RAG).
          </p>
        </div>
        {!readOnly && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
            icon={<span aria-hidden>＋</span>}
          >
            Adicionar documento
          </Button>
        )}
      </header>

      {status === "loading" && <Spinner label="Carregando documentos…" />}

      {status === "error" && (
        <ErrorState description={error ?? undefined} onRetry={() => void load()} />
      )}

      {status === "ok" && sources.length === 0 && (
        <EmptyState
          icon="📄"
          title="Sem documentos"
          description="Adicione textos ou arquivos para enriquecer as respostas do agente."
        />
      )}

      {status === "ok" && sources.length > 0 && (
        <ul className="kb-list">
          {sources.map((s) => {
            const isProcessing = processing.has(s.id) || s.status === "processando";
            const isError = s.status === "erro";
            return (
              <li className="kb-list__item" key={s.id}>
                <span className="kb-list__icon" aria-hidden>
                  📄
                </span>
                <div className="kb-list__main">
                  <span className="kb-list__title">{s.titulo}</span>
                  <span className="kb-list__meta">
                    {origemLabel(s.origem)} · {formatDate(s.created_at)}
                  </span>
                </div>
                {isProcessing ? (
                  <Badge tone="ember">
                    <span className="kb-pulse" aria-hidden /> Indexando…
                  </Badge>
                ) : isError ? (
                  <Badge tone="danger">Erro</Badge>
                ) : (
                  <Badge tone="ok">Pronto</Badge>
                )}
                {!readOnly && (
                  <button
                    className="kb-list__remove"
                    onClick={() => void remover(s)}
                    aria-label={`Remover ${s.titulo}`}
                    title="Remover"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && activeTenant && (
        <AddDocumentModal
          onClose={() => setAdding(false)}
          onSubmitted={(sourceId) => {
            setAdding(false);
            setProcessing((p) => new Set(p).add(sourceId));
            void load();
          }}
          onIndexed={(sourceId) => {
            setProcessing((p) => {
              const next = new Set(p);
              next.delete(sourceId);
              return next;
            });
            void load();
          }}
          agentId={agentId}
          tenantId={activeTenant.id}
        />
      )}
    </section>
  );
}

function origemLabel(origem: string | null): string {
  switch (origem) {
    case "upload":
      return "Arquivo";
    case "manual":
      return "Texto colado";
    case "url":
      return "URL";
    default:
      return "Documento";
  }
}

/* ------------------------------------------------------------------ */

interface AddProps {
  agentId: string;
  tenantId: string;
  onClose: () => void;
  onSubmitted: (sourceId: string) => void;
  onIndexed: (sourceId: string) => void;
}

function AddDocumentModal({
  agentId,
  tenantId,
  onClose,
  onSubmitted,
  onIndexed,
}: AddProps) {
  const toast = useToast();
  const [mode, setMode] = useState<"upload" | "texto">("texto");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    titulo.trim().length > 0 &&
    (mode === "texto" ? texto.trim().length > 0 : file !== null);

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);

    // 1) Cria a fonte (aparece na lista imediatamente).
    const origem = mode === "upload" ? "upload" : "manual";
    const { data, error } = await supabase
      .from("knowledge_sources")
      .insert({ tenant_id: tenantId, agent_id: agentId, titulo: titulo.trim(), origem })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      toast.error(`Não foi possível criar o documento: ${error?.message ?? ""}`);
      return;
    }
    const sourceId = (data as { id: string }).id;
    onSubmitted(sourceId);

    // 2) Envia o conteúdo para o BACKEND processar (extrair texto + embeddings).
    //    O cliente NÃO gera embeddings. Texto puro vai direto; arquivos vão em base64.
    try {
      const body: Record<string, unknown> = {
        source_id: sourceId,
        agent_id: agentId,
        tenant_id: tenantId,
      };
      if (mode === "texto") {
        body.conteudo = texto;
        body.tipo = "texto";
      } else if (file) {
        body.filename = file.name;
        body.mime = file.type || "application/octet-stream";
        body.tipo = "arquivo";
        body.arquivo_base64 = await fileToBase64(file);
      }

      const { error: fnError } = await supabase.functions.invoke(INDEX_FUNCTION, {
        body,
      });
      if (fnError) throw fnError;
      toast.success("Documento enviado para indexação.");
    } catch (err) {
      // A fonte continua na lista; o backend pode reprocessar. Sinaliza o usuário.
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(
        `Documento salvo, mas a indexação não pôde ser disparada (${msg}).`
      );
    } finally {
      setBusy(false);
      onIndexed(sourceId);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Adicionar documento"
      variant="center"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={busy} disabled={!canSubmit}>
            Enviar para indexação
          </Button>
        </>
      }
    >
      <div className="seg">
        <button
          className={`seg__btn ${mode === "texto" ? "is-active" : ""}`}
          onClick={() => setMode("texto")}
        >
          Colar texto
        </button>
        <button
          className={`seg__btn ${mode === "upload" ? "is-active" : ""}`}
          onClick={() => setMode("upload")}
        >
          Enviar arquivo
        </button>
      </div>

      <div className="modal-form">
        <TextField
          id="doc-titulo"
          label="Título"
          required
          placeholder="Ex.: FAQ de atendimento"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />

        {mode === "texto" ? (
          <div className="field">
            <label className="field__label" htmlFor="doc-texto">
              Conteúdo
            </label>
            <textarea
              id="doc-texto"
              className="input textarea"
              rows={9}
              placeholder="Cole aqui o texto que o agente deve conhecer…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <p className="field__hint">
              {texto.length.toLocaleString("pt-BR")} caracteres · será dividido em
              trechos e indexado no backend.
            </p>
          </div>
        ) : (
          <div className="field">
            <label className="field__label">Arquivo</label>
            <label className="dropzone">
              <input
                type="file"
                accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <span className="dropzone__file">📎 {file.name}</span>
              ) : (
                <span className="dropzone__hint">
                  Clique para escolher um arquivo (.txt, .md, .pdf)
                </span>
              )}
            </label>
            <p className="field__hint">
              O texto é extraído e indexado no backend — nada é processado no
              navegador.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Lê um File como base64 (sem o prefixo data:). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}
