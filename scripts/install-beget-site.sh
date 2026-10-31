#!/usr/bin/env bash
# Deploy static game files without replacing the multiplayer API or its state.
set -eu
site="${KNIGHTS_SITE_ROOT:-$HOME/igra.cosmorox.ru/public_html}"
url="${KNIGHTS_BEGET_ARCHIVE_URL:-https://github.com/MarkusCrass/test/releases/download/beget-latest/knights-beget-public_html.zip}"
if [ ! -d "$site" ]; then
  echo "Ошибка: папка сайта не найдена: $site" >&2
  exit 1
fi
for cmd in curl unzip mktemp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Ошибка: не найдена программа $cmd" >&2
    exit 1
  fi
done
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
printf '%s\n' 'Скачиваю сборку игры...'
curl -fLsS --max-time 180 "$url" -o "$tmp/game.zip"
unzip -tq "$tmp/game.zip" >/dev/null
mkdir -p "$tmp/files"
unzip -qo "$tmp/game.zip" -d "$tmp/files" -x 'api/*' 'deploy.php' '.htaccess'
[ -f "$tmp/files/index.html" ] || { echo 'Ошибка: в архиве нет index.html' >&2; exit 1; }
backup=$(mktemp -d "$HOME/knights-backup.XXXXXXXX")
[ ! -f "$site/index.html" ] || cp "$site/index.html" "$backup/index.html"
[ ! -f "$site/.htaccess" ] || cp "$site/.htaccess" "$backup/.htaccess"
printf '%s\n' 'Устанавливаю файлы игры (API и данные комнат сохраняются)...'
cp -R "$tmp/files/." "$site/"
if [ ! -f "$site/.htaccess" ] || ! grep -Fqx 'DirectoryIndex index.html index.php' "$site/.htaccess"; then
  {
    printf 'DirectoryIndex index.html index.php\n'
    [ ! -f "$site/.htaccess" ] || cat "$site/.htaccess"
  } > "$tmp/htaccess"
  cp "$tmp/htaccess" "$site/.htaccess"
fi
printf 'Готово. Копии старых index.html и .htaccess (если были): %s\n' "$backup"
printf '%s\n' 'Проверьте https://igra.cosmorox.ru/'
