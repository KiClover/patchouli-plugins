<script setup lang="ts">
import { ref } from "vue";

import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";
const { api, page } = initWebview(webviewAPI);

import ProcessView from "./views/ProcessView.vue";
import CommunityView from "./views/CommunityView.vue";
import SettingsView from "./views/SettingsView.vue";

type TabValue = "process" | "community" | "settings";
const tabValue = ref<TabValue>((page as TabValue) || ("process" as TabValue));
tabValue.value = "process"
document.documentElement.setAttribute('theme-mode', 'dark');
</script>

<template>
  <div class="app-root t-theme-dark">
    <t-tabs v-model:value="tabValue" placement="top" size="medium">
      <t-tab-panel value="process" label="处理">
        <ProcessView :api="api" />
      </t-tab-panel>
      <t-tab-panel value="community" label="预设社区">
        <CommunityView />
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
