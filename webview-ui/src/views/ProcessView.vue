<script setup lang="ts">
import { computed, ref } from "vue";

import type { API } from "../../../src/api/api";

const props = defineProps<{ api: API }>();

type RatioOption = { label: string; value: string };

const modelOptions = [
  { label: "Nanobanana_Pro", value: "model-a" },
  { label: "模型 B", value: "model-b" },
];

const presetOptions = [
  { label: "预设 1", value: "preset-1" },
  { label: "预设 2", value: "preset-2" },
];

const ratioOptions: RatioOption[] = [
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "2:3", value: "2:3" },
  { label: "3:2", value: "3:2" },
];

const resolutionOptions = [
  { label: "1K", value: "1k" },
  { label: "2K", value: "2k" },
  { label: "4K", value: "4k" },
];

const selectedModel = ref<string>(modelOptions[0].value);
const selectedPreset = ref<string>(presetOptions[0].value);

const useCustomRatio = ref(false);
const selectedRatio = ref<string>(ratioOptions[0].value);
const selectedResolution = ref<string>(resolutionOptions[1].value);

const maxUpload = 5;
const uploadFiles = ref<any[]>([]);

const uploadTips = computed(() => `支持 jpg/png，最多 ${maxUpload} 张（参考图）`);
const info = ref<any>()
const handleGenerate = async () => {
  const cfg = await props.api.getGlobalConfig();
  if (!cfg.apiServer) throw new Error("请先在设置里配置 API 服务器（上传 URL）");
  if (!cfg.apiKey) throw new Error("请先在设置里配置 Key（apikey header）");
  info.value = await props.api.uploadCurrentSelectionImage?.({
    uploadUrl: cfg.apiServer,
    apiKey: cfg.apiKey,
  });
  console.log("uploaded url:", info.value);
};
</script>

<template>
  <div class="process-view">
    <t-form label-width="110px" colon>
      <t-form-item label="模型选择">
        <t-select v-model="selectedModel" :options="modelOptions" />
      </t-form-item>

      <t-form-item label="预设">
        <t-select v-model="selectedPreset" :options="presetOptions" />
      </t-form-item>

      <t-form-item label="参考图上传">
        <div class="upload-block">
          <t-upload
            v-model="uploadFiles"
            accept=".jpg,.jpeg,.png"
            :max="maxUpload"
            theme="image"
            :tips="uploadTips"
          />
        </div>
      </t-form-item>

      <t-form-item label="是否使用自定义横纵比">
        <t-switch v-model="useCustomRatio" />
      </t-form-item>

      <t-form-item label="横纵比">
        <t-select
          v-model="selectedRatio"
          :options="ratioOptions"
          :disabled="!useCustomRatio"
        />
      </t-form-item>

      <t-form-item label="分辨率">
        <t-select v-model="selectedResolution" :options="resolutionOptions" />
      </t-form-item>

      <t-form-item>
        <t-button theme="primary" block @click="handleGenerate">生成</t-button>
      </t-form-item>
    </t-form>
  </div>
</template>

<style scoped lang="scss">
.process-view {
  padding: 12px;
}

.upload-block {
  width: 100%;
}
</style>
