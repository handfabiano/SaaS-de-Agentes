// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { TenantProvider } from "./context/TenantContext";
import { ToastProvider } from "./context/ToastContext";

import "./index.css";
import "./styles/components.css";
import "./styles/layout.css";
import "./styles/pages.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
