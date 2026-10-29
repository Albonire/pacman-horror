import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/special-elite/latin-400.css";
import "@fontsource/im-fell-english-sc/latin-400.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
