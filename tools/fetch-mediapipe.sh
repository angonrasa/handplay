#!/bin/sh
# Mengunduh MediaPipe (WASM + model tangan) ke assets/mediapipe/ SEKALI SAJA.
# Setelah itu aplikasi jalan offline. Butuh: node/npm, curl atau wget, tar.
# Termux: pkg install nodejs curl   |   Jalankan dari folder proyek:  sh tools/fetch-mediapipe.sh
set -e
cd "$(dirname "$0")/.."

DEST=assets/mediapipe
MODEL_URL=https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "1/3 Mengunduh paket @mediapipe/tasks-vision (npm) ..."
(cd "$TMP" && npm pack @mediapipe/tasks-vision >/dev/null)
tar -xzf "$TMP"/mediapipe-tasks-vision-*.tgz -C "$TMP"

echo "2/3 Menyalin bundle JS dan WASM ..."
mkdir -p "$DEST/wasm"
cp "$TMP/package/vision_bundle.mjs" "$DEST/"
cp "$TMP"/package/wasm/* "$DEST/wasm/"
sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$TMP/package/package.json" | head -1 > "$DEST/VERSION"

echo "3/3 Mengunduh model hand_landmarker.task ..."
if command -v curl >/dev/null 2>&1; then
  curl -L --fail -o "$DEST/hand_landmarker.task" "$MODEL_URL"
else
  wget -O "$DEST/hand_landmarker.task" "$MODEL_URL"
fi

echo "Memeriksa file ..."
for f in vision_bundle.mjs wasm/vision_wasm_internal.js wasm/vision_wasm_internal.wasm hand_landmarker.task; do
  if [ ! -s "$DEST/$f" ]; then echo "HILANG atau kosong: $DEST/$f"; exit 1; fi
done
echo "Selesai. MediaPipe $(cat "$DEST/VERSION") siap di $DEST/"
