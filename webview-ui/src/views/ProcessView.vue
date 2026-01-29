<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";

import type { API } from "../../../src/api/api";
import { getAppList, type AppItem } from "../api/app";
import { createPresetByUser, updatePresetByUser } from "../api/preset";
import { setSecretKey } from "../api/req";
import { RefreshIcon } from 'tdesign-icons-vue-next';
const props = defineProps<{ api: API; secretReady: boolean }>();

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

type RatioOption = { label: string; value: string };

const PROCESS_STATE_KEY = "uxp-psai.process.state.v1";
type ProcessState = {
  selectedModel?: string;
  selectedPreset?: number | null;
  prompt?: string;
  useCustomRatio?: boolean;
  selectedRatio?: string;
  selectedResolution?: string;
  outputForceOpaque?: boolean;
  parallelCount?: number;
};

const saveUpdate = async () => {
  if (selectedPreset.value == null) {
    MessagePlugin.warning("请先选择预设");
    return;
  }
  if (saving.value) return;
  saving.value = true;
  try {
    await updatePresetByUser({
      id: selectedPreset.value,
      prompt: prompt.value,
    });
    MessagePlugin.success("保存成功");
    await loadPresets();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`保存失败：${msg}`);
  } finally {
    saving.value = false;
  }
};

const openSaveAs = () => {
  const found = selectedPreset.value == null ? null : presetList.value.find((x) => x.id === selectedPreset.value);
  const baseName = found?.name?.trim() || "";
  saveAsForm.value = {
    name: baseName ? `${baseName} - 副本` : "",
    description: found?.description || "",
  };
  saveAsVisible.value = true;
};

const submitSaveAs = async () => {
  if (!saveAsForm.value.name.trim()) {
    MessagePlugin.warning("请输入预设名称");
    return;
  }
  if (saveAsCreating.value) return;
  saveAsCreating.value = true;
  try {
    const res = await createPresetByUser({
      name: saveAsForm.value.name.trim(),
      description: saveAsForm.value.description.trim(),
      prompt: prompt.value,
    });
    MessagePlugin.success("创建成功");
    saveAsVisible.value = false;
    await loadPresets();
    if (typeof (res as any)?.id === "number") {
      selectedPreset.value = (res as any).id;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`创建失败：${msg}`);
  } finally {
    saveAsCreating.value = false;
  }
};

const handleMoreClick = (data: any) => {
  const v = data?.value;
  if (v === "save") saveUpdate();
  if (v === "saveAs") openSaveAs();
};

