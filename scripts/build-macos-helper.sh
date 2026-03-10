#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HELPER_DIR="${PROJECT_ROOT}/native/macos/LissenCaptureHelper"

cd "${HELPER_DIR}"
swift build -c release
