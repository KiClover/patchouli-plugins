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

const app = createApp(App);

app.use(TDesign);

app.mount("#app");
