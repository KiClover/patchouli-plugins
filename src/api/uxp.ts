import { uxp } from "../globals";

export const openUXPPanel = async (id: string) => {
  const plugins = Array.from(uxp.pluginManager.plugins);

  const plugin = plugins.find(
    (plugin) => plugin.id === uxp.entrypoints._pluginInfo.id,
  );
  console.log("plugin", plugin, "opening panel: ", id);
  if (plugin) await plugin.showPanel(id);
  else console.error("No plugin found");
};

export const getUXPInfo = async () => {
  const info = {
    version: uxp.versions.uxp as string,
    hostName: uxp.host.name.toLowerCase() as string,
    hostVersion: uxp.host.version as string,
    pluginId: uxp.entrypoints._pluginInfo.id as string,
    pluginVersion: uxp.entrypoints._pluginInfo.version as string,
  };
  return info;
};
export const openURL = async (url: string) => {
  uxp.shell.openExternal(url, "");
};

type GlobalConfig = {
  apiKey?: string;
  apiServer?: string;
  debugPanelEnabled?: boolean;
  showSelectionPreview?: boolean;
};

const CONFIG_FILE_NAME = "virtualai.config.json";

type ProcessState = {
  selectedModel?: string;
  selectedPreset?: number | null;
  prompt?: string;
  useCustomRatio?: boolean;
  selectedRatio?: string;
  selectedResolution?: string;
  outputForceOpaque?: boolean;
  parallelCount?: number;
  hueShiftEnabled?: boolean;
};

const PROCESS_STATE_FILE_NAME = "process.state.json";

type ChatState = {
  selectedModel?: string;
  messages?: any[];
};

const CHAT_STATE_FILE_NAME = "chat.state.json";

const DEFAULT_CONFIG: GlobalConfig = {
  apiServer: "grsai",
  showSelectionPreview: false,
};

const DEFAULT_PROCESS_STATE: ProcessState = {};

const DEFAULT_CHAT_STATE: ChatState = {};

const getConfigFile = async () => {
  const fs = uxp.storage.localFileSystem;
  const folder = await fs.getDataFolder();
  const entries = await folder.getEntries();
  const existing = entries.find((e: { name: string }) => e.name === CONFIG_FILE_NAME);
  if (existing) return existing;
  const file = await folder.createFile(CONFIG_FILE_NAME, { overwrite: true });
  //@ts-ignore
  await file.write(JSON.stringify(DEFAULT_CONFIG, null, 2));
  return file;
};

const getProcessStateFile = async () => {
  const fs = uxp.storage.localFileSystem;
  const folder = await fs.getDataFolder();
  const entries = await folder.getEntries();
  const existing = entries.find((e: { name: string }) => e.name === PROCESS_STATE_FILE_NAME);
  if (existing) return existing;
  const file = await folder.createFile(PROCESS_STATE_FILE_NAME, { overwrite: true });
  //@ts-ignore
  await file.write(JSON.stringify(DEFAULT_PROCESS_STATE, null, 2));
  return file;
};

const getChatStateFile = async () => {
  const fs = uxp.storage.localFileSystem;
  const folder = await fs.getDataFolder();
  const entries = await folder.getEntries();
  const existing = entries.find((e: { name: string }) => e.name === CHAT_STATE_FILE_NAME);
  if (existing) return existing;
  const file = await folder.createFile(CHAT_STATE_FILE_NAME, { overwrite: true });
  //@ts-ignore
  await file.write(JSON.stringify(DEFAULT_CHAT_STATE, null, 2));
  return file;
};

const readConfig = async (): Promise<GlobalConfig> => {
  try {
    const file = await getConfigFile();
    //@ts-ignore
    const content = await file.read();
    if (!content) return {};
    return JSON.parse(content);
  } catch (e) {
    console.error("readConfig failed", e);
    return {};
  }
};

const writeConfig = async (cfg: GlobalConfig) => {
  const file = await getConfigFile();
  //@ts-ignore
  await file.write(JSON.stringify(cfg, null, 2));
};

export const getGlobalConfig = async (): Promise<GlobalConfig> => {
  return await readConfig();
};

export const getProcessState = async (): Promise<ProcessState> => {
  try {
    const file = await getProcessStateFile();
    //@ts-ignore
    const content = await file.read();
    if (!content) return {};
    const obj = JSON.parse(content);
    if (!obj || typeof obj !== "object") return {};
    return obj as ProcessState;
  } catch (e) {
    console.error("getProcessState failed", e);
    return {};
  }
};

export const setProcessState = async (state: ProcessState) => {
  const file = await getProcessStateFile();
  //@ts-ignore
  await file.write(JSON.stringify(state || {}, null, 2));
  return true;
};

export const getChatState = async (): Promise<ChatState> => {
  try {
    const file = await getChatStateFile();
    //@ts-ignore
    const content = await file.read();
    if (!content) return {};
    const obj = JSON.parse(content);
    if (!obj || typeof obj !== "object") return {};
    return obj as ChatState;
  } catch (e) {
    console.error("getChatState failed", e);
    return {};
  }
};

export const setChatState = async (state: ChatState) => {
  const file = await getChatStateFile();
  //@ts-ignore
  await file.write(JSON.stringify(state || {}, null, 2));
  return true;
};

export const clearChatState = async () => {
  const file = await getChatStateFile();
  //@ts-ignore
  await file.write(JSON.stringify(DEFAULT_CHAT_STATE, null, 2));
  return true;
};

const inferImageExtFromName = (name: string): string => {
  const n = String(name || "").toLowerCase();
  if (n.endsWith(".png")) return "png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
  if (n.endsWith(".webp")) return "webp";
  return "png";
};

const mimeFromExt = (ext: string): string => {
  const e = String(ext || "").toLowerCase();
  if (e === "png") return "image/png";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "webp") return "image/webp";
  return "application/octet-stream";
};

const uploadBlobToGrsai = async (blob: Blob, providerKey: string, ext: string, fileName: string): Promise<string> => {
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
  const tokenJson = (await tokenRes.json().catch(() => null)) as any;
  const token = tokenJson?.data?.token;
  const key = tokenJson?.data?.key;
  const url = tokenJson?.data?.url;
  const domain = tokenJson?.data?.domain;
  if (!token || !key || !url || !domain) throw new Error("上传 Token 响应缺少字段");

  const form = new FormData();
  form.append("token", String(token));
  form.append("key", String(key));
  form.append("file", blob, fileName);

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

export const pickAndUploadChatReferenceImages = async (): Promise<{ name: string; url: string }[]> => {
  const providerKey = await getGrsProviderKey();
  const fs = uxp.storage.localFileSystem;
  const picked = (await fs
    .getFileForOpening({
      allowMultiple: true,
      types: ["png", "jpg", "jpeg", "webp"],
    } as any)
    .catch(() => null)) as any;

  const files = Array.isArray(picked) ? picked : picked ? [picked] : [];
  if (files.length === 0) return [];

  const out: { name: string; url: string }[] = [];
  for (const f of files) {
    const name = String(f?.name || "ref.png");
    const ext = inferImageExtFromName(name);
    const mime = mimeFromExt(ext);

    //@ts-ignore
    const bin = await f.read({ format: uxp.storage.formats.binary } as any);
    const bytes = bin instanceof ArrayBuffer ? new Uint8Array(bin) : (bin as Uint8Array);
    const blob = new Blob([bytes], { type: mime });

    const url = await uploadBlobToGrsai(blob, providerKey, ext, name);
    out.push({ name, url });
  }

  return out;
};

type ApiEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

type ProviderKeyInfo = {
  key: string;
};

let cachedGrsProviderKey: string | undefined;
let cachedGrsProviderKeyAt = 0;
let pendingGrsProviderKey: Promise<string> | null = null;

const GRS_PROVIDER_KEY_TTL_MS = 10 * 60 * 1000;

export const getGrsProviderKey = async (forceRefresh?: boolean): Promise<string> => {
  const now = Date.now();
  if (!forceRefresh && cachedGrsProviderKey && now - cachedGrsProviderKeyAt < GRS_PROVIDER_KEY_TTL_MS) {
    return cachedGrsProviderKey;
  }
  if (pendingGrsProviderKey) return pendingGrsProviderKey;

  pendingGrsProviderKey = (async () => {
    const cfg = await readConfig();
    const secretKey = (cfg.apiKey || "").trim();
    if (!secretKey) throw new Error("未设置后端Token");

    const res = await fetch("http://provider.ai.pachouli.kiclover.com/app/grs", {
      method: "GET",
      headers: {
        SecretKey: secretKey,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`获取 Provider Key 失败: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    }
    const payload = (await res.json().catch(() => null)) as ApiEnvelope<ProviderKeyInfo> | null;
    const key = (payload?.data?.key || "").trim();
    if (!key) throw new Error(payload?.msg || "Provider Key 为空");

    cachedGrsProviderKey = key;
    cachedGrsProviderKeyAt = Date.now();
    return key;
  })();

  try {
    return await pendingGrsProviderKey;
  } finally {
    pendingGrsProviderKey = null;
  }
};

export const setApiKey = async (apiKey: string) => {
  const cfg = await readConfig();
  cfg.apiKey = apiKey;
  await writeConfig(cfg);
  return true;
};

export const setApiServer = async (apiServer: string) => {
  const cfg = await readConfig();
  cfg.apiServer = apiServer;
  await writeConfig(cfg);
  return true;
};

export const setDebugPanelEnabled = async (enabled: boolean) => {
  const cfg = await readConfig();
  cfg.debugPanelEnabled = !!enabled;
  await writeConfig(cfg);
  return true;
};

export const setShowSelectionPreview = async (enabled: boolean) => {
  const cfg = await readConfig();
  cfg.showSelectionPreview = !!enabled;
  await writeConfig(cfg);
  return true;
};

export const postServerChanged = async (apiServer: string) => {
  try {
    const res = await fetch(apiServer, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ event: "server_changed" }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error("postServerChanged failed", e);
    return { ok: false, status: 0 };
  }
};

const colorTable = {
  dark: {
    "--uxp-host-background-color": "#535353",
    "--uxp-host-text-color": "#ffffff",
    "--uxp-host-border-color": "#454545",
    "--uxp-host-link-text-color": "#4b9cf5",
    "--uxp-host-widget-hover-background-color": "#5b5b5b",
    "--uxp-host-widget-hover-text-color": "#ffffff",
    "--uxp-host-widget-hover-border-color": "#5b5b5b",
    "--uxp-host-text-color-secondary": "#e5e5e5",
    "--uxp-host-link-hover-text-color": "#ffffff",
    "--uxp-host-label-text-color": "#ffffff",
  },
  darkest: {
    "--uxp-host-background-color": "#323232",
    "--uxp-host-text-color": "#ffffff",
    "--uxp-host-border-color": "#292929",
    "--uxp-host-link-text-color": "#4b9cf5",
    "--uxp-host-widget-hover-background-color": "#3d3d3d",
    "--uxp-host-widget-hover-text-color": "#ffffff",
    "--uxp-host-widget-hover-border-color": "#3d3d3d",
    "--uxp-host-text-color-secondary": "#9b9b9b",
    "--uxp-host-link-hover-text-color": "#ffffff",
    "--uxp-host-label-text-color": "#ffffff",
  },
  light: {
    "--uxp-host-background-color": "#b8b8b8",
    "--uxp-host-text-color": "#424242",
    "--uxp-host-border-color": "#9c9c9c",
    "--uxp-host-link-text-color": "#4b9cf5",
    "--uxp-host-widget-hover-background-color": "#9d9d9d",
    "--uxp-host-widget-hover-text-color": "#424242",
    "--uxp-host-widget-hover-border-color": "#9d9d9d",
    "--uxp-host-text-color-secondary": "#424242",
    "--uxp-host-link-hover-text-color": "#424242",
    "--uxp-host-label-text-color": "#424242",
  },
  lightest: {
    "--uxp-host-background-color": "#f0f0f0",
    "--uxp-host-text-color": "#4b4b4b",
    "--uxp-host-border-color": "#d1d1d1",
    "--uxp-host-link-text-color": "#4b9cf5",
    "--uxp-host-widget-hover-background-color": "#cecece",
    "--uxp-host-widget-hover-text-color": "#4b4b4b",
    "--uxp-host-widget-hover-border-color": "#cecece",
    "--uxp-host-text-color-secondary": "#606060",
    "--uxp-host-link-hover-text-color": "#4b4b4b",
    "--uxp-host-label-text-color": "#4b4b4b",
  },
};

export const getColorScheme = async () => {
  //@ts-ignore
  const theme = document.theme.getCurrent() as
    | "light"
    | "dark"
    | "lightest"
    | "darkest";
  const colors = colorTable[theme];
  return { theme, colors };
};
