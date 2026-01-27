<script setup lang="ts">
import { ref } from "vue";

import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";
import { setSecretKey } from "./api/req";
const { api, page } = initWebview(webviewAPI);

const secretReady = ref(false);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let apiKey: string | undefined;
  for (let i = 0; i < 10; i++) {
    const cfg = await api.getGlobalConfig();
    apiKey = cfg.apiKey || undefined;
    if (apiKey) break;
    await sleep(200);
  }
  setSecretKey(apiKey);
  secretReady.value = true;
})();

import ProcessView from "./views/ProcessView.vue";
import CommunityView from "./views/CommunityView.vue";
import PresetView from "./views/PresetView.vue";
import SettingsView from "./views/SettingsView.vue";

type TabValue = "process" | "community" | "preset" | "settings";
const tabValue = ref<TabValue>((page as TabValue) || ("process" as TabValue));
tabValue.value = "process"
document.documentElement.setAttribute('theme-mode', 'dark');
</script>

<template>
  <div class="app-root t-theme-dark">
    <t-tabs v-model:value="tabValue" placement="top" size="medium">
      <t-tab-panel value="process" label="魔导回路">
        <ProcessView :api="api" :secret-ready="secretReady" />
      </t-tab-panel>
      <t-tab-panel value="community" label="大图书馆">
        <CommunityView :api="api" :secret-ready="secretReady" />
      </t-tab-panel>
      <t-tab-panel value="preset" label="魔导书">
        <PresetView :api="api" :secret-ready="secretReady" />
      </t-tab-panel>
      <t-tab-panel value="settings" label="设置">
        <SettingsView :api="api" />
      </t-tab-panel>
    </t-tabs>
  </div>
</template>

<style lang="scss">
@use "./variables.scss" as *;

.app-root {
  width: 100%;
  height: 100%;
  background: var(--uxp-host-background-color);
}
</style>
