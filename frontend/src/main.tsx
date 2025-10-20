import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Fade out loader smoothly
const loader = document.getElementById("initial-loader");
if (loader) {
  loader.classList.add("fade-out");
  setTimeout(() => loader.remove(), 400);
}

