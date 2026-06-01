// src/pages/LoginPage.tsx
// Login via Supabase Auth (e-mail + senha). Mostra aviso se as variáveis de
// ambiente não estiverem configuradas.

import { useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/Field";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    if (err) setError(traduzErro(err.message));
    setLoading(false);
  }

  return (
    <div className="auth">
      <div className="auth__panel card">
        <div className="auth__brand">
          <span className="auth__logo" aria-hidden>
            ◍
          </span>
          <span>Painel de Agentes</span>
        </div>
        <h1 className="auth__title">Entrar</h1>
        <p className="auth__sub">
          Acesse com sua conta para administrar os agentes do seu tenant.
        </p>

        {!supabaseConfigured && (
          <div className="auth__warn">
            Supabase não configurado. Copie <code>.env.example</code> para{" "}
            <code>.env</code> e preencha <code>VITE_SUPABASE_URL</code> e{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}

        <form className="auth__form" onSubmit={onSubmit}>
          <TextField
            id="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            id="senha"
            label="Senha"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          {error && <p className="auth__error">{error}</p>}
          <Button type="submit" loading={loading} className="auth__submit">
            Entrar
          </Button>
        </form>
      </div>
      <p className="auth__foot">
        Isolamento por tenant garantido por RLS · sem chamadas de IA no front.
      </p>
    </div>
  );
}

function traduzErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha inválidos.";
  if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar.";
  return msg;
}
