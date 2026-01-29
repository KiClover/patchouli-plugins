<script setup lang="ts">
import { ref } from "vue";
import { uxp, indesign, photoshop, illustrator, premierepro } from "./globals";
import { api } from "./api/api";

const webviewUI = import.meta.env.VITE_BOLT_WEBVIEW_UI === "true";

import { webviewInitHost } from "./webview-setup-host";
import type { WebviewAPI } from "../webview-ui/src/webview";

let webviewAPI: WebviewAPI;
if (webviewUI) {
  webviewInitHost().then((api) => (webviewAPI = api));
}

let count = ref(0);

const hostName = (uxp.host.name as string).toLowerCase();

//* Call Functions Conditionally by App
if (hostName === "photoshop") {
  console.log("Hello from Photoshop", photoshop);
}

//* Or call the unified API object directly and the correct app function will be used
const simpleAlert = () => {
  api.notify("Hello World");
};

</script>

<template>
  <main v-if="!webviewUI">
    <div class="button-group">
      <button @click="count++">count is {{ count }}</button>
      <button @click="simpleAlert">Alert</button>
      
    </div>
    <div class="stack-colors">
      <div class="stack-colors-a"></div>
      <div class="stack-colors-b"></div>
      <div class="stack-colors-c"></div>
      <div class="stack-colors-d"></div>
      <div class="stack-colors-e"></div>
      <div class="stack-colors-f"></div>
      <div class="stack-colors-g"></div>
      <div class="stack-colors-h"></div>
      <div class="stack-colors-i"></div>
      <div class="stack-colors-j"></div>
    </div>
    <div>
      <p>
        Edit <span class="code">main.vue</span> and save to test HMR updates.
      </p>
    </div>
  </main>

  <!-- Example of a secondary panel entrypoint -->
  <!-- <uxp-panel panelid="bolt.uxp.plugin.settings">
    <h1>Settings Panel</h1>
    <p>count is: {{ count }}</p>
  </uxp-panel> -->
</template>

<style lang="scss">
@use "./variables.scss" as *;
</style>
