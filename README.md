# Jellyfin 弹幕注入

在 Jellyfin 官方 Web 的 HTML5 播放器上显示弹幕，保留开关、样式、密度、屏蔽词、时间偏移和桌面直方图。

本 fork 基于 [ehehela/jellyfin-inject-danmu](https://github.com/ehehela/jellyfin-inject-danmu) 的 `3ac4689fc3253db6526f8d4d890073f1a4bd0dc5`，保留上游源码结构，便于继续同步。

## 身份与请求

默认读取当前单集 `ProviderIds` 中大小写不敏感的 `DanmuID`，值为 `dandan:<剧集ID>`。先用当前用户凭据请求 `Items?userId=...&ids=...&fields=ProviderIds`，再向同一 Jellyfin API 入口请求 `api/dandan/danmu/<剧集ID>/download?useCache=true&itemId=<媒体条目ID>`。作品 ID 不用于单集播放，没有映射时显示状态并继续播放视频。

切集、离开页面和视频元素替换会取消旧请求并丢弃过期结果。弹幕异步加载，按当前视频时间同步；不通过标题静默猜测身份，也不依赖 lani 在线。

## 构建与安装

运行 `npm ci && npm test && npm run build`。`dist/` 同时包含注入脚本和固定版本的 `danmaku@2.0.10`，渲染库与脚本同目录加载。Docker 镜像使用 nginx 提供 `/danmu/` 下的静态文件，GitHub Actions 在 main 更新后发布带提交 SHA 的镜像。

在 Jellyfin JavaScript Injector 中启用脚本，加载同域的 `/danmu/inject-danmu.js`，并启用 Requires Authentication。推荐使用由 Jellyfin 服务端提供的官方 Web；独立静态 Web 必须确认实际加载了 Injector 的入口。脚本和渲染库不包含服务端凭据。

容器需设置 `JELLYFIN_UPSTREAM=主机:端口`。nginx 将弹幕请求转发给 Jellyfin 插件，由插件验证当前用户身份。脚本只携带现有 Jellyfin 登录凭据，不携带弹弹play应用密钥。

## 弹幕后端与缓存

弹幕后端由独立的 [jellyfin-plugin-danmu](https://github.com/std4453/jellyfin-plugin-danmu) fork 提供，本仓库只提供前端脚本和静态资源。插件按单集ID查询官方或公开代理接口，负责代理设置、请求限速和文件缓存。

前端启用 `useCache=true` 并传入当前 Jellyfin 媒体条目ID。插件校验媒体的 `DanmuID` 与请求一致，在默认72小时冷却内返回已有XML；需要更新时下载并保存。同一条目的并发请求串行处理，避免重复消耗额度。离开页面或切集仍会丢弃过期响应。

部署只使用 GitHub Actions 产出的固定摘要镜像。JavaScript Injector 继续使用社区插件；`inject-danmu-badge.js` 可按需用于已有本地XML。
