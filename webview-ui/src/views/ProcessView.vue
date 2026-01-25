<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";

import type { API } from "../../../src/api/api";
import { getAppList, type AppItem } from "../api/app";
import { setSecretKey } from "../api/req";
import { RefreshIcon } from 'tdesign-icons-vue-next';
const props = defineProps<{ api: API; secretReady: boolean }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RatioOption = { label: string; value: string };

const modelOptions = [
  { label: "NanoBanana", value: "nano-banana" },
  { label: "NanoBananaFast", value: "nano-banana-fast" },
  { label: "NanoBananaPro", value: "nano-banana-pro" },
  { label: "NanoBananaPro-VT", value: "nano-banana-pro-vt" },
  { label: "NanoBananaPro-VIP", value: "nano-banana-pro-vip" },
  { label: "NanoBananaPro-4K-VIP", value: "nano-banana-pro-4k-vip" },
];

type PresetOption = { label: string; value: number };

const presetList = ref<AppItem[]>([]);
const presetOptions = computed<PresetOption[]>(() =>
  presetList.value.map((item) => ({ label: item.name, value: item.id })),
);

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
const selectedPreset = ref<number | null>(null);
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

const isGenerating = ref(false);
const genProgress = ref(0);
const genStatus = ref<string>("");
const genError = ref<string>("");
const genResultUrl = ref<string>("");

const loadPresets = async () => {
  try {
    const res = await getAppList();
    presetList.value = res.list || [];
    if (selectedPreset.value == null && presetList.value.length > 0) {
      selectedPreset.value = presetList.value[0].id;
    }
    MessagePlugin.success("预设加载成功");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`预设加载失败：${msg}`);
    throw e;
  }
};

watch(selectedPreset, (id) => {
  if (id == null) return;
  const found = presetList.value.find((x) => x.id === id);
  if (!found) return;
  prompt.value = found.prompt || "";
});

const loadConfig = async () => {
  let apiKey: string | undefined;
  for (let i = 0; i < 10; i++) {
    const cfg = await props.api.getGlobalConfig();
    apiKey = cfg.apiKey || undefined;
    if (apiKey) break;
    await sleep(200);
  }
  setSecretKey(apiKey);
};

onMounted(async () => {
  await loadConfig();
  await loadPresets();
});

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
};

const getUploadFileDataUrls = async (): Promise<string[]> => {
  const urls: string[] = [];
  for (const item of uploadFiles.value || []) {
    const raw: any =
      (item as any)?.raw ||
      (item as any)?.file ||
      (item as any)?.originFileObj ||
      (item as any)?.response?.raw;
    if (!raw) continue;
    if (raw instanceof Blob) {
      urls.push(await blobToDataUrl(raw));
    }
  }
  return urls;
};

const parseJsonLinesFromText = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const objs: any[] = [];
  for (const line of lines) {
    try {
      objs.push(JSON.parse(line));
    } catch {
      // ignore
    }
  }
  return objs;
};

