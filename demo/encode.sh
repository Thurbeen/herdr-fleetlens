#!/usr/bin/env bash
set -euo pipefail

demo="${1:?usage: encode.sh <take dir> <out dir> [name]}"
out="${2:?usage: encode.sh <take dir> <out dir> [name]}"
name="${3:-fleet-lens}"
fps=15

mkdir -p "$out"
find "$demo/frames" -name "*.png" -printf "%f\n" | sed "s/\.png$//" | sort -n |
  awk -v marks="$demo/marks" -v dir="$demo/frames" -v step="$(awk -v f="$fps" 'BEGIN { print 1 / f }')" '
    BEGIN { while ((getline line < marks) > 0) { split(line, m, " "); factor[++n] = m[1]; at[n] = m[2] } }
    function speed_at(t,   i, f) { f = 1; for (i = 1; i <= n; i++) if (at[i] <= t) f = factor[i]; return f }
    { t[NR] = $0 + 0 }
    END {
      shown = 1; held = 0
      for (i = 1; i <= NR; i++) {
        held += (i < NR ? t[i + 1] - t[i] : 1500) / 1000 / speed_at(t[i])
        if (held >= step || i == NR) {
          printf "file %s/%d.png\nduration %.3f\n", dir, t[shown], held
          shown = i + 1; held = 0
        }
      }
      printf "file %s/%d.png\n", dir, t[NR]
    }' >"$demo/frames.txt"

ffmpeg -loglevel error -y -f concat -safe 0 -i "$demo/frames.txt" \
  -vf "fps=$fps,scale=1280:-2:flags=lanczos,format=yuv420p" -c:v libx264 -crf 22 -preset slow -movflags +faststart \
  "$out/$name.mp4"
ffmpeg -loglevel error -y -i "$out/$name.mp4" -filter_complex \
  "fps=10,scale=1100:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  "$out/$name.gif"
echo "wrote $out/$name.mp4 and $out/$name.gif"
