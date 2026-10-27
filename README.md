# QRveo 墨西哥官网（独立站）

面向墨西哥中小企业的 B2B 官网，卖点是“一个能播放视频的二维码”：适合产品、教育、员工培训、包装营销等多种场景。
网站是纯静态页面，不依赖任何框架，直接替换后台安装包里的 **official（官网）服务**。注册、登录、找回密码是官网自己的页面（直接调用后台接口），成功后带着登录状态进入商家控制台；升级付款在控制台里完成。
全站有 8 种语言：西语（主语言）、英、葡、法、德、中、日、韩。

- 设计依据：[BRIEF.md](BRIEF.md)
- 首页短片和示例视频的工程：`../film/`
- 早期的单页版本：已归档在 `archive/v1-onepage/`，不再使用

## 页面
| 地址（都在 `/mexico/` 下） | 页面 | 招牌动效 |
|---|---|---|
| `/` | 首页：标题、短片（产品案例）、四个场景、三步流程、“换视频、码不变”、示例、后台截图、价格入口、常见问题 | 短片播完后换成可以扫的网页版落版 |
| `funciones/` | 功能 | 首屏同一张二维码，视频封面轮换；截图上的光标会点到对应按钮 |
| `soluciones/` | 解决方案总览 | 鼠标悬停时卡片播放短片 |
| `soluciones/productos/`、`educacion/`、`capacitacion/`、`marketing/` | 四个场景页 | 首屏循环短片；痛点用聊天气泡一条条弹出 |
| `ejemplos/` | 示例：4 个可扫的二维码，指向后台的真实观看页 | 手机截图里播放真实视频；二维码上有扫描线 |
| `precios/` | 价格：三个套餐、“哪个套餐适合你”滑块、对比表、续费和付款说明 | 滑块推荐套餐 |
| `ayuda/` | 帮助：左边主题目录，右边搜索和问答 | 边输入边筛选，问答可以折叠 |
| `contacto/` | 联系：表单生成一条 WhatsApp 消息 | 右边实时预览这条消息 |
| `nosotros/` | 关于我们 | 流程线逐步点亮 |
| `ejemplo/` | 备用的静态示例观看页（BF-20） | — |
| `registro/`、`iniciar-sesion/`、`recuperar/` | 注册、登录、找回密码（调用后台 `/auth` 接口，字段与控制台一致；成功后把令牌写进 `x-auth-token` cookie，再打开控制台） | 右侧是“同一张二维码、视频在换”的小部件 |
| `aviso-de-privacidad/`、`terminos/` | 隐私声明、使用条款（只有西语正文） | — |

**语言**：上面每个页面都有 8 种语言。西语在 `/mexico/` 下，其他语言在 `/mexico/<代码>/` 下（`en` `pt` `fr` `de` `zh` `ja` `ko`），例如 `/mexico/en/precios/`。顶栏右侧的“语言”标签会轮播各语言里“语言”这个词，点开可以切换；选过的语言记在浏览器里（键名 `vqr-lang`，和旧官网相同）。浏览器语言和页面不同时，顶部会出现一条可以关掉的提示。`ejemplo/` 只有西语。

全站统一效果：
- 区块滚动到眼前时才出现；
- 顶栏下滑时变窄；
- 系统开了“减少动态效果”或手机开了省流量时，动效和自动播放都会关闭。

## 目录
| 路径 | 内容 |
|---|---|
| `content/es.json` | **主文件：全部文字、价格、联系方式、常见问题、示例视频的 VID**。结构、图片、链接只在这里改 |
| `content/<代码>.json` | 其他 7 种语言的译文，只有文字，结构跟着 es.json。缺的文字网站上先显示西语 |
| `src/i18n.mjs` | 语言列表，以及哪些字段需要翻译 |
| `scripts/i18n.mjs` | `missing` 列出还没翻译的文字，`check` 检查占位符，`skeleton` 导出要翻译的西语 |
| `src/render.mjs` | 所有页面的模板 |
| `src/example.mjs` | 备用静态示例页 |
| `src/legal.mjs` | 隐私声明、使用条款 |
| `src/styles/site.css` | 全站样式 |
| `src/styles/motion.css` | 动效 |
| `src/styles/stage.css` | 首页短片舞台 |
| `src/styles/account.css` | 语言标签、中日韩字体、注册登录页 |
| `src/scripts/site.js` | 交互：控制台链接、二维码、短片、菜单、动效、估算器、搜索、表单 |
| `public/` | 字体、图片、视频，构建时原样复制到网站 |
| `build.mjs` | 生成网站到 `dist/mexico/`，同时生成 `sitemap.xml` |
| `serve.mjs` | 本地预览服务器，模拟后台的官网容器 |
| `editor.mjs` | **网站编辑入口** |
| `deploy/` | 上线用的 Docker 文件 |
| `scripts/make_assets.py` | 从短片导出网站用的静帧和网页版视频 |
| `testing/` | 3 名真人用户测试的任务单和记录表 |
| `review/` | 评审截图；`review/console/` 是后台的真实截图 |

