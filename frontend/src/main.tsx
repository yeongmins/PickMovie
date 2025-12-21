// main.tsx
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./styles/card-layout.css";
import "./styles/fixed-cards.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
