#!/usr/bin/env bash
# ==============================================================================
# TicketIn Mobile One-Command Build & ADB Install Script
# ==============================================================================
# Usage:
#   ./build-apk.sh                  # Build debug APK and auto-install if device connected
#   ./build-apk.sh --release        # Build release APK
#   ./build-apk.sh --debug          # Build debug APK (default)
#   ./build-apk.sh --run            # Build, install, and launch the app
#   ./build-apk.sh --clean          # Clean build cache before building
#   ./build-apk.sh --split-per-abi  # Build split APKs for smaller file sizes
# ==============================================================================

set -eo pipefail

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
NC="\033[0m" # No Color

# Determine project root and directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="${SCRIPT_DIR}/mobile"
OUTPUT_DIR="${SCRIPT_DIR}/apk-output"
PACKAGE_NAME="com.mhhanif.ticketin"
MAIN_ACTIVITY="com.ticketin.eventgate.MainActivity"

# Export required variables for Gradle configuration
export TICKETIN_APPLICATION_ID="${TICKETIN_APPLICATION_ID:-com.mhhanif.ticketin}"
export API_BASE_URL="${API_BASE_URL:-https://ticketin.app/api}"

# Default flags
BUILD_MODE="debug"
CLEAN_BUILD=false
AUTO_RUN=false
SPLIT_PER_ABI=false

# Parse arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --release|-r)
      BUILD_MODE="release"
      shift
      ;;
    --debug|-d)
      BUILD_MODE="debug"
      shift
      ;;
    --clean|-c)
      CLEAN_BUILD=true
      shift
      ;;
    --run)
      AUTO_RUN=true
      shift
      ;;
    --split-per-abi)
      SPLIT_PER_ABI=true
      shift
      ;;
    --help|-h)
      echo -e "${BOLD}TicketIn Mobile Build & Install Tool${NC}"
      echo ""
      echo "Usage: ./build-apk.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --debug, -d          Build debug APK (default - faster build)"
      echo "  --release, -r        Build optimized release APK"
      echo "  --clean, -c          Run 'flutter clean' before building"
      echo "  --run                Automatically launch app after installing"
      echo "  --split-per-abi      Build separate APKs for each architecture"
      echo "  --help, -h           Show this help message"
      exit 0
      ;;
    *)
      echo -e "${YELLOW}Unknown option: $1${NC} (see --help)"
      shift
      ;;
  esac
done

echo -e "${CYAN}====================================================${NC}"
echo -e "${BOLD}${CYAN}   🚀 TicketIn Mobile Build & Deploy Pipeline       ${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e "Mode:        ${BOLD}${BUILD_MODE}${NC}"
echo -e "Output dir:  ${BOLD}${OUTPUT_DIR}${NC}"
echo ""

# Ensure output directory exists
mkdir -p "${OUTPUT_DIR}"

# Find Flutter executable
FLUTTER_BIN=$(which flutter 2>/dev/null || echo "")
if [[ -z "${FLUTTER_BIN}" ]]; then
  if [[ -f "/mnt/d/Tools/flutter/bin/flutter" ]]; then
    FLUTTER_BIN="/mnt/d/Tools/flutter/bin/flutter"
  fi
fi

if [[ -z "${FLUTTER_BIN}" ]]; then
  echo -e "${RED}❌ Error: Flutter SDK not found in PATH or standard location.${NC}"
  echo "Please ensure Flutter is installed and added to PATH."
  exit 1
fi

echo -e "${BLUE}ℹ️  Using Flutter at: ${FLUTTER_BIN}${NC}"

# Navigate to mobile dir
cd "${MOBILE_DIR}"

# Clean if requested
if [[ "${CLEAN_BUILD}" == true ]]; then
  echo -e "${YELLOW}🧹 Cleaning build cache...${NC}"
  "${FLUTTER_BIN}" clean
fi

# Fetch dependencies
echo -e "${BLUE}📦 Fetching dependencies (flutter pub get)...${NC}"
"${FLUTTER_BIN}" pub get

# Build APK
echo -e "${BLUE}🔨 Building ${BUILD_MODE} APK...${NC}"
BUILD_ARGS=("build" "apk" "--${BUILD_MODE}" "--dart-define=API_BASE_URL=${API_BASE_URL}" "--dart-define=TICKETIN_APPLICATION_ID=${TICKETIN_APPLICATION_ID}")
if [[ "${SPLIT_PER_ABI}" == true ]]; then
  BUILD_ARGS+=("--split-per-abi")
