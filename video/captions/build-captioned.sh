#!/usr/bin/env bash
# Burns the captions and call-outs into the exported demo video.
#
#   bash video/captions/build-captioned.sh <exported video.mp4> [output.mp4]
#
# Needs ffmpeg built with libass, python3, and the IBM Plex Sans / Mono TTF files in
# video/out/fonts/ (Google Fonts, OFL; the script downloads them if the folder is empty).
# Output defaults to video/out/UHID-demo-captioned.mp4 (video/out/ is git-ignored).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$HERE/../out"
SRC="${1:?give the exported video}"
DEST="${2:-$OUT_DIR/UHID-demo-captioned.mp4}"
FONTS="$OUT_DIR/fonts"
mkdir -p "$OUT_DIR" "$FONTS"

if ! ls "$FONTS"/*.ttf >/dev/null 2>&1; then
  UA="Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 Safari/537.36 Android"
  for fam in "IBM+Plex+Sans:wght@400;600;700" "IBM+Plex+Mono:wght@400;600"; do
    curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=$fam"
  done | grep -o "https://fonts.gstatic.com[^)]*" | nl -nln | while read -r n url; do
    curl -sS -o "$FONTS/plex-$n.ttf" "$url"
  done
fi

python3 "$HERE/make-captions.py" "$OUT_DIR"

DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")"
# 1. the recording at 85 %, top-centre, on the rail colour (#0C2B3A)
# 2. the progress-bar track along the top of the caption band, and the amber bar over it
# 3. the captions and call-outs
ffmpeg -hide_banner -y -i "$SRC" \
  -f lavfi -i "color=c=0xF5B83D:s=1920x6:r=30:d=$DUR" \
  -filter_complex "\
[0:v]scale=1632:918:flags=lanczos,pad=1920:1080:144:0:color=0x0C2B3A,\
drawbox=x=0:y=918:w=1920:h=6:color=0x1F4B5E:t=fill[base];\
[base][1:v]overlay=x='-w+w*t/$DUR':y=918:eof_action=pass[bar];\
[bar]ass='$OUT_DIR/captions.ass':fontsdir='$FONTS'[v]" \
  -map "[v]" -map 0:a? -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p \
  -c:a copy -movflags +faststart "$DEST"
echo "wrote $DEST"
