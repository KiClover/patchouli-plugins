<script setup lang="ts">
import { onMounted, ref } from "vue";
import { MessagePlugin, NotifyPlugin } from "tdesign-vue-next";

import type { API } from "../../../src/api/api";
import { setSecretKey } from "../api/req";
import { installOnScreenDebug, uninstallOnScreenDebug } from "../debug-panel";

const currentVersion = "0.3.2"

const props = defineProps<{ api: API }>();

const apiKey = ref<string>("");
const apiServer = ref<string>("");
const debugPanelEnabled = ref(false);
const showSelectionPreview = ref(false);

const apiServerOptions = [
  { label: "PatchouliProxy", value: "official", disabled: true },
  { label: "GrsAI", value: "grsai" },
];

const checkingUpdate = ref(false);

type VersionInfo = {
  version: string;
  is_must: boolean;
  description: string;
};

const normalizeVersion = (v: string) => (v || "").trim().replace(/^v/i, "");

const parseVersion = (v: string) => {
  const s = normalizeVersion(v);
  const parts = s.split(".").map((x) => Number.parseInt(x, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  return { major, minor, patch };
};

const compareVersion = (a: string, b: string) => {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (av.major !== bv.major) return av.major > bv.major ? 1 : -1;
  if (av.minor !== bv.minor) return av.minor > bv.minor ? 1 : -1;
  if (av.patch !== bv.patch) return av.patch > bv.patch ? 1 : -1;
  return 0;
};

const notifyUpdate = async (info: VersionInfo) => {
  const title = info.is_must ? "发现破坏性更新,请尽快更新" : "发现新版本";
  const body = `最新版本：${info.version}\n${info.description || ""}`.trim();

  NotifyPlugin.info({
    title,
    content: body,
    duration: 0,
    closeBtn: true,
  });
};

const checkUpdate = async () => {
  if (checkingUpdate.value) return;
  checkingUpdate.value = true;
  try {
    const url = "https://object.cloud.kiclover.com/patchouli-version.json";
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`请求失败: ${res.status} ${res.statusText}`);
    const info = (await res.json()) as VersionInfo;
    if (!info || typeof info !== "object") throw new Error("无效的版本信息");
    if (!info.version) throw new Error("版本号为空");

    const cmp = compareVersion(info.version, currentVersion);
    if (cmp <= 0) {
      MessagePlugin.success(`当前已是最新版本（${currentVersion}）`);
      return;
    }

    await notifyUpdate(info);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`检查更新失败：${msg}`);
  } finally {
    checkingUpdate.value = false;
  }
};

const loadConfig = async () => {
  const cfg = await props.api.getGlobalConfig();
  apiKey.value = cfg.apiKey || "";
  apiServer.value = cfg.apiServer || apiServerOptions[1].value;
  debugPanelEnabled.value = !!cfg.debugPanelEnabled;
  showSelectionPreview.value = !!(cfg as any).showSelectionPreview;
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

const commitDebugPanel = async (val: boolean) => {
  debugPanelEnabled.value = !!val;
  await props.api.setDebugPanelEnabled(debugPanelEnabled.value);
  if (debugPanelEnabled.value) installOnScreenDebug("webview");
  else uninstallOnScreenDebug("webview");
};

const commitShowSelectionPreview = async (val: boolean) => {
  showSelectionPreview.value = !!val;
  const fn = (props.api as any).setShowSelectionPreview;
  if (typeof fn !== "function") {
    MessagePlugin.error("当前宿主未实现：setShowSelectionPreview");
    return;
  }
  await fn(showSelectionPreview.value);
};

onMounted(() => {
  loadConfig();
});

const openUrl = async (url: string) => {
  await props.api.openURL(url);
};

const joinGroup = async () => {
  await openUrl("https://jq.qq.com/?_wv=1027&k=930167129");
};
</script>

<template>
  <div class="settings-view">
    <t-form label-width="90px" colon>
      <t-form-item label="后端Token">
        <t-input v-model="apiKey" placeholder="请输入 Key" @blur="saveKey" />
      </t-form-item>
      <t-form-item label="获取Token">
        <t-button theme="primary" @click="openUrl('https://console.patchouli.kiclover.com')">前往</t-button>
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
        <t-input disabled :placeholder="`v${currentVersion}`" />
        <t-button theme="primary" :loading="checkingUpdate" @click="checkUpdate">检查更新</t-button>
      </t-form-item>
      <t-form-item label="群组">
        <t-input readonly placeholder="930167129" />
        <t-button theme="primary" @click="joinGroup">加入群组</t-button>
      </t-form-item>
      <t-form-item label="Debug面板">
        <t-switch :value="debugPanelEnabled" @change="commitDebugPanel" />
      </t-form-item>

      <t-form-item label="选区预览">
        <t-switch :value="showSelectionPreview" @change="commitShowSelectionPreview" />
      </t-form-item>
    </t-form>

    <div class="settings-footer">Copyright @ 2026 <a href="#" @click.prevent="openUrl('https://patchouli.kiclover.com')">PatchouliPanel</a> & <a href="#" @click.prevent="openUrl('https://kiclover.com')">佰分摆</a>. All Rights Reserved</div>
  </div>
</template>

<style scoped lang="scss">
.settings-view {
  padding: 12px;
}

.settings-footer {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  opacity: 0.7;
}
</style>
