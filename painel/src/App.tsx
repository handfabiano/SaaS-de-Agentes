// src/App.tsx
// Roteamento + guardas de autenticação e de tenant.

import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useTenant } from "./context/TenantContext";
import { Shell } from "./components/layout/Shell";
import { LoginPage } from "./pages/LoginPage";
import { AgentsListPage } from "./pages/AgentsListPage";
import { AgentEditPage } from "./pages/AgentEditPage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { UsagePage } from "./pages/UsagePage";
import { EmptyState, ErrorState, Spinner } from "./components/ui/States";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="boot">
        <Spinner label="Carregando…" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <AuthedApp />;
}

function AuthedApp() {
  const { loading, error, tenants, activeTenant, reload } = useTenant();

  if (loading) {
    return (
      <div className="boot">
        <Spinner label="Carregando seus tenants…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="boot">
        <ErrorState
          title="Não foi possível carregar seus dados"
          description={error}
          onRetry={reload}
        />
      </div>
    );
  }

  if (tenants.length === 0 || !activeTenant) {
    return (
      <div className="boot">
        <EmptyState
          title="Nenhum tenant associado"
          description="Sua conta ainda não está vinculada a nenhum tenant. Fale com um administrador."
        />
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/agentes" replace />} />
        <Route path="/agentes" element={<AgentsListPage />} />
        <Route path="/agentes/novo" element={<AgentEditPage />} />
        <Route path="/agentes/:id" element={<AgentEditPage />} />
        <Route path="/conversas" element={<ConversationsPage />} />
        <Route path="/uso" element={<UsagePage />} />
        <Route path="*" element={<Navigate to="/agentes" replace />} />
      </Route>
    </Routes>
  );
}
