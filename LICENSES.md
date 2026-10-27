# 授权素材清单

网站和短片里用到的所有字体、图片、视频、音效和代码库的来源与授权。上线前请再核对一遍。

## 字体（随网站一起发布）
| 字体 | 用途 | 作者 | 授权 |
|---|---|---|---|
| Archivo（`public/fonts/archivo.woff2`） | 标题 | Omnibus-Type | SIL Open Font License 1.1：可免费商用、可嵌入网页 |
| Inter（`public/fonts/inter.woff2`） | 正文 | Rasmus Andersson | SIL Open Font License 1.1：可免费商用、可嵌入网页 |

## 代码库
| 库 | 用途 | 授权 |
|---|---|---|
| QR Code Generator for JavaScript（Kazuhiko Arase，`src/vendor/qrcode.js`） | 在页面上生成二维码 | MIT（文件头保留了版权声明）。“QR Code”是 DENSO WAVE 的注册商标 |
| 后台官网的运行时脚本约定（`deploy/40-vod-private-runtime.sh`） | 读取控制台 / 观看页地址 | 来自合作方后台安装包，属于同一产品，可直接使用 |

网站本身不依赖其他第三方库，也不加载任何外部字体、统计或广告脚本。

## 图片
全部由团队为本项目用 AI 图像模型（gpt-image）生成，没有使用图库照片，也没有真实人物的脸。原图在 `../concepts/raw/`。
| 文件 | 内容 |
|---|---|
| `film/public/img/counter2.jpg`（网站 `mesa.webp`） | 俯拍桌面上的纸箱 |
| `film/public/img/bike2.jpg`、`floor-home.jpg` | 墨西哥家庭客厅、陶土地砖地面 |
| `film/public/img/st-*.webp` | 电钻、搅拌机、美甲灯、书架（白边抠图） |
| `film/public/img/tutorial.jpg`、`step-desempaque.jpg`、`step-pedales.jpg` | 健身单车组装步骤照片 |
| 网站 `img/paso-*.webp`、`productos.webp`、`antes-chat.webp`、`despues-video.webp`、`film-poster.webp`、`og.jpg` | 从团队自己的短片里截取的画面 |

商用前请确认所用图像服务的条款允许商业使用（大多数服务允许用户商用生成结果，但各家条款不同）。

## 视频
| 文件 | 来源 |
|---|---|
| `public/video/qrveo-hero.mp4` | 首屏短片，团队用 Remotion 制作（工程在 `../film/`） |
| `public/video/bf20-armado.mp4` | 示例教程视频，团队用 Remotion 制作（`TutorialBF20`） |

**Remotion 授权提醒**：个人或 3 人以内的团队可免费使用；与企业合作对外发布时，若双方合计 4 人以上，需要购买 Remotion 公司授权。网站只嵌入导出的 MP4，网页本身不依赖 Remotion。

### 图库视频（Mixkit）
场景页的短片（`public/video/sol-*.mp4`）、场景卡片图片（`img/sol-*.webp`），以及示例视频（`DemoEducacion`、`DemoCapacitacion`、`DemoMarketing`，素材在 `../film/public/stock/`）里的画面，来自 Mixkit 免费视频库，适用 **Mixkit Stock Video Free License**：可以商用，不需要署名；不得把原片单独转售或再分发。用到的片段编号有：4613、4761、4790、14785、22032、25438、42122、42464、42467、1669、22642，来源页为 `https://mixkit.co/free-stock-video/<名称>-<编号>/`。
网页上不标注素材来源，按授权本来也不要求标注；来源记录以本文件为准。

## 音效
`film/public/sfx/` 里的全部音效由 `film/scripts/make_sfx.py` 用程序合成，没有使用任何采样，无版权问题。网站上的视频是静音版。

## 品牌与名称
- QRveo 标志（二维码定位角图形）是为本项目临时设计的，正式标志确定后在 `src/render.mjs`（`mark`）和 `../film/src/Logo.tsx` 两处替换。
- “POLYV / 保利威”的名称经合作方同意使用（“Con tecnología de POLYV”）。
- 示例案例（BF-20 健身单车、“TU MARCA”）是虚构的，页面上已标明“Caso ilustrativo”。
- 公司信息、WhatsApp 号码目前是示例数据，上线前必须换成真实信息。