const modelOptions = [
  { label: "NanoBanana", value: "nano-banana" },
  { label: "NanoBananaFast", value: "nano-banana-fast" },
  { label: "NanoBananaPro", value: "nano-banana-pro" },
  { label:"NanoBananaPro-CL",value: "nano-banana-pro-cl" },
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

const suppressPresetPromptSync = ref(false);

const getCurrentProcessStateSnapshot = (): ProcessState => {
  return {
    selectedModel: selectedModel.value,
    selectedPreset: selectedPreset.value,
    prompt: prompt.value,
    useCustomRatio: useCustomRatio.value,
    selectedRatio: selectedRatio.value,
    selectedResolution: selectedResolution.value,
    outputForceOpaque: outputForceOpaque.value,
    parallelCount: parallelCount.value,
  };
};

const readLegacyProcessState = (): ProcessState | null => {
  try {
    const raw = localStorage.getItem(PROCESS_STATE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj as ProcessState;
  } catch {
    return null;
  }
};

let pendingSaveTimer: any = null;
const scheduleSaveProcessState = () => {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }

  pendingSaveTimer = setTimeout(async () => {
    pendingSaveTimer = null;
    const fn = (props.api as any).setProcessState;
    if (typeof fn !== "function") return;
    try {
      await fn(getCurrentProcessStateSnapshot());
    } catch {
      // ignore
    }
  }, 300);
};

const saving = ref(false);
const saveAsVisible = ref(false);
const saveAsCreating = ref(false);
const saveAsForm = ref<{ name: string; description: string }>({
  name: "",
  description: "",
});

const moreOptions = [
  { content: "保存", value: "save" },
  { content: "另存为", value: "saveAs" },
];

const useCustomRatio = ref(false);
const selectedRatio = ref<string>(ratioOptions[0].value);
const selectedResolution = ref<string>(resolutionOptions[1].value);
const parallelCount = ref<number>(1);

const maxUpload = 5;
const uploadFiles = ref<any[]>([]);

const uploadTips = computed(() => `支持 jpg/png，最多 ${maxUpload} 张（参考图）`);
const info = ref<any>()
const previewUrl = ref<string | null>(null)
const previewObjectUrl = ref<string | null>(null)
const outputForceOpaque = ref(true)
const showSelectionPreview = ref(false)

const isGenerating = ref(false);
const genProgress = ref(0);
const genStatus = ref<string>("");
const genError = ref<string>("");
const genResultUrl = ref<string>("");
const genResultUrls = ref<string[]>([]);

type Settled<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

const runWithConcurrency = async <T>(tasks: Array<() => Promise<T>>, limit: number): Promise<Array<Settled<T>>> => {
  const n = Math.max(1, Math.min(9, Math.floor(limit || 1)));
  const results: Array<Settled<T>> = new Array(tasks.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        const v = await tasks[i]();
        results[i] = { status: "fulfilled", value: v };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  };

  const workers = new Array(Math.min(n, tasks.length)).fill(0).map(() => worker());
  await Promise.all(workers);
  return results;
};

const generateOneGrsai = async (params: {
  providerKey: string;
  body: any;
  index: number;
  progressList: number[];
  onProgress: () => void;
}): Promise<string> => {
  const { providerKey, body, index, progressList, onProgress } = params;
  const res = await fetch("https://grsai.dakka.com.cn/v1/draw/nano-banana", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${providerKey}`,
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
  let resultUrl = "";
  let status = "running";
  let errMsg = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";

    for (const eventText of events) {
      const objs = parseSseDataEvents(eventText);
      for (const obj of objs) {
        if (typeof obj?.progress === "number") {
          progressList[index] = obj.progress;
          onProgress();
        }
        if (typeof obj?.status === "string") status = obj.status;
        const firstUrl = obj?.results?.[0]?.url;
        if (typeof firstUrl === "string") resultUrl = firstUrl;
        const err = obj?.error || obj?.failure_reason;
        if (typeof err === "string" && err) errMsg = err;
      }
    }
  }

  if (buffer.trim()) {
    const objs = parseSseDataEvents(buffer);
    for (const obj of objs) {
      if (typeof obj?.progress === "number") {
        progressList[index] = obj.progress;
        onProgress();
      }
      if (typeof obj?.status === "string") status = obj.status;
      const firstUrl = obj?.results?.[0]?.url;
      if (typeof firstUrl === "string") resultUrl = firstUrl;
      const err = obj?.error || obj?.failure_reason;
      if (typeof err === "string" && err) errMsg = err;
    }
  }

  if (status === "failed") throw new Error(errMsg || "生成失败");
  if (!resultUrl) throw new Error("生成成功但未返回结果 URL");
  progressList[index] = 100;
  onProgress();
  return resultUrl;
};

const loadPresets = async () => {
  try {
    const res = await getAppList();
    presetList.value = res.list || [];
    if (presetList.value.length > 0) {
      if (selectedPreset.value == null) {
        selectedPreset.value = presetList.value[0].id;
      } else {
        const exists = presetList.value.some((x) => x.id === selectedPreset.value);
        if (!exists) selectedPreset.value = presetList.value[0].id;
      }
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
  if (suppressPresetPromptSync.value) return;
  const found = presetList.value.find((x) => x.id === id);
  if (!found) return;
  prompt.value = found.prompt || "";
});

watch(
  [selectedModel, selectedPreset, prompt, useCustomRatio, selectedRatio, selectedResolution, outputForceOpaque, parallelCount],
  () => {
    scheduleSaveProcessState();
  },
  { deep: false },
);

const loadConfig = async () => {
  let apiKey: string | undefined;
  let showPreview = false;
  for (let i = 0; i < 10; i++) {
    try {
      const cfg = await withTimeout(props.api.getGlobalConfig(), 800);
      apiKey = cfg.apiKey || undefined;
      showPreview = !!(cfg as any).showSelectionPreview;
      if (apiKey) break;
    } catch {
    }
    await sleep(200);
  }
  setSecretKey(apiKey);
  showSelectionPreview.value = showPreview;
};

onMounted(async () => {
  await loadConfig();

  const applyState = (restored: ProcessState | null | undefined) => {
    if (!restored) return;
    if (typeof restored.selectedModel === "string" && modelOptions.some((x) => x.value === restored.selectedModel)) {
      selectedModel.value = restored.selectedModel;
    }
    if (typeof restored.useCustomRatio === "boolean") useCustomRatio.value = restored.useCustomRatio;
    if (typeof restored.selectedRatio === "string" && ratioOptions.some((x) => x.value === restored.selectedRatio)) {
      selectedRatio.value = restored.selectedRatio;
    }
    if (
      typeof restored.selectedResolution === "string" &&
      resolutionOptions.some((x) => x.value === restored.selectedResolution)
    ) {
      selectedResolution.value = restored.selectedResolution;
    }
    if (typeof restored.outputForceOpaque === "boolean") outputForceOpaque.value = restored.outputForceOpaque;
    if (typeof restored.parallelCount === "number") {
      const n = Math.max(1, Math.min(9, Math.floor(restored.parallelCount)));
      parallelCount.value = n;
    }
    if (typeof restored.selectedPreset === "number" || restored.selectedPreset === null) {
      selectedPreset.value = restored.selectedPreset as any;
    }
    if (typeof restored.prompt === "string") prompt.value = restored.prompt;
  };

  // 优先从宿主（dataFolder json）读取；若为空则尝试从 legacy localStorage 迁移一次
  let restored: ProcessState | null = null;
  try {
    const fn = (props.api as any).getProcessState;
    if (typeof fn === "function") {
      const s = (await fn()) as ProcessState;
      if (s && typeof s === "object" && Object.keys(s as any).length > 0) restored = s;
    }
  } catch {
  }
  if (!restored) {
    restored = readLegacyProcessState();
    if (restored) {
      try {
        const fn = (props.api as any).setProcessState;
        if (typeof fn === "function") await fn(restored);
      } catch {
      }
    }
  }

  applyState(restored);

  await loadPresets();

  if (restored) {
    const desiredPreset = typeof restored.selectedPreset === "number" ? restored.selectedPreset : null;
    const desiredPrompt = typeof restored.prompt === "string" ? restored.prompt : "";

    if (desiredPreset != null && presetList.value.some((x) => x.id === desiredPreset)) {
      suppressPresetPromptSync.value = true;
      selectedPreset.value = desiredPreset;
      prompt.value = desiredPrompt;
      suppressPresetPromptSync.value = false;
    } else {
      const currentId = selectedPreset.value;
      if (currentId != null) {
        const found = presetList.value.find((x) => x.id === currentId);
        if (found) prompt.value = found.prompt || "";
      }
    }
  }
});

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
};

type GrsUploadTokenZHResponse = {
  data: {
    token: string;
    key: string;
    url: string;
    domain: string;
  };
};

const inferImageExt = (blob: Blob): string => {
  const t = (blob.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  return "png";
};

const uploadBlobToGrsai = async (blob: Blob, providerKey: string): Promise<string> => {
  const ext = inferImageExt(blob);
  const tokenRes = await fetch("https://grsai.dakka.com.cn/client/resource/newUploadTokenZH", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sux: ext }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    throw new Error(`获取上传 Token 失败: ${tokenRes.status} ${tokenRes.statusText}${text ? ` - ${text}` : ""}`);
  }
  const tokenJson = (await tokenRes.json().catch(() => null)) as GrsUploadTokenZHResponse | null;
  const token = (tokenJson as any)?.data?.token;
  const key = (tokenJson as any)?.data?.key;
  const url = (tokenJson as any)?.data?.url;
  const domain = (tokenJson as any)?.data?.domain;
  if (!token || !key || !url || !domain) throw new Error("上传 Token 响应缺少字段");

  const form = new FormData();
  form.append("token", String(token));
  form.append("key", String(key));
  form.append("file", blob, `ref.${ext}`);

  const uploadRes = await fetch(String(url), {
    method: "POST",
    body: form,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(`文件上传失败: ${uploadRes.status} ${uploadRes.statusText}${text ? ` - ${text}` : ""}`);
  }
  return `${String(domain).replace(/\/$/, "")}/${String(key).replace(/^\//, "")}`;
};

const getUploadFileUrlsForGrsai = async (providerKey: string): Promise<string[]> => {
  const urls: string[] = [];
  for (const item of uploadFiles.value || []) {
    const raw: any =
      (item as any)?.raw ||
      (item as any)?.file ||
      (item as any)?.originFileObj ||
      (item as any)?.response?.raw;
    if (!raw) continue;
    if (raw instanceof Blob) {
      urls.push(await uploadBlobToGrsai(raw, providerKey));
    }
  }
  return urls;
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

  const imageData =
    typeof (globalThis as any).ImageData === "function"
      ? new (globalThis as any).ImageData(u8ForPreview, width, height)
      : (() => {
          const anyCtx: any = ctx as any;
          if (typeof anyCtx.createImageData === "function") {
            const img = anyCtx.createImageData(width, height);
            img.data.set(u8ForPreview);
            return img;
          }
          if (typeof anyCtx.getImageData === "function") {
            const img = anyCtx.getImageData(0, 0, width, height);
            img.data.set(u8ForPreview);
            return img;
          }
          throw new Error("Canvas ImageData API not available in this environment");
        })();
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

const handleGenerate = async () => {
  const cfg = await props.api.getGlobalConfig();
  if (!cfg.apiServer) throw new Error("请先在设置里选择模型服务器");

  if (cfg.apiServer === "grsai") {
    const sel = await props.api.getCurrentSelectionPngUrl?.({ forceOpaque: outputForceOpaque.value } as any);
    if (!sel || !(sel as any).url) {
      MessagePlugin.warning("未获取到选区像素：请确认已打开文档并创建选区");
      return;
    }
    previewUrl.value = (sel as any).url;
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  } else {
    const sel = await props.api.getCurrentSelectionRgba?.();
    if (!sel) {
      MessagePlugin.warning("未获取到选区像素：请确认已打开文档并创建选区");
      return;
    }

    const blob = await rgbaToPngBlob(sel as any);
    previewUrl.value = await blobToDataUrl(blob);
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = URL.createObjectURL(blob);
  }

  isGenerating.value = true;
  genProgress.value = 0;
  genStatus.value = "running";
  genError.value = "";
  genResultUrl.value = "";
  genResultUrls.value = [];
  MessagePlugin.info("开始生成...");

  try {
    if (cfg.apiServer !== "grsai") {
      throw new Error("当前仅实现 GrsAI 模型服务器");
    }

    const providerKey = await props.api.getGrsProviderKey?.();
    if (!providerKey) {
      MessagePlugin.error("请先在网站配置模型供应商密钥");
      return;
    }

    const selectionUrl = String(previewUrl.value || "").trim();
    if (!selectionUrl) throw new Error("选区图片 URL 为空");

    const refUrls = await getUploadFileUrlsForGrsai(providerKey);
    const urls = [selectionUrl, ...refUrls];

    const baseBody = {
      model: selectedModel.value,
      prompt: prompt.value,
      aspectRatio: useCustomRatio.value ? selectedRatio.value : "auto",
      imageSize: String(selectedResolution.value).toUpperCase(),
      urls,
      shutProgress: false,
    };

    const n = Math.max(1, Math.min(9, Math.floor(parallelCount.value || 1)));
    const progressList = new Array(n).fill(0);
    const onProgress = () => {
      const sum = progressList.reduce((a, b) => a + b, 0);
      genProgress.value = Math.max(0, Math.min(100, Math.round(sum / n)));
    };

    const tasks = new Array(n).fill(0).map((_, i) => {
      return async () => {
        return await generateOneGrsai({
          providerKey,
          body: { ...baseBody },
          index: i,
          progressList,
          onProgress,
        });
      };
    });

    const settled = await runWithConcurrency(tasks, n);
    const urlsOut = settled
      .filter((x): x is { status: "fulfilled"; value: string } => x.status === "fulfilled")
      .map((x) => x.value);
    const fails = settled.filter((x) => x.status === "rejected");

    if (urlsOut.length === 0) {
      const first = fails[0] as any;
      const msg = first?.reason instanceof Error ? first.reason.message : String(first?.reason || "生成失败");
      throw new Error(msg || "生成失败");
    }

    genResultUrls.value = urlsOut;
    genResultUrl.value = urlsOut[0] || "";
    genStatus.value = "succeeded";
    if (fails.length) {
      MessagePlugin.warning(`部分生成失败：成功 ${urlsOut.length} 张，失败 ${fails.length} 张`);
    } else {
      MessagePlugin.success(`生成完成（${urlsOut.length} 张）`);
    }

    const fn = (props.api as any).placeImageUrlsToPatchouliResGroup;
    if (typeof fn !== "function") {
      throw new Error("当前宿主未实现：将多张结果图写回 patchouli-res 并在组上添加蒙版");
    }
    MessagePlugin.info("正在回写到 patchouli-res 并添加组蒙版...");
    await fn({ urls: urlsOut });
    MessagePlugin.success("已回写到 patchouli-res 并添加组蒙版");
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
        <t-textarea v-model="prompt"  :autosize="{ minRows: 3, maxRows: 5 }"/>
      </t-form-item>
      <t-form-item label="预设操作">
        <t-row class="action-row" :gutter="12">
          <t-col :span="6">
            <t-button theme="primary" block :loading="saving" @click="saveUpdate">保存</t-button>
          </t-col>
          <t-col :span="6">
            <t-button theme="primary" block @click="openSaveAs">另存为</t-button>
          </t-col>
        </t-row>
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

      <t-form-item label="并发数">
        <t-input-number v-model="parallelCount" :min="1" :max="9" />
      </t-form-item>
      <!--
      <t-form-item label="移除透明通道">
        <t-switch v-model="outputForceOpaque" />
      </t-form-item>
      -->
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

      <t-form-item v-if="showSelectionPreview" label="选区预览">
          <t-image class="preview-img" :src="previewUrl" fit="contain" />
      </t-form-item>
    </t-form>

    <t-dialog
      v-model:visible="saveAsVisible"
      header="另存为"
      width="560px"
      :confirm-btn="{ content: '创建', loading: saveAsCreating }"
      @confirm="submitSaveAs"
    >
      <t-form label-width="80px" colon>
        <t-form-item label="名称">
          <t-input v-model="saveAsForm.name" placeholder="请输入预设名称" />
        </t-form-item>
        <t-form-item label="描述">
          <t-input v-model="saveAsForm.description" placeholder="可选" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped lang="scss">
.process-view {
  padding: 12px;
}

.action-row {
  width: 100%;
  flex-wrap: nowrap;
}

.action-row :deep(.t-col) {
  display: flex;
}

.action-row :deep(.t-button) {
  width: 100%;
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
