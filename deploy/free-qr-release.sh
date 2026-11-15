#!/bin/sh
set -eu
umask 077

RELEASE=/home/mx/qrveo/releases/free-qr-20261106
ACTIVE=/home/mx/qrveo/releases/mx-google-entry-20261105-203500/dist
CONTAINER=qrveo-mx-trial-official-1
ACTION=${1:-check}

test "$(id -un)" = mx
test "$(readlink -f "$ACTIVE")" = "$ACTIVE"
MOUNT=$(sudo -n docker inspect --format '{{range .Mounts}}{{if eq .Destination "/usr/share/nginx/html"}}{{.Source}}{{end}}{{end}}' "$CONTAINER")
test "$MOUNT" = "$ACTIVE"
cd "$RELEASE"

valid_path() {
  case "$1" in *..*|/*) return 1 ;; esac
  case "$1" in mexico/*) return 0 ;; *) return 1 ;; esac
}

case "$ACTION" in
  check)
    sha256sum -c payload.sha256
    test ! -e payload
    mkdir payload
    tar -xzf payload.tar.gz -C payload
    find payload -type f | sed 's#^payload/##' | sort > files.txt
    while IFS= read -r file; do valid_path "$file"; done < files.txt
    test -f payload/mexico/crear-qr/index.html
    test -f payload/mexico/assets/qr-generator.mjs
    test ! -e payload/mexico/private-runtime.js
    sudo -n docker exec "$CONTAINER" nginx -t
    printf 'PASS: payload, target mount and nginx checked; no live files changed.\n'
    ;;
  apply)
    test -f files.txt
    test ! -e backup.tar.gz
    : > existing.txt
    : > new.txt
    while IFS= read -r file; do
      valid_path "$file"
      if test -f "$ACTIVE/$file"; then printf '%s\n' "$file" >> existing.txt
      else printf '%s\n' "$file" >> new.txt
      fi
    done < files.txt
    tar -czf "$RELEASE/backup.tar.gz" -C "$ACTIVE" -T existing.txt
    for phase in assets pages; do
      while IFS= read -r file; do
        case "$file" in *.html) kind=pages ;; *) kind=assets ;; esac
        test "$kind" = "$phase" || continue
        mkdir -p -m 755 "$(dirname "$ACTIVE/$file")"
        cp "$RELEASE/payload/$file" "$ACTIVE/$file.next"
        chmod 644 "$ACTIVE/$file.next"
        mv "$ACTIVE/$file.next" "$ACTIVE/$file"
      done < files.txt
    done
    curl -fsS --max-time 15 http://127.0.0.1:30082/mexico/crear-qr/ | grep 'data-qr-generator' >/dev/null
    curl -fsS --max-time 15 http://127.0.0.1:30082/mexico/zh/crear-qr/ | grep 'data-qr-generator' >/dev/null
    printf 'PASS: free QR pages published; backup at %s/backup.tar.gz\n' "$RELEASE"
    ;;
  rollback)
    test -f backup.tar.gz
    tar -xzf backup.tar.gz -C "$ACTIVE"
    while IFS= read -r file; do
      valid_path "$file"
      rm -f -- "$ACTIVE/$file"
    done < new.txt
    curl -fsS --max-time 15 http://127.0.0.1:30082/mexico/ >/dev/null
    printf 'PASS: previous static files restored.\n'
    ;;
  *) printf 'Usage: %s check|apply|rollback\n' "$0" >&2; exit 2 ;;
esac
