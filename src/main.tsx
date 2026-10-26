import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { controller } from "./data/controller";
import "./index.css";

controller.init();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