fi

"${FLUTTER_BIN}" "${BUILD_ARGS[@]}"

# Locate built APK
if [[ "${BUILD_MODE}" == "release" ]]; then
  SOURCE_APK="${MOBILE_DIR}/build/app/outputs/flutter-apk/app-release.apk"
else
  SOURCE_APK="${MOBILE_DIR}/build/app/outputs/flutter-apk/app-debug.apk"
fi

if [[ ! -f "${SOURCE_APK}" ]]; then
  # Fallback search
  SOURCE_APK=$(find "${MOBILE_DIR}/build/app/outputs/flutter-apk" -name "*.apk" | head -n 1)
fi

if [[ ! -f "${SOURCE_APK}" ]]; then
  echo -e "${RED}❌ Error: Built APK not found at ${SOURCE_APK}${NC}"
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_TIMESTAMPED_APK="${OUTPUT_DIR}/TicketIn-${BUILD_MODE}-${TIMESTAMP}.apk"
TARGET_LATEST_APK="${OUTPUT_DIR}/TicketIn-${BUILD_MODE}.apk"
UNIVERSAL_LATEST_APK="${OUTPUT_DIR}/TicketIn-latest.apk"

cp "${SOURCE_APK}" "${TARGET_TIMESTAMPED_APK}"
cp "${SOURCE_APK}" "${TARGET_LATEST_APK}"
cp "${SOURCE_APK}" "${UNIVERSAL_LATEST_APK}"

APK_SIZE=$(du -h "${UNIVERSAL_LATEST_APK}" | cut -f1)

echo ""
echo -e "${GREEN}====================================================${NC}"
echo -e "${BOLD}${GREEN}   ✅ Build Succeeded!                             ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "APK Size:    ${BOLD}${APK_SIZE}${NC}"
echo -e "Latest APK:  ${BOLD}${UNIVERSAL_LATEST_APK}${NC}"
echo -e "Versioned:   ${TARGET_TIMESTAMPED_APK}"
echo ""

# ADB Check & Installation
ADB_BIN=$(which adb 2>/dev/null || echo "")

if [[ -n "${ADB_BIN}" ]]; then
  echo -e "${BLUE}🔍 Checking for connected Android devices/emulators...${NC}"
  
  # List devices (excluding header and offline devices)
  CONNECTED_DEVICES=$("${ADB_BIN}" devices | grep -v "List of devices" | grep "device$" | awk '{print $1}' || echo "")
  
  if [[ -n "${CONNECTED_DEVICES}" ]]; then
    DEVICE_COUNT=$(echo "${CONNECTED_DEVICES}" | wc -l)
    echo -e "${GREEN}📱 Found ${DEVICE_COUNT} connected device(s):${NC}"
    echo "${CONNECTED_DEVICES}"
    echo ""
    echo -e "${YELLOW}📲 Installing ${BOLD}TicketIn-latest.apk${NC} via adb...${NC}"
    
    for DEV in ${CONNECTED_DEVICES}; do
      echo -e "${CYAN}→ Installing on device: ${DEV}...${NC}"
      "${ADB_BIN}" -s "${DEV}" install -r "${UNIVERSAL_LATEST_APK}"
      echo -e "${GREEN}✓ Successfully installed on ${DEV}${NC}"
      
      if [[ "${AUTO_RUN}" == true ]]; then
        echo -e "${CYAN}🚀 Launching app on ${DEV}...${NC}"
        "${ADB_BIN}" -s "${DEV}" shell monkey -p "${PACKAGE_NAME}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || \
        "${ADB_BIN}" -s "${DEV}" shell am start -n "${PACKAGE_NAME}/${MAIN_ACTIVITY}" >/dev/null 2>&1 || true
      fi
    done
    
    echo ""
    echo -e "${BOLD}${GREEN}🎉 All done! App is ready on your device.${NC}"
  else
    echo -e "${YELLOW}⚠️  No active Android device or emulator detected via ADB.${NC}"
    echo ""
    echo -e "To install manually once you connect your device or emulator, run:"
    echo -e "  ${BOLD}${CYAN}adb install -r ${UNIVERSAL_LATEST_APK}${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  'adb' command not found in PATH.${NC}"
  echo -e "Install APK manually with:"
  echo -e "  ${BOLD}adb install -r ${UNIVERSAL_LATEST_APK}${NC}"
fi
