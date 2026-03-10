#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HELPER_DIR="${PROJECT_ROOT}/native/macos/LisnCaptureHelper"
STAGE_DIR="${PROJECT_ROOT}/.lisn-build/LisnCaptureHelper"

cd "${HELPER_DIR}"
swift build -c release

mkdir -p "${STAGE_DIR}"
install -m 755 ".build/release/LisnCaptureHelper" "${STAGE_DIR}/LisnCaptureHelper"
