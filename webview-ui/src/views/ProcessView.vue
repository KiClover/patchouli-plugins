<script setup lang="ts">
import axios from "axios";
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
const prompt = ref<string>("");

const useCustomRatio = ref(false);
const selectedRatio = ref<string>(ratioOptions[0].value);
const selectedResolution = ref<string>(resolutionOptions[1].value);

const maxUpload = 5;
const uploadFiles = ref<any[]>([]);

const uploadTips = computed(() => `支持 jpg/png，最多 ${maxUpload} 张（参考图）`);
const info = ref<any>()
const previewUrl = ref<string | null>(null)
const previewObjectUrl = ref<string | null>(null)
const outputForceOpaque = ref(true)


const blobToDataUrl = async (blob: Blob): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
};

const rgbaToPngBlob = async (params: {
  rgba: ArrayBuffer | number[];
  width: number;
  height: number;
}) => {
  const { rgba, width, height } = params;
  const expectedLen = width * height * 4;
  const u8 = Array.isArray(rgba)
    ? new Uint8ClampedArray(rgba)
    : new Uint8ClampedArray(rgba);

  console.log("rgba size:", { width, height, expectedLen, gotLen: u8.length });
  if (u8.length === 0) throw new Error("RGBA buffer is empty (0 length)");
  if (u8.length !== expectedLen) {
    throw new Error(`RGBA length mismatch: expected ${expectedLen}, got ${u8.length}`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");

  const u8ForPreview = outputForceOpaque.value
    ? (() => {
        const copy = new Uint8ClampedArray(u8);
        for (let i = 3; i < copy.length; i += 4) copy[i] = 255;
        return copy;
      })()
    : u8;

  const imageData = new ImageData(u8ForPreview, width, height);
  ctx.putImageData(imageData, 0, 0);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error("canvas.toBlob returned null"));
      else resolve(b);
    }, "image/png");
  });
  console.log("png blob:", blob);
  return blob;
};

const uploadPng = async (params: {
  uploadUrl: string;
  apiKey: string;
  apiKeyHeaderName?: string;
  fileFieldName?: string;
  blob: Blob;
}) => {
  const apiKeyHeaderName = params.apiKeyHeaderName || "apikey";
  const fileFieldName = params.fileFieldName || "file";

  const form = new FormData();
  form.append(fileFieldName, params.blob, "selection.png");

  const res = await axios.post(params.uploadUrl, form, {
    headers: {
      [apiKeyHeaderName]: params.apiKey,
    },
  });

  const data = res.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    if (typeof (data as any).url === "string") return (data as any).url;
    if (typeof (data as any).data?.url === "string") return (data as any).data.url;
    if (typeof (data as any).result?.url === "string") return (data as any).result.url;
  }
  throw new Error("Upload succeeded but no url field found in response");
};

const handleGenerate = async () => {
  const cfg = await props.api.getGlobalConfig();
  if (!cfg.apiServer) throw new Error("请先在设置里配置 API 服务器（上传 URL）");
  if (!cfg.apiKey) throw new Error("请先在设置里配置 Key（apikey header）");

  const sel = await props.api.getCurrentSelectionRgba?.();
  if (!sel) return;

  const blob = await rgbaToPngBlob(sel as any);

  previewUrl.value = await blobToDataUrl(blob);

  if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  previewObjectUrl.value = URL.createObjectURL(blob);

  console.log("preview dataUrl prefix:", previewUrl.value?.slice(0, 32));
  console.log("preview dataUrl length:", previewUrl.value?.length);
  console.log("preview objectUrl:", previewObjectUrl.value);

  try {
    info.value = await uploadPng({
      uploadUrl: cfg.apiServer,
      apiKey: cfg.apiKey,
      blob,
    });
    console.log("uploaded url:", info.value);
  } catch (e) {
    console.error("upload failed", e);
  }
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

      <t-form-item label="提示词">
        <t-input v-model="prompt" />
        <t-dropdown>
          <t-button theme="primary">保存</t-button>
          <t-dropdown-item>保存</t-dropdown-item>
        </t-dropdown>
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

      <t-form-item label="自定义横纵比">
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

      <t-form-item label="移除透明通道">
        <t-switch v-model="outputForceOpaque" />
      </t-form-item>

      <t-form-item v-if="previewUrl" label="选区预览">
        <div class="preview-block">
          <img
            class="preview-img"
            :key="previewUrl"
            :src="previewUrl"
          />
          <div class="preview-debug">
            dataUrl: {{ previewUrl?.slice(0, 32) }}... (len={{ previewUrl?.length }})
          </div>
          <img
            v-if="previewObjectUrl"
            class="preview-img"
            :key="previewObjectUrl"
            :src="previewObjectUrl"
          />
          <div v-if="previewObjectUrl" class="preview-debug">
            objectUrl: {{ previewObjectUrl }}
          </div>
        </div>
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

.preview-img {
  width: 100%;
  max-height: 240px;
  display: block;
  object-fit: contain;
  border-radius: 6px;
}

.preview-block {
  padding: 8px;
  border-radius: 6px;
  background-color: #fff;
  background-image:
    linear-gradient(45deg, rgba(0, 0, 0, 0.12) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(0, 0, 0, 0.12) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(0, 0, 0, 0.12) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(0, 0, 0, 0.12) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
}

.preview-debug {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.75;
  word-break: break-all;
}
</style>