只需要 Node.js 18 以上，不用安装任何依赖包。

## 本地预览
```bash
node build.mjs
node serve.mjs
```
打开 http://127.0.0.1:4321/mexico/

**用手机扫二维码**：电脑和手机连同一个 Wi‑Fi，用下面的方式启动，终端会打印手机能打开的地址。网页上的二维码会自动换成局域网地址，观看页也一样。
```bash
HOST=0.0.0.0 node serve.mjs
```
Windows 第一次运行时可能弹出防火墙提示，需要允许“专用网络”。

**连接本机后台**：`serve.mjs` 和后台官网容器用的是同名环境变量，默认指向本机后台的端口：
- `VOD_ADMIN_DOMAIN=http://127.0.0.1:30081`：控制台（登录后进入、升级付款）
- `VOD_API_HOST=http://127.0.0.1:30015`：后台接口，官网的注册、登录、找回密码直接调用它
- `VOD_WATCH_DOMAIN=http://127.0.0.1:30112`：观看页

后台没启动时，注册、登录会提示“连不上服务器”，示例二维码扫出来也打不开，这是正常的。
注册、登录要完整走通，后台还需要做几处配合（允许官网跨域调用、控制台读取官网写的 cookie 等），见 `../给后端的任务-登录注册与多语言.md`。

## 改内容：网站编辑入口
```bash
EDITOR_PASSWORD=设一个密码 node editor.mjs
```
打开 http://127.0.0.1:4322/editar ，输入密码，在中文表单里修改文字，改完点“保存并更新网站”。可以改的内容有：
- 各页面的文字、价格、套餐对比表；
- WhatsApp 和公司信息；
- 常见问题（可以增删、排序）；
- 示例视频的 VID；
- 其他 7 种语言的译文：右上角切换语言。**Español 是主文件**，增删条目、价格、VID 只在西语里改；其他语言只改文字，每个框下面有西语原文对照。

注意事项：
- 每次保存前都会自动备份到 `content/backups/`，页面底部可以一键恢复任意历史版本。
- 保存时会检查格式，比如 WhatsApp 号码必须是 10–15 位数字。
- 标题里用 `*星号*` 包住的词会显示成橙色。
- 价格请写**含 IVA 的总价**，这是墨西哥消费者保护法的要求。
- 联系页的 RFC 和地址：留空时页面上不显示这一行，填上之后才出现。
- 图片和视频不在表单里改，换素材的方法见下一节。
- 不设密码时，会随机生成一个密码并打印在终端里，只适合本机临时使用。

## 换素材
- **首页短片**：在 `../film/` 改好并导出后，运行：
  ```bash
  python scripts/make_assets.py ../film/out/QRveo-HeroFilm-v7.mp4
  ```
  它会重新导出网页版视频（静音，约 4 MB）和静帧。短片最后一帧的文字如果改了，`content/es.json` 里的 `home.hero.endCard` 也要同步改，因为网页版落版要和最后一帧完全一致。

- **示例视频**：示例页的 4 个二维码指向后台里 4 条真实视频的观看页，在 `content/es.json` 的 `examples[].vid` 里配置：

  | 示例 | VID（本机后台） |
  |---|---|
  | 产品 | `hceea401fc1874e0fc77733500cc84cb_h` |
  | 教育 | `hceea401fcedbbda388ceee193f8732b_h` |
  | 培训 | `hceea401fcc9fba363b5b20e3ce45f62_h` |
  | 营销 | `hceea401fc3ce27f89f66b8d9c406483_h` |

  **正式上线时**，要把这 4 条视频重新上传到正式后台，再把新的 VID 填进来。视频文件：
  - 产品：`public/video/bf20-armado.mp4`
  - 其他三条：`../film/out/DemoEducacion.mp4`、`DemoCapacitacion.mp4`、`DemoMarketing.mp4`

  手机框里叠放的同款视频是 `public/video/demo-*.mp4`；手机截图是 `public/img/ver-*.webp`。后台观看页的样式改了以后，这两样都要重新截取和导出。

- **后台截图**（`public/img/consola-*.webp`）：从 `review/console/v2-*.png` 裁出来。功能页截图上光标的位置，在 `content/es.json` 的 `features.blocks[].cursor` 里设置，用百分比表示。

- **场景短片和卡片图**（`public/video/sol-*.mp4`、`public/img/sol-*.webp`）：来自 Mixkit 的免费视频，授权说明见 [LICENSES.md](LICENSES.md)。

## 临时公网演示

这个仓库保存官网源码、网页素材和演示网关。私有后端安装包、数据库、密钥、运行状态和短片工程不在仓库内。

