# PatchouliPanel（帕秋莉） - Photoshop UXP 插件

PatchouliPanel是一款 PhotoshopAI插件。名字灵感来自东方Project的帕秋莉·诺蕾姬——红魔馆大图书馆的魔法使。提供轻量便捷的PS调用Nanobanana和Gemini能力。

## 相关网站

[官网Landing](https://patchouli.kiclover.com)

[控制台](https://console.patchouli.kiclover.com)

[Blog](https://kiclover.com)

## Features

- **魔导回路（Process）** 提供生成相关能力
- **魔导书（Preset）** 提供存储预设相关能力
- **大图书馆（Community）** 提供社区预设相关能力
- **预言之书（Chat）** 提供在线LLM调用能力
- **设置（Settings）**

## 使用

可从Release页面下载插件包，根据使用文档进行使用
使用文档 [https://kiclover.com/archives/1769678666627](https://kiclover.com/archives/1769678666627)

## 二次开发 前置条件

- **Node.js 18+**
- 包管理器：推荐 **pnpm**
- **Adobe UXP Developer Tool（UDT）**
- Photoshop 25+

## 安装依赖

在仓库根目录：

```bash
pnpm i
```

如果需要单独开发 WebView UI（可选）：

```bash
pnpm -C webview-ui i
```

## 开发与调试

### 1) 构建插件（开发监听）

```bash
pnpm dev
```

该命令会使用 Vite 进行构建并监听变更（见根目录 `package.json`：`cross-env MODE=dev vite build --watch`）。

### 2) 在 UDT 中加载插件

- 打开 UDT
- 选择 **Add Plugin...**
- 指向本项目的构建输出目录/插件目录（具体路径取决于 `vite-uxp-plugin` 的输出设置；通常为项目 `dist/`）
- 在 Photoshop 中打开面板（插件名称：**帕秋莉-PatchouliPanel**）

### 3) Debug 面板

设置页可开启 **Debug 面板**：

- WebView 侧：`installOnScreenDebug("webview")`
- Host 侧：非 dev 模式下会根据配置自动启用（见 `src/index-vue.ts`）

## 构建与打包

根目录脚本（见 `package.json`）：

- `pnpm build`
  - `MODE=build vite build`
- `pnpm ccx`
  - `MODE=package vite build`（用于生成可分发产物）
- `pnpm zip`
  - `MODE=zip vite build`（用于打 ZIP 包，`uxp.config.ts` 中配置了 `copyZipAssets`）

如需仅预览 Vite：

```bash
pnpm preview
```

## License

GPL V3
