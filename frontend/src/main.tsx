import {createRoot} from "react-dom/client";
import App from "./App";
import "./index.css";
import {AllCommunityModule, ModuleRegistry} from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

if (import.meta.env.DEV) {
  import('eruda').then(eruda => eruda.default.init())
}

navigator.serviceWorker?.addEventListener('controllerchange', () => {
  window.location.reload();
});

const root = createRoot(document.getElementById("root")!);
root.render(<App/>);

// Fade out loader smoothly
const loader = document.getElementById("initial-loader");
if (loader) {
    loader.classList.add("fade-out");
    setTimeout(() => loader.remove(), 400);
}