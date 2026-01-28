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
};

const CONFIG_FILE_NAME = "virtualai.config.json";

const DEFAULT_CONFIG: GlobalConfig = {
  apiServer: "grsai",
};

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
