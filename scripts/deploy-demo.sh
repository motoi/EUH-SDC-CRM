#!/bin/sh
# site/ の中身を gh-pages ブランチとして origin に置く（GitHub Pages の公開元）
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -R site/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git commit -q -m "確認用サイトを更新"
git push -q -f "$REMOTE" gh-pages
rm -rf "$TMP"
echo "gh-pages に置きました"
