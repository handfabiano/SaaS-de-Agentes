// src/pages/AgentEditPage.tsx
// Criação/edição de agente. Valida nome e system prompt. encaminhar_humano
// vem marcada e travada. operador não pode editar (campos desabilitados).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTenant } from "../context/TenantContext";
import { useToast } from "../context/ToastContext";
import type { Agent, AgentInput } from "../lib/database.types";
import {
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOOLS,
  MODELS,
  TEMPLATES,
  TOOLS,
} from "../lib/constants";
import { PageHead } from "../components/layout/PageHead";
import { Button } from "../components/ui/Button";
import { Toggle } from "../components/ui/Toggle";
import { SelectField, TextAreaField, TextField } from "../components/ui/Field";
import { ErrorState, Spinner } from "../components/ui/States";
import { KnowledgeBase } from "../components/knowledge/KnowledgeBase";

interface FormState {
  nome: string;
  template: string;
  modelo: string;
  temperatura: number;
  system_prompt: string;
  ferramentas: string[];
  ativo: boolean;
}

const EMPTY: FormState = {
  nome: "",
  template: "",
  modelo: DEFAULT_MODEL,
  temperatura: DEFAULT_TEMPERATURE,
  system_prompt: "",
  ferramentas: DEFAULT_TOOLS,
  ativo: true,
};

