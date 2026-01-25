<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { API } from "../../../src/api/api";
import { setSecretKey } from "../api/req";

const props = defineProps<{ api: API }>();

const apiKey = ref<string>("");
const apiServer = ref<string>("");

const apiServerOptions = [
  { label: "PatchouliProxy", value: "official", disabled: true },
  { label: "GrsAI", value: "grsai" },
];

const loadConfig = async () => {
  const cfg = await props.api.getGlobalConfig();
  apiKey.value = cfg.apiKey || "";
  apiServer.value = cfg.apiServer || apiServerOptions[0].value;
  setSecretKey(apiKey.value || undefined);
};

const saveKey = async () => {
  await props.api.setApiKey(apiKey.value);
  setSecretKey(apiKey.value || undefined);
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
      <t-form-item label="后端Token">
        <t-input v-model="apiKey" placeholder="请输入 Key" @blur="saveKey" />
      </t-form-item>

      <t-form-item label="模型服务器">
        <t-select
          v-model="apiServer"
          :options="apiServerOptions"
          placeholder="选择服务器"
          @change="commitServer"
          @blur="commitServer"
        />
      </t-form-item>

      <t-form-item label="版本检查">
        <t-input disabled placeholder="v1.0.0" />
        <t-button theme="primary">检查更新</t-button>
      </t-form-item>
      <t-form-item label="PowerBy">
        <t-input disabled placeholder="佰分摆/KiClover" />
      </t-form-item>
    </t-form>
  </div>
</template>

<style scoped lang="scss">
.settings-view {
  padding: 12px;
}
</style>
