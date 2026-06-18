import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyUiTheme, getUiTheme } from "./lib/uiTheme";
import { applyDarkMode, getDarkMode } from "./lib/darkMode";
import { apply3DEnabled, get3DEnabled } from "./lib/threeD";

applyUiTheme(getUiTheme());
applyDarkMode(getDarkMode());
apply3DEnabled(get3DEnabled());

createRoot(document.getElementById("root")!).render(<App />);
