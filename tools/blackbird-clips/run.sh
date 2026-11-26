#!/bin/zsh
# ./run.sh "<steps>" [shot-name]  — runs steps, prints the tree (compact), screenshots
D=${0:A:h}
TEST_RUNNER_NODUMP="$NODUMP" TEST_RUNNER_MARKS="$MARKS" TEST_RUNNER_STEPS="$1" xcodebuild -project $D/BBDriver.xcodeproj -scheme Drive -destination 'id=4FE2DDB4-D164-4245-85D5-92BBC450B372' -derivedDataPath $D/dd test-without-building 2>&1 \
 | sed -n '/DUMP-BEGIN/,/Path to element/p;/MISSING/p;/UNKNOWN/p;/MARK /p;/error:/p' | grep -v "Requesting snapshot" | grep -E "label|MISSING|UNKNOWN|MARK|error|Window" | sed -E 's/, 0x[0-9a-f]+//' | head -${LINES_MAX:-90}
if [[ -n "$2" ]]; then xcrun simctl io booted screenshot $D/shots/$2.png >/dev/null 2>&1; python3 -c "
from PIL import Image; im=Image.open('$D/shots/$2.png'); im.resize((im.width//3,im.height//3)).save('$D/shots/$2-s.png')"; fi
