location = /qrveo {
    absolute_redirect off;
    return 302 /qrveo/;
}

location = /qrveo-live {
    absolute_redirect off;
    return 302 /qrveo-live/__qrveo/console/;
}

location ^~ /qrveo-live/ {
    root /var/www/qrveo-preview/demo-static/current;
    index index.html;
    absolute_redirect off;
    gzip_static on;
    gzip_vary on;
    charset utf-8;
    types {
        text/html html;
        text/css css;
        application/javascript js mjs;
        application/json json;
        application/wasm wasm;
        application/vnd.apple.mpegurl m3u8;
        image/svg+xml svg;
        image/webp webp;
        image/jpeg jpg jpeg;
        image/png png;
        image/gif gif;
        image/x-icon ico;
        video/mp4 mp4;
        video/mp2t ts;
        font/woff woff;
        font/woff2 woff2;
        font/ttf ttf;
    }
    add_header Cache-Control "public, max-age=300";
    add_header X-QRveo-Source "us-static" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options "nosniff" always;
    try_files $uri $uri/index.html @qrveo_live_tunnel;
}

location @qrveo_live_tunnel {
    proxy_pass http://127.0.0.1:32984;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
    proxy_buffering off;
    proxy_cache off;
    add_header Cache-Control "no-store" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
}

location ^~ /qrveo/ {
    root /var/www/qrveo-preview/current;
    index index.html;
    absolute_redirect off;
    charset utf-8;
    types {
        text/html html;
        text/css css;
        application/javascript js mjs;
        application/json json;
        application/xml xml;
        image/svg+xml svg;
        image/webp webp;
        image/jpeg jpg jpeg;
        image/png png;
        video/mp4 mp4;
        font/woff2 woff2;
    }
    add_header Cache-Control "no-cache" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options "nosniff" always;
    try_files $uri $uri/ =404;
}
