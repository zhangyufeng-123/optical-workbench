# 光学光路设计台

供组内试用与反馈的 Windows 桌面软件。当前测试版：**V5.9**。

## 下载和运行

1. 打开 [Releases 最新版](https://github.com/zhangyufeng-123/optical-workbench/releases/latest)，下载 Windows x64 `.exe`。
2. 双击运行，无需安装 Node.js 或额外配置开发环境。
3. 使用前保存自己的工程；更新程序时先导出工程 JSON 备份。

发布页中的 EXE 是可直接使用的程序。GitHub 自动附带的 **Source code** 压缩包是开发源码。

## 反馈问题

请在 [Issues 问题反馈](https://github.com/zhangyufeng-123/optical-workbench/issues/new/choose) 中填写版本、复现步骤、预期和实际结果，并尽量附截图。也欢迎在组内反馈，由维护者整理到 [Issues](https://github.com/zhangyufeng-123/optical-workbench/issues)。

工程可能包含实验设计和外部图片；提交问题时优先提供可复现问题的最小示例，不附 API 密钥或账号信息。

使用说明见 [使用说明](app/使用说明.md)。字体使用本机已安装资源，未安装的字体会在列表中提示；本项目不分发系统字体。器件模型与连线用于布局和示意，不是精密 CAD 或光学传播仿真。

## 本地开发

建议使用 **Node.js 24**。桌面运行和 EXE 打包在 Windows x64 上进行。首次安装依赖、启动开发版或打包时，需要联网下载开发依赖及 Electron 运行时；已发布的 EXE 不需要这些开发步骤。

```powershell
npm ci
npm test
npm run build
npm run stage
npm start
```

生成便携 EXE：

```powershell
npm run pack
```

输出位于 `dist/`。`app/source/` 是网页应用源码，`app/` 同时保存离线静态资源；仓库根目录包含 Electron 主进程和构建脚本。`web/` 是构建生成的桌面运行目录，不作为手工修改的源码。

## 维护与验证

GitHub Actions 对提交和 Pull Request 运行逻辑回归测试、网页构建与桌面资源整理。真实鼠标拖动、WebGL、系统字体、导出及关闭重开检查仍需 Windows 原生验证。

维护计划为每周一北京时间 09:00（Asia/Shanghai）检查反馈和构建状态；修复先在分支验证，再通过 Pull Request 提交。维护流程和发布检查见 [维护说明](docs/maintenance.md)。CI 不会自动合并修复或发布未经验证的 EXE。

## 来源与许可

本仓库暂未为项目自有代码和模型指定开源许可证。第三方内容分别遵循其原有许可，见 [来源与许可](app/来源与许可.md) 和 [文献图例署名](docs/reference-figure-attribution.md)。不能将某一依赖或素材的许可视为整个项目的许可。
