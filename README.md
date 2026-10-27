# Jellyfin 弹幕注入

在 Jellyfin 官方 Web 的 HTML5 播放器上显示弹幕，保留开关、样式、密度、屏蔽词、时间偏移和桌面直方图。

本 fork 基于 [ehehela/jellyfin-inject-danmu](https://github.com/ehehela/jellyfin-inject-danmu) 的 `3ac4689fc3253db6526f8d4d890073f1a4bd0dc5`，保留上游源码结构，便于继续同步。

## 身份与请求

默认读取当前单集 `ProviderIds` 中大小写不敏感的 `DanmuID`，值为 `dandan:<剧集ID>`。先用当前用户凭据请求 `Items?userId=...&ids=...&fields=ProviderIds`，再向同一 Jellyfin API 入口请求 `api/dandan/danmu/<剧集ID>/download`。作品 ID 不用于单集播放，没有映射时显示状态并继续播放视频。

切集、离开页面和视频元素替换会取消旧请求并丢弃过期结果。弹幕异步加载，按当前视频时间同步；不通过标题静默猜测身份，也不依赖 lani 在线。

## 构建与安装

运行 `npm ci && npm test && npm run build`。`dist/` 同时包含注入脚本和固定版本的 `danmaku@2.0.10`，渲染库与脚本同目录加载。Docker 镜像使用 nginx 提供 `/danmu/` 下的静态文件，GitHub Actions 在 main 更新后发布带提交 SHA 的镜像。

在 Jellyfin JavaScript Injector 中启用脚本，加载同域的 `/danmu/inject-danmu.js`，并启用 Requires Authentication。推荐使用由 Jellyfin 服务端提供的官方 Web；独立静态 Web 必须确认实际加载了 Injector 的入口。脚本和渲染库不包含服务端凭据。

容器需设置 `JELLYFIN_UPSTREAM=主机:端口`。弹幕请求先通过 Jellyfin `/Items?Limit=0` 验证当前凭据，再代理到插件；静态脚本不携带服务端密钥。部署时将弹幕 API 路径与 `/danmu/` 一起路由到此容器。

在线弹幕接口由部署环境提供，需启用弹弹play关联弹幕，并验证身份认证、目标 Jellyfin 版本和连续切集。`inject-danmu-badge.js` 仅用于已有本地 XML 弹幕，可按需单独安装。
