#!/usr/bin/env bash
set -eu

# Run from the extracted application directory inside Beget's Docker SSH shell.
APP_ROOT=$(pwd -P)
SITE_ROOT=$(cd "$APP_ROOT/.." && pwd -P)
APP_DIR=$(basename "$APP_ROOT")
DOCROOT="$SITE_ROOT/public_html"
TARGET="$APP_DIR/public"
STAMP=$(date +%Y%m%d-%H%M%S)

if [ ! -f "$APP_ROOT/server.js" ] || [ ! -f "$APP_ROOT/package.json" ]; then
  echo "Ошибка: запустите скрипт из каталога игры (рядом должны быть server.js и package.json)." >&2
  exit 1
fi

if [ ! -f "$APP_ROOT/public/3d.bundle.js" ]; then
  echo "Ошибка: не найден собранный public/3d.bundle.js. Используйте исходный архив без удаления файлов." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm не найдены. Сначала установите Node.js 18+ по инструкции Beget:" >&2
  echo "https://beget.com/ru/kb/how-to/web-apps/node-js" >&2
  exit 1
fi

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Обнаружен Node.js $(node -v); игре нужен Node.js 18 или новее." >&2
  exit 1
fi

NODE_BIN=$(command -v node)
echo "Node.js: $(node -v) ($NODE_BIN)"
echo "Каталог приложения: $APP_ROOT"
echo "Каталог сайта: $SITE_ROOT"

npm ci --omit=dev

if [ -f "$SITE_ROOT/.htaccess" ] && ! grep -Fq "PassengerAppRoot $APP_ROOT" "$SITE_ROOT/.htaccess"; then
  cp "$SITE_ROOT/.htaccess" "$SITE_ROOT/.htaccess.backup-$STAMP"
  echo "Прежний .htaccess сохранён как .htaccess.backup-$STAMP"
fi

cat > "$SITE_ROOT/.htaccess" <<EOF
PassengerNodejs $NODE_BIN
PassengerAppRoot $APP_ROOT
PassengerAppType node
PassengerStartupFile server.js
PassengerAppEnv production
EOF

# Never delete the previous document root: rename it so the default site can be restored.
if [ -L "$DOCROOT" ] && [ "$(readlink "$DOCROOT")" = "$TARGET" ]; then
  echo "Символьная ссылка public_html уже настроена."
else
  if [ -e "$DOCROOT" ] || [ -L "$DOCROOT" ]; then
    mv "$DOCROOT" "$SITE_ROOT/public_html.backup-$STAMP"
    echo "Прежний public_html сохранён как public_html.backup-$STAMP"
  fi
  ln -s "$TARGET" "$DOCROOT"
fi

mkdir -p "$APP_ROOT/tmp"
touch "$APP_ROOT/tmp/restart.txt"

echo
echo "Готово. Откройте http://$(basename "$SITE_ROOT")/health"
echo "Ожидаемый ответ: {\"ok\":true,...}"
echo "Затем откройте сайт и проверьте бой и подключение второго игрока."
