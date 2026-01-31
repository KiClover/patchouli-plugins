<script setup lang="ts">
import { ref } from "vue";

import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";
import { setSecretKey } from "./api/req";
import { installOnScreenDebug } from "./debug-panel";
const { api, page } = initWebview(webviewAPI);

const secretReady = ref(false);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
  return await Promise.race([
    p,
    (async () => {
      await sleep(ms);
      throw new Error("getGlobalConfig timeout");
    })(),
  ]);
};

(async () => {
  let apiKey: string | undefined;
  for (let i = 0; i < 10; i++) {
    try {
      const cfg = await withTimeout(api.getGlobalConfig(), 800);
      apiKey = cfg.apiKey || undefined;
      if (cfg.debugPanelEnabled) installOnScreenDebug("webview");
      setSecretKey(apiKey);
      secretReady.value = true;
      break;
    } catch {
      await sleep(200);
    }
  }
  if (!secretReady.value) {
    setSecretKey(apiKey);
    secretReady.value = true;
  }
})();

import ProcessView from "./views/ProcessView.vue";
import ChatView from "./views/ChatView.vue";
import CommunityView from "./views/CommunityView.vue";
import PresetView from "./views/PresetView.vue";
import SettingsView from "./views/SettingsView.vue";

type TabValue = "process" | "chat" | "community" | "preset" | "settings";
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
      <t-tab-panel value="chat" label="Chat">
        <ChatView :api="api" :secret-ready="secretReady" />
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

.app-root :deep(.t-tabs) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.app-root :deep(.t-tabs__content) {
  flex: 1;
  min-height: 0;
}

.app-root :deep(.t-tabs__content-inner) {
  height: 100%;
}

.app-root :deep(.t-tab-panel) {
  height: 100%;
}
</style>