const parseSseDataEvents = (eventText: string): any[] => {
  const lines = eventText.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:")) {
      dataLines.push(trimmed.slice("data:".length).trimStart());
    }
  }

  const data = dataLines.join("\n").trim();
  if (!data || data === "[DONE]") return [];

  try {
    return [JSON.parse(data)];
  } catch {
    return [];
  }
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
  if (!cfg.apiServer) throw new Error("请先在设置里选择模型服务器");

  const sel = await props.api.getCurrentSelectionRgba?.();
  if (!sel) return;

  const blob = await rgbaToPngBlob(sel as any);

  previewUrl.value = await blobToDataUrl(blob);

  if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  previewObjectUrl.value = URL.createObjectURL(blob);

  console.log("preview dataUrl prefix:", previewUrl.value?.slice(0, 32));
  console.log("preview dataUrl length:", previewUrl.value?.length);
  console.log("preview objectUrl:", previewObjectUrl.value);

  isGenerating.value = true;
  genProgress.value = 0;
  genStatus.value = "running";
  genError.value = "";
  genResultUrl.value = "";
  MessagePlugin.info("开始生成...");

  try {
    if (cfg.apiServer !== "grsai") {
      throw new Error("当前仅实现 GrsAI 模型服务器");
    }

    const refUrls = await getUploadFileDataUrls();
    const selectionDataUrl = await blobToDataUrl(blob);
    const urls = [selectionDataUrl, ...refUrls];

    const body = {
      model: selectedModel.value,
      prompt: prompt.value,
      aspectRatio: useCustomRatio.value ? selectedRatio.value : "auto",
      imageSize: String(selectedResolution.value).toUpperCase(),
      urls,
      shutProgress: false,
    };

    const res = await fetch("https://grsai.dakka.com.cn/v1/draw/nano-banana", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-6fdefed1b3af4140ad91ffa8f76463e6",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`请求失败: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    }
    if (!res.body) throw new Error("响应不支持 stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";

      for (const eventText of events) {
        const objs = parseSseDataEvents(eventText);
        for (const obj of objs) {
          if (typeof obj?.progress === "number") genProgress.value = obj.progress;
          if (typeof obj?.status === "string") genStatus.value = obj.status;
          const firstUrl = obj?.results?.[0]?.url;
          if (typeof firstUrl === "string") genResultUrl.value = firstUrl;
          const err = obj?.error || obj?.failure_reason;
          if (typeof err === "string" && err) genError.value = err;
        }
      }
    }

    if (buffer.trim()) {
      const objs = parseSseDataEvents(buffer);
      for (const obj of objs) {
        if (typeof obj?.progress === "number") genProgress.value = obj.progress;
        if (typeof obj?.status === "string") genStatus.value = obj.status;
        const firstUrl = obj?.results?.[0]?.url;
        if (typeof firstUrl === "string") genResultUrl.value = firstUrl;
        const err = obj?.error || obj?.failure_reason;
        if (typeof err === "string" && err) genError.value = err;
      }
    }

    if (genStatus.value === "failed") {
      throw new Error(genError.value || "生成失败");
    }

    if (genStatus.value === "succeeded") {
      MessagePlugin.success("生成完成");

      if (genResultUrl.value) {
        const fn = (props.api as any).placeImageUrlToSelectionAndMask;
        console.log("placeImageUrlToSelectionAndMask typeof:", typeof fn);
        if (typeof fn !== "function") {
          throw new Error("当前宿主未实现：将结果图写回选区并添加蒙版");
        }
        MessagePlugin.info("正在回写到选区并添加蒙版...");
        await fn({
          url: genResultUrl.value,
          fileName: "patchouli-res.png",
        });
        MessagePlugin.success("已回写到选区并添加蒙版");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(msg || "生成失败");
    throw e;
  } finally {
    isGenerating.value = false;
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
        <t-button theme="primary" @click="loadPresets"><template #icon><RefreshIcon /></template></t-button>
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
            v-model:files="uploadFiles"
            accept=".jpg,.jpeg,.png"
            :max="maxUpload"
            theme="image"
            :auto-upload="false"
            multiple
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

      <t-form-item label="移除透明通道">
        <t-switch v-model="outputForceOpaque" />
      </t-form-item>

      <t-form-item>
        <div class="gen-area">
          <t-button theme="primary" block :loading="isGenerating" @click="handleGenerate">生成</t-button>
          <div class="gen-area-progress">
            <t-progress :percentage="genProgress" />
            <!--<div v-if="genStatus" class="gen-progress-meta">
              <div>状态：{{ genStatus }}</div>
              <div v-if="genError" class="gen-progress-error">错误：{{ genError }}</div>
              <div v-if="genResultUrl">结果：{{ genResultUrl }}</div>
            </div>!-->
          </div>
        </div>
      </t-form-item>

      <!--<t-form-item v-if="previewUrl" label="选区预览">
          <img
            class="preview-img"
            :key="previewUrl"
            :src="previewUrl"
          />
      </t-form-item>
      !-->
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

.gen-area {
  width: 100%;
}

.gen-area-progress {
  margin-top: 12px;
  width: 100%;
}

.gen-area-progress :deep(.t-progress) {
  width: 100%;
}

.gen-progress-meta {
  margin-top: 8px;
  font-size: 12px;
}

.gen-progress-error {
  color: #d54941;
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
