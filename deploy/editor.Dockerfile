# 网站编辑入口镜像（可选）：登录后改文字、价格、WhatsApp、常见问题，保存后重新生成页面，
# 写进与 official 容器共享的目录。内存占用约 40–60 MB。
#
# 在 site/ 目录下：
#   docker build -f deploy/editor.Dockerfile -t vod-private/qrveo-site-editor:qrveo-2 .
FROM node:22-alpine
WORKDIR /app
COPY build.mjs editor.mjs ./
COPY src ./src
COPY public ./public
COPY content ./content
ENV HOST=0.0.0.0 EDITOR_PORT=4322 SITE_DIST=/site-dist
EXPOSE 4322
CMD ["node", "editor.mjs"]
