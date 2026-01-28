import { createApp } from "vue";
import App from "./main-webview.vue";
import TDesign from "tdesign-vue-next";
import "./app.css";
import "./index.scss";
import "tdesign-vue-next/es/style/index.css";

const g: any = globalThis as any;
if (g.MessagePort && g.MessagePort.prototype && typeof g.MessagePort.prototype.start !== "function") {
  g.MessagePort.prototype.start = function start() {
  };
}

const installOnScreenDebug = (label: string) => {
  const doc = document;
  const root = doc.createElement("div");
  root.id = `__uxp_debug__${label}`;
  root.style.cssText =
    "position:fixed;left:8px;right:8px;bottom:8px;z-index:999999;font-family:monospace;font-size:11px;line-height:1.35;";

  const header = doc.createElement("div");
  header.style.cssText =
    "display:flex;gap:8px;align-items:center;padding:6px 8px;background:rgba(0,0,0,0.75);color:#fff;border-radius:6px;";

  const title = doc.createElement("div");
  title.textContent = `Debug(${label})`;
  title.style.cssText = "font-weight:600;flex:1;user-select:none;";

  const btnToggle = doc.createElement("button");
  btnToggle.textContent = "hide";
  btnToggle.style.cssText =
    "background:#333;color:#fff;border:1px solid #666;border-radius:4px;padding:2px 6px;";

  const btnClear = doc.createElement("button");
  btnClear.textContent = "clear";
  btnClear.style.cssText =
    "background:#333;color:#fff;border:1px solid #666;border-radius:4px;padding:2px 6px;";

  const body = doc.createElement("div");
  body.style.cssText =
    "margin-top:6px;max-height:35vh;overflow:auto;padding:6px 8px;background:rgba(0,0,0,0.6);color:#d7d7d7;border-radius:6px;white-space:pre-wrap;word-break:break-word;";

  const appendLine = (kind: string, args: any[]) => {
    try {
      const line = doc.createElement("div");
      const ts = new Date().toISOString().slice(11, 19);
      const text = args
        .map((a) => {
          if (a instanceof Error) {
            const msg = a.message || String(a);
            const st = typeof a.stack === "string" ? a.stack : "";
            return st ? `${msg}\n${st}` : msg;
          }
          if (typeof a === "string") return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" ");
      line.textContent = `[${ts}] ${kind}: ${text}`;
      body.appendChild(line);
      body.scrollTop = body.scrollHeight;
    } catch {
    }
  };

  btnToggle.onclick = () => {
    const hidden = body.style.display === "none";
    body.style.display = hidden ? "block" : "none";
    btnToggle.textContent = hidden ? "hide" : "show";
  };

  btnClear.onclick = () => {
    body.textContent = "";
  };

  header.appendChild(title);
  header.appendChild(btnClear);
  header.appendChild(btnToggle);
  root.appendChild(header);
  root.appendChild(body);
  doc.body.appendChild(root);

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: any[]) => {
    appendLine("log", args);
    origLog(...args);
  };
  console.warn = (...args: any[]) => {
    appendLine("warn", args);
    origWarn(...args);
  };
  console.error = (...args: any[]) => {
    appendLine("error", args);
    origError(...args);
  };

  window.addEventListener("error", (e: any) => {
    appendLine("window.error", [e?.message, e?.filename, e?.lineno, e?.colno]);
  });
  window.addEventListener("unhandledrejection", (e: any) => {
    appendLine("unhandledrejection", [e?.reason]);
  });
};

if ((import.meta as any).env?.MODE !== "development") {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => installOnScreenDebug("webview"));
  } else {
    installOnScreenDebug("webview");
  }
}

const app = createApp(App);

app.use(TDesign);

app.mount("#app");