export function AgentEditPage() {
  const { id } = useParams();
  const isNew = !id || id === "novo";
  const navigate = useNavigate();
  const { activeTenant, isAdmin } = useTenant();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ok" | "error">(
    isNew ? "ok" : "loading"
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const readOnly = !isAdmin;

  const load = useCallback(async () => {
    if (isNew || !activeTenant) return;
    setLoadStatus("loading");
    setLoadError(null);
    const { data, error } = await supabase
      .from("agents")
      .select(
        "id, tenant_id, nome, template, system_prompt, modelo, temperatura, ferramentas_ativas, ativo, created_at, updated_at"
      )
      .eq("id", id)
      .eq("tenant_id", activeTenant.id)
      .maybeSingle();

    if (error) {
      setLoadError(error.message);
      setLoadStatus("error");
      return;
    }
    if (!data) {
      setLoadError("Agente não encontrado neste tenant.");
      setLoadStatus("error");
      return;
    }
    const a = data as Agent;
    setForm({
      nome: a.nome,
      template: a.template ?? "",
      modelo: a.modelo,
      temperatura: Number(a.temperatura),
      system_prompt: a.system_prompt,
      // garante a válvula de segurança sempre presente
      ferramentas: Array.from(new Set([...DEFAULT_TOOLS, ...(a.ferramentas_ativas ?? [])])),
      ativo: a.ativo,
    });
    setLoadStatus("ok");
  }, [id, isNew, activeTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  // Validação
  const errors = useMemo(() => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nome.trim()) e.nome = "Informe um nome para o agente.";
    if (!form.system_prompt.trim()) e.system_prompt = "O system prompt é obrigatório.";
    return e;
  }, [form]);

  const valid = Object.keys(errors).length === 0;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleTool(toolId: string, locked: boolean) {
    if (locked) return; // encaminhar_humano não pode ser desmarcada
    setForm((f) => ({
      ...f,
      ferramentas: f.ferramentas.includes(toolId)
        ? f.ferramentas.filter((t) => t !== toolId)
        : [...f.ferramentas, toolId],
    }));
  }

  async function onSave() {
    setTouched(true);
    if (!valid || !activeTenant) return;
    setSaving(true);

    const payload: AgentInput = {
      tenant_id: activeTenant.id,
      nome: form.nome.trim(),
      template: form.template || null,
      system_prompt: form.system_prompt,
      modelo: form.modelo,
      temperatura: form.temperatura,
      // garante encaminhar_humano gravada
      ferramentas_ativas: Array.from(new Set([...DEFAULT_TOOLS, ...form.ferramentas])),
      ativo: form.ativo,
    };

    if (isNew) {
      const { data, error } = await supabase
        .from("agents")
        .insert(payload)
        .select("id")
        .single();
      setSaving(false);
      if (error) {
        toast.error(`Não foi possível salvar: ${error.message}`);
        return;
      }
      toast.success("Agente criado.");
      navigate(`/agentes/${(data as { id: string }).id}`, { replace: true });
    } else {
      const { error } = await supabase
        .from("agents")
        .update(payload)
        .eq("id", id)
        .eq("tenant_id", activeTenant.id);
      setSaving(false);
      if (error) {
        toast.error(`Não foi possível salvar: ${error.message}`);
        return;
      }
      toast.success("Alterações salvas.");
    }
  }

  if (loadStatus === "loading") {
    return (
      <div className="page page--narrow">
        <Spinner label="Carregando agente…" />
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="page page--narrow">
        <ErrorState description={loadError ?? undefined} onRetry={() => void load()} />
        <div className="t-center">
          <Link className="back-link" to="/agentes">
            ← Voltar para a lista
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <Link className="back-link" to="/agentes">
        ← Agentes
      </Link>

      <PageHead
        title={isNew ? "Novo agente" : form.nome || "Editar agente"}
        subtitle={
          readOnly
            ? "Você está como operador — visualização apenas."
            : isNew
            ? "Configure o comportamento do agente."
            : "Edite a configuração do agente."
        }
        actions={
          <div className="page-head__actions">
            <Button variant="ghost" onClick={() => navigate("/agentes")}>
              Cancelar
            </Button>
            <Button
              onClick={onSave}
              loading={saving}
              disabled={readOnly || (touched && !valid)}
              title={readOnly ? "Apenas administradores podem editar" : undefined}
            >
              {isNew ? "Criar agente" : "Salvar"}
            </Button>
          </div>
        }
      />

      <fieldset className="form-fieldset" disabled={readOnly}>
        <div className="card form-card">
          <TextField
            id="nome"
            label="Nome"
            required
            placeholder="Ex.: Atendente do gabinete"
            value={form.nome}
            onChange={(e) => patch("nome", e.target.value)}
            error={touched ? errors.nome : null}
          />

          <div className="grid-2">
            <SelectField
              id="template"
              label="Template"
              hint="Apenas rótulo organizacional."
              value={form.template}
              onChange={(e) => patch("template", e.target.value)}
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="modelo"
              label="Modelo"
              hint={MODELS.find((m) => m.id === form.modelo)?.nota}
              value={form.modelo}
              onChange={(e) => patch("modelo", e.target.value)}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="temp">
              Temperatura
              <span className="slider-value">{form.temperatura.toFixed(1)}</span>
            </label>
            <input
              id="temp"
              className="slider"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={form.temperatura}
              onChange={(e) => patch("temperatura", Number(e.target.value))}
            />
            <p className="field__hint">
              Mais baixo = respostas previsíveis; mais alto = criativas.
            </p>
          </div>

          <TextAreaField
            id="prompt"
            label="System prompt"
            required
            rows={9}
            placeholder="Descreva o papel, o tom e os limites do agente…"
            value={form.system_prompt}
            onChange={(e) => patch("system_prompt", e.target.value)}
            error={touched ? errors.system_prompt : null}
            hint={
              <span className="char-count">
                {form.system_prompt.length.toLocaleString("pt-BR")} caracteres
              </span>
            }
          />

          {/* Ferramentas */}
          <div className="field">
            <label className="field__label">Ferramentas ativas</label>
            <p className="field__hint">
              Selecione o que este agente pode fazer. “Encaminhar para humano” é a
              válvula de segurança e fica sempre ativa.
            </p>
            <div className="tools-grid">
              {TOOLS.map((tool) => {
                const checked = tool.travada || form.ferramentas.includes(tool.id);
                return (
                  <label
                    key={tool.id}
                    className={`tool-item ${checked ? "tool-item--on" : ""} ${
                      tool.travada ? "tool-item--locked" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={tool.travada || readOnly}
                      onChange={() => toggleTool(tool.id, !!tool.travada)}
                    />
                    <span className="tool-item__body">
                      <span className="tool-item__name">
                        {tool.rotulo}
                        {tool.travada && (
                          <span className="tool-item__lock" title="Sempre ativa">
                            🔒
                          </span>
                        )}
                      </span>
                      <span className="tool-item__desc">{tool.descricao}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Ativo */}
          <div className="field-row">
            <div>
              <span className="field__label">Agente ativo</span>
              <p className="field__hint">Quando desligado, o agente não atende.</p>
            </div>
            <Toggle
              checked={form.ativo}
              onChange={(v) => patch("ativo", v)}
              label="Agente ativo"
              disabled={readOnly}
            />
          </div>
        </div>
      </fieldset>

      {/* Base de conhecimento (só faz sentido depois de existir o agente) */}
      {isNew ? (
        <div className="card kb-locked">
          <h3 className="kb__title">Base de conhecimento</h3>
          <p className="field__hint">
            Salve o agente primeiro para anexar documentos à base de conhecimento.
          </p>
        </div>
      ) : (
        <KnowledgeBase agentId={id!} readOnly={readOnly} />
      )}
    </div>
  );
}
