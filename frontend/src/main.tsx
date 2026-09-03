import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

// Ponto de entrada da aplicação: pega a <div id="app"> do index.html e
// renderiza o componente raiz (App) dentro dela.
createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
