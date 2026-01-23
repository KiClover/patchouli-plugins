<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { API } from "../../../src/api/api";

const props = defineProps<{ api: API }>();

const apiKey = ref<string>("");
const apiServer = ref<string>("");

const apiServerOptions = [
  { label: "官方服务器", value: "https://api.example.com" },
  { label: "自定义服务器", value: "https://api.yourdomain.com" },
];

const loadConfig = async () => {
  const cfg = await props.api.getGlobalConfig();
  apiKey.value = cfg.apiKey || "";
  apiServer.value = cfg.apiServer || apiServerOptions[0].value;
};

const saveKey = async () => {
  await props.api.setApiKey(apiKey.value);
};

const commitServer = async () => {
  await props.api.setApiServer(apiServer.value);
  await props.api.postServerChanged(apiServer.value);
};

onMounted(() => {
  loadConfig();
});
</script>

<template>
  <div class="settings-view">
    <t-form label-width="90px" colon>
      <t-form-item label="Key">
        <t-input v-model="apiKey" placeholder="请输入 Key" @blur="saveKey" />
      </t-form-item>

      <t-form-item label="API 服务器">
        <t-select
          v-model="apiServer"
          :options="apiServerOptions"
          placeholder="选择服务器"
          @change="commitServer"
          @blur="commitServer"
        />
      </t-form-item>
    </t-form>
  </div>
</template>

<style scoped lang="scss">
.settings-view {
  padding: 12px;
}
</style>