现有演示入口是 `https://api.yisama.asia/qrveo/`。美国服务器提供静态官网和 HTTPS，`/qrveo-live/` 下的动态请求经 SSH 反向隧道连接本机后台，静态资源可按下节发布加速快照；电脑、WSL 后端和隧道需要保持运行。网关只开放登录、控制台必要的只读接口和四条示例视频，不包含上传、删除、付款和完整管理操作。

在本机后台已启动、代理已连通且服务器已配置 `deploy/nginx-preview.inc` 后，从仓库根目录使用 PowerShell 7：

```powershell
pwsh -File deploy/us-tunnel.ps1 -Action Start
pwsh -File deploy/us-tunnel.ps1 -Action Status
pwsh -File deploy/us-tunnel.ps1 -Action Stop
```

`Stop` 只关闭网关和隧道，本地后端继续运行。脚本默认使用本机 `.ssh/us-server-ed25519` 和代理 `127.0.0.1:30000`，运行记录保存在 Git 忽略的 `.runtime/`。隧道断线后每 3 秒重连；重连期间可能短暂返回 502。`Status` 检查本地进程；公网连通性还应检查 `/qrveo-live/healthz`。访问速度取决于本机上行和代理链路，适合临时演示。

连接真实后台的官网版本使用 `deploy/build-live.mjs` 构建，需要设置独立的 `SITE_DIST` 输出目录；纯静态演示仍使用 `deploy/build-preview.mjs`。网关的路径与鉴权检查可运行 `node deploy/demo-gateway.test.cjs`。

### 演示静态资源加速

`deploy/nginx-preview.inc` 支持从美国服务器直接提供后台页面、观看页、播放器和四条公开示例视频的 HLS 分段。未导出的请求仍走本机隧道；登录、验证码、账号数据、播放统计接口和私有视频不会写入快照或进入公共缓存。

本机 WSL 后端和演示网关运行时，使用一个尚不存在的输出目录：

```powershell
node deploy/export-demo-static.cjs .runtime/demo-static-NEW_RELEASE
tar.exe -czf .runtime/demo-static-NEW_RELEASE.tar.gz -C .runtime/demo-static-NEW_RELEASE -T .runtime/demo-static-NEW_RELEASE/archive-files.txt
```

导出脚本只读取当前可访问的公开资源，按正在运行的 Nuxt 资源清单和 Webpack 引用排除旧构建文件，预先生成 gzip 文件，并在输出目录写入校验用的 `manifest.json`。传输清单 `archive-files.txt` 优先选用压缩文件，避免重复上传。原始 MP4 下载不在快照内。不要把快照或私有后端构建产物提交到 Git。

将压缩包上传并解包到美国服务器的 `/var/www/qrveo-preview/demo-static/releases/NEW_RELEASE/`，在该目录执行 `find qrveo-live -type f -name '*.gz' -exec gzip -dk {} +`，保留压缩文件并恢复普通文件；然后让 `/var/www/qrveo-preview/demo-static/current` 指向该目录。首次启用时，备份并更新 `/etc/nginx/snippets/qrveo-preview.inc`，通过 `nginx -t` 后再重载 Nginx。后续更新只需发布新目录并切换链接；回退时切回旧目录即可。

快照源站设置 5 分钟公共缓存，响应带有 `X-QRveo-Source: us-static`；现有 Cloudflare 策略会延长部分脚本的浏览器缓存，2026-10-27 实测为 4 小时，以公网响应头为准。接口继续使用 `Cache-Control: no-store`。后台页面、播放器、示例视频或视频标题等展示内容更新后，需要重新导出发布；未带版本号的脚本更新后还应刷新对应 CDN 缓存。登录和数据请求仍依赖本机后台与隧道。

## 上线：替换后台里的官网服务
新官网和旧官网（`vod-private/mexico-official`）用的是同一个约定：
- 容器里的 nginx 监听 80 端口；
- 启动时根据 `VOD_API_HOST`、`VOD_ADMIN_DOMAIN`、`VOD_WATCH_DOMAIN` 生成 `/mexico/private-runtime.js`；
- 页面从这个文件里读取控制台和观看页的地址。

所以只要换掉官网镜像，后台的其他服务都不用动。

1. 生成网站，构建镜像（在 `site/` 目录里执行）：
   ```bash
   SITE_ORIGIN=https://www.qrveo.com SITE_WATCH=https://v.qrveo.com node build.mjs
   docker build -f deploy/Dockerfile -t vod-private/mexico-official:qrveo-2 .
   ```
   - `SITE_ORIGIN`：网站的正式地址，用于 WhatsApp 分享卡片和搜索引擎。
   - `SITE_WATCH`：观看页的正式域名。没有脚本的环境也靠它生成二维码；浏览器里会以 `private-runtime.js` 提供的地址为准。
