import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyUiTheme, getUiTheme } from "./lib/uiTheme";

applyUiTheme(getUiTheme());

createRoot(document.getElementById("root")!).render(<App />);
