#!/bin/sh
# the GL build into the live repo's gl/ (https://tazaur.github.io/Militia-Mayhem/gl/), committed and pushed there (only gl/)
set -e
LIVE="../Militia Mayhem"
mkdir -p "$LIVE/gl"; cp index.html "$LIVE/gl/index.html"; cp version.json "$LIVE/gl/version.json"
B=$(python -c "import json; print(json.load(open('version.json'))['build'])")
cd "$LIVE"; git add gl/index.html gl/version.json
git commit -q -m "GL build $B" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- gl/index.html gl/version.json
git push -q origin main
echo "deployed GL $B"