2. 把镜像传到服务器：用 `docker save` / `docker load`，或者推到镜像仓库。
3. 按 `deploy/docker-compose.official.yml` 修改后台的 `docker-compose.yml`：把 `official` 的 `image` 换成新镜像，再加上共享目录 `official-site`。然后执行：
   ```bash
   docker compose up -d official
   ```
4. 域名和 HTTPS：沿用后台的 `scripts/configure-domain.sh`，或者在服务器的 nginx 上把官网域名反代到 30082 端口。正式环境请用 HTTPS。
5. （可选）编辑入口：
   - 构建 `deploy/editor.Dockerfile`，在 `.env` 里设置 `OFFICIAL_EDITOR_PASSWORD`，启用 compose 里的 `official-editor`。
   - 默认只监听服务器本机（`127.0.0.1:30083`）。要在外网使用，请在 nginx 里打开 `/editar` 的反代，并且只走 HTTPS。

**服务器建议**：用美国的服务器。墨西哥访问更快，域名也不需要做国内备案（ICP）。官网本身很轻，nginx 容器只占十几 MB 内存。

## 上线前检查
- [ ] WhatsApp 号码、邮箱、公司名称、城市换成真实信息（编辑入口 → 联系方式与公司信息）
- [ ] 联系页的 RFC 和地址填上真实信息，留空就不显示
- [ ] 隐私声明、使用条款交法律顾问审核，补上公司注册名称（razón social）、RFC 和地址。页面上已经去掉了“草稿”提示，所以上线前必须审完
- [x] 免费试用天数和后台一致：2026-10-25 业务方决定按后台的 **7 天**，网站 8 种语言已改
- [ ] 核实“不续费或试用结束后，已经印出去的二维码还能看”，确认和后台的实际行为一致
- [ ] 后台的观看页底部品牌设置生效；观看页上的英文（例如 “Full screen”）改成西语。改完重新截取 `ver-*.webp`
- [ ] 4 条示例视频上传到正式后台，把新 VID 填进 `examples[].vid`
- [ ] 首页短片里的二维码地址换成正式地址后，重新导出短片（`../film/src/Root.tsx` 里的 `qrUrl`）
- [ ] 用真实手机（低端安卓 + iPhone）扫示例二维码，确认视频能播放
- [ ] 后台完成《给后端的任务-登录注册与多语言.md》的 P0（跨域、控制台读取官网写的 cookie、退出时清 cookie），然后在官网上实际注册、退出、登录、找回密码各走一遍
- [ ] 确认正式的接口域名和控制台域名；如果不是 `api.qrveo.com`、`console.qrveo.com`，要改 `site.js` 里的默认值，或者由 `private-runtime.js` 提供
- [ ] 编辑入口的 Docker 卷 `official-content` 如果已经存在，把新加的 `content/en.json` 等 7 个译文文件拷进去
- [ ] 请懂对应语言的人通读一遍译文，至少英语；译文由 AI 翻译
- [ ] 完成 3 名真人用户测试（见 `testing/`）

## 与第一阶段验收标准对照
| 标准 | 网站上的位置 |
|---|---|
| 服务对象与用途清楚 | 首页首屏：一句话说明“二维码印一次，视频随时换”；“Un QR, muchos usos”四个场景；`soluciones/` 总览和四个场景页（每页都写明“适合谁”） |
| 展示一个典型行业案例 | 首页短片：一家健身单车店把二维码贴在纸箱上；四个场景页都有痛点、用法和可扫的示例 |
| 套餐、期限和额度清楚 | `precios/`：三个套餐（含 IVA、年付、约合每月多少）、估算滑块、11 项对比表、不续费会怎样、付款与发票；`ayuda/` 的“Planes y pagos” |
| 任意设备访问和播放正常 | 电脑、笔记本、手机三种排版，任何宽度都不会横向溢出；手机只在视频滚到眼前时才播放，节省流量；视频统一用 H.264 MP4 |
| 二维码打开真实教程 | 首页短片落版和 `ejemplos/` 的二维码，都指向后台里真实视频的观看页 |
| 演示或试用入口可用 | 每页顶栏都有“Prueba gratis”（官网注册页）和“Iniciar sesión”（官网登录页）；`ejemplos/` 可以直接扫码看演示 |
| 用户注册、登录并跳转到后台 | 官网自己的注册、登录、找回密码页（`registro/`、`iniciar-sesion/`、`recuperar/`），调用后台接口，成功后带着登录状态进入控制台；8 种语言都有 |
| 至少 3 名真人用户测试 | `testing/用户测试.md`：任务单和记录表，需要真人完成 |
| 网站编辑入口 | `editor.mjs`（`/editar`） |
| 部署说明 | 本文件 + `deploy/` |
| 授权素材 | [LICENSES.md](LICENSES.md) |
