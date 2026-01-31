import { createApp } from "vue";
import App from "./main-webview.vue";
import TDesign from "tdesign-vue-next";
import TDesignChat from "@tdesign-vue-next/chat";
import "./app.css";
import "./index.scss";
import "tdesign-vue-next/es/style/index.css";
import "@tdesign-vue-next/chat/es/style/index.css";

const g: any = globalThis as any;
if (g.MessagePort && g.MessagePort.prototype && typeof g.MessagePort.prototype.start !== "function") {
  g.MessagePort.prototype.start = function start() {
  };
}

const app = createApp(App);

app.use(TDesign).use(TDesignChat);

app.mount("#app");
