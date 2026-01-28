import { createApp } from "vue";
import App from "./main.vue";
import "./app.css";
import "./index.scss";

console.clear(); // Clear logs on each reload

const g: any = globalThis as any;
if (g.MessagePort && g.MessagePort.prototype && typeof g.MessagePort.prototype.start !== "function") {
  g.MessagePort.prototype.start = function start() {
  };
}

createApp(App).mount("#app");
