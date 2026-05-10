#!/bin/zsh

cd "$(dirname "$0")" || exit 1

PORT="${PORT:-8080}"
AUTO_OPEN="${AUTO_OPEN:-1}"

finish() {
  echo
  echo "サーバーを停止しました。"
  read -r "?Enter キーで閉じます..."
  exit 0
}

trap finish INT TERM

if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "Python が見つかりません。python3 をインストールしてから再実行してください。"
  echo
  read -r "?Enter キーで閉じます..."
  exit 1
fi

while ! "$PYTHON_CMD" -c "import socket, sys; s = socket.socket(); s.settimeout(0.2); sys.exit(1 if s.connect_ex(('127.0.0.1', int(sys.argv[1]))) == 0 else 0)" "$PORT"; do
  PORT=$((PORT + 1))
done

URL="http://localhost:${PORT}"

echo "GPT-4o Chat を起動します。"
echo "フォルダ: $(pwd)"
echo "URL: ${URL}"
echo
echo "停止するときは、このウィンドウで Control + C を押してください。"
echo

if [[ "$AUTO_OPEN" != "0" ]] && command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1
fi

"$PYTHON_CMD" -m http.server "$PORT"

finish
