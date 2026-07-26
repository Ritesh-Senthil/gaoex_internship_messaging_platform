#!/usr/bin/env bash
# Capture real App Store screenshots from the booted iOS Simulator.
set -euo pipefail

OUT_RAW="${1:-/tmp/store-shots/raw}"
mkdir -p "$OUT_RAW"

shot() {
  local name="$1"
  sleep 1.5
  xcrun simctl io booted screenshot "$OUT_RAW/${name}.png"
  echo "captured $name"
}

open_url() {
  xcrun simctl openurl booted "$1"
  sleep 2.5
}

PROGRAM_ID="ba685d03-56d2-4ee4-b6f0-7a4872e9a687"
CHANNEL_ID="8e3d425e-0c47-48b6-ad7f-c20b6a930248"
CHANNEL_NAME="questions1"
CONV_ID="e2a406c9-5159-4078-b7fc-53663fdcbfb1"
CONV_NAME="Mithun%20GAOEX"

# Ensure app is foregrounded with Metro
xcrun simctl launch --terminate-running-process booted com.internhub.app \
  --url "exp+internhub://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" >/dev/null || true
sleep 6

open_url "internhub://shot/programs"
shot "02-programs"

open_url "internhub://shot/program?id=${PROGRAM_ID}"
shot "03-channels"

open_url "internhub://shot/channel?id=${CHANNEL_ID}&name=${CHANNEL_NAME}&programId=${PROGRAM_ID}"
shot "04-messaging"

open_url "internhub://shot/dms"
shot "05-dms"

open_url "internhub://shot/conversation?id=${CONV_ID}&name=${CONV_NAME}"
shot "05b-conversation"

open_url "internhub://shot/search"
shot "06-search"

open_url "internhub://shot/profile"
shot "07-profile"

echo "DONE raw -> $OUT_RAW"
ls -la "$OUT_RAW"
