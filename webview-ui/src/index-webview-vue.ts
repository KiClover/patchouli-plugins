import { createApp } from "vue";
import App from "./main-webview.vue";
import TDesign from "tdesign-vue-next";
import "./app.css";
import "./index.scss";
import "tdesign-vue-next/es/style/index.css";

const app = createApp(App);

app.use(TDesign);

app.mount("#app");
