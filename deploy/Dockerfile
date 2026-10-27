# QRveo 新官网镜像：直接替换后台安装包里的 official 服务（vod-private/mexico-official）。
# 对外端口、环境变量（VOD_API_HOST / VOD_ADMIN_DOMAIN / VOD_WATCH_DOMAIN）和旧官网完全一样。
#
# 在 site/ 目录下：
#   node build.mjs
#   docker build -f deploy/Dockerfile -t vod-private/mexico-official:qrveo-2 .
FROM nginx:1.25-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/40-vod-private-runtime.sh /docker-entrypoint.d/40-vod-private-runtime.sh
RUN chmod +x /docker-entrypoint.d/40-vod-private-runtime.sh
COPY dist/ /usr/share/nginx/html/
