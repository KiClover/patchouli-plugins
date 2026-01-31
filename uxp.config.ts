import { UXP_Manifest, UXP_Config } from "vite-uxp-plugin";
import { version } from "./package.json";

const extraPrefs = {
  hotReloadPort: 8080,
  webviewUi: true,
  webviewReloadPort: 8082,
  copyZipAssets: ["public-zip/*", "public/webview-ui/**"],
  uniqueIds: true,
};

export const id = "com.kiclover.patchouli";
const name = "帕秋莉-PatchouliPanel";

const manifest: UXP_Manifest = {
  id,
  name,
  version,
  main: "index.html",
  manifestVersion: 5,
  host: [
    {
      app: "PS",
      minVersion: "25.0.0",
    },
              ],
  entrypoints: [
    {
      type: "panel",
      id: `${id}.main`,
      label: {
        default: name,
      },
      minimumSize: { width: 400, height: 650 },
      maximumSize: { width: 2000, height: 850 },
      preferredDockedSize: { width: 230, height: 300 },
      preferredFloatingSize: { width: 450, height: 400 },
      icons: [
        {
          width: 32,
          height: 32,
          path: "icon.png",
          scale: [1, 2],
          theme: ["darkest", "dark", "medium"],
        },
        {
          width: 32,
          height: 32,
          path: "icon.png",
          scale: [1, 2],
          theme: ["lightest", "light"],
        },
      ],
    },


    // * Example of a UXP Secondary panel
    // * Must also enable the <uxp-panel panelid="bolt.uxp.plugin.settings">
    //* tag in your entrypoint (.tsx, .vue, or .svelte) file
    // {
    //   type: "panel",
    //   id: `${id}.settings`,
    //   label: {
    //     default: `${name} Settings`,
    //   },
    //   minimumSize: { width: 230, height: 200 },
    //   maximumSize: { width: 2000, height: 2000 },
    //   preferredDockedSize: { width: 230, height: 300 },
    //   preferredFloatingSize: { width: 230, height: 300 },
    //   icons: [
    //     {
    //       width: 23,
    //       height: 23,
    //       path: "icons/dark-panel.png",
    //       scale: [1, 2],
    //       theme: ["darkest", "dark", "medium"],
    //       species: ["chrome"],
    //     },
    //     {
    //       width: 23,
    //       height: 23,
    //       path: "icons/light-panel.png",
    //       scale: [1, 2],
    //       theme: ["lightest", "light"],
    //       species: ["chrome"],
    //     },
    //   ],
    // },

    // * Example of a UXP Command
    // {
    //   type: "command",
    //   id: "showAbout",
    //   label: {
    //     default: "Bolt UXP Command",
    //   },
    // },

  ],
  featureFlags: {
    enableAlerts: true,
  },
  requiredPermissions: {
    localFileSystem: "fullAccess",
    launchProcess: {
      schemes: ["https", "slack", "file", "ws"],
      extensions: [".xd", ".psd", ".bat", ".cmd", ""],
    },
    network: {
      domains: [
        "all",
        "https://hyperbrew.co",
        "https://github.com",
        "https://vitejs.dev",
        "https://svelte.dev",
        "https://reactjs.org",
        "https://vuejs.org/",
        "https://object.cloud.kiclover.com",
        "https://file4.aitohumanize.com",
        "https://file1.aitohumanize.com",
        "https://file2.aitohumanize.com",
        "https://file3.aitohumanize.com",
        "https://file5.aitohumanize.com",
        "https://*.aitohumanize.com",
        "http://localhost:8892",
        "http://preset.ai.pachouli.kiclover.com",
        "http://library.ai.pachouli.kiclover.com",
        "http://user.system.pachouli.kiclover.com",
        "http://provider.ai.pachouli.kiclover.com",
        "https://grsai.dakka.com.cn",
        "https://*.qiniup.com",

        `ws://localhost:${extraPrefs.hotReloadPort}`, // Required for hot reload
      ],
    },
    clipboard: "readAndWrite",
    webview: {
      allow: "yes",
      allowLocalRendering: "yes",
      domains: "all",
      enableMessageBridge: "localAndRemote",
    },
    ipc: {
      enablePluginCommunication: true,
    },
    allowCodeGenerationFromStrings: true,

  },
    icons: [
    {
      width: 32,
      height: 32,
      path: "icon.png",
      scale: [1, 2],
      theme: ["darkest", "dark", "medium", "lightest", "light", "all"],
      species: ["pluginList"],
    },
  ],
};

export const config: UXP_Config = {
  manifest,
  ...extraPrefs,
};
