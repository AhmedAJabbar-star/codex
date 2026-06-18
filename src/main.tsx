import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyUiTheme, getUiTheme } from "./lib/uiTheme";
import { applyDarkMode, getDarkMode } from "./lib/darkMode";

applyUiTheme(getUiTheme());
applyDarkMode(getDarkMode());

createRoot(document.getElementById("root")!).render(<App />);
