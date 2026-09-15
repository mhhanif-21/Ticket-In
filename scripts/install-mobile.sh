#!/usr/bin/env bash
# ==============================================================================
# TicketIn Mobile One-Command Phone Installer
# ==============================================================================
# Installs TicketIn directly to your physical phone or emulator via ADB.
# Supports:
#   - USB Cable ADB
#   - Wireless / Wi-Fi ADB
#   - Local APK or Latest CI Build from GitHub
#
# Usage:
#   ./scripts/install-mobile.sh                  # Auto-detects APK, installs & launches
#   ./scripts/install-mobile.sh --build          # Compiles locally, then installs & launches
#   ./scripts/install-mobile.sh --remote         # Downloads latest release APK from GitHub & installs
#   ./scripts/install-mobile.sh --connect <IP>   # Connect to phone via Wi-Fi ADB
#   ./scripts/install-mobile.sh --devices        # List all detected devices
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/apk-output"
PACKAGE_NAME="com.mhhanif.ticketin"
MAIN_ACTIVITY="com.ticketin.eventgate.MainActivity"
GITHUB_REPO="mhhanif-21/Ticket-In"

# Flags
MODE="auto" # auto, build, remote, connect, devices
WIFI_TARGET=""
SPECIFIC_APK=""

# Parse arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --build|-b)
      MODE="build"
      shift
      ;;
    --remote|--ci|-r)
      MODE="remote"
      shift
      ;;
    --connect|-c)
      MODE="connect"
      WIFI_TARGET="$2"
      shift 2
      ;;
    --devices|-l)
      MODE="devices"
      shift
      ;;
    --apk|-a)
      SPECIFIC_APK="$2"
      shift 2
      ;;
    --help|-h)
      echo -e "${BOLD}${CYAN}📱 TicketIn Mobile One-Command Installer${NC}"
      echo ""
      echo "Usage: ./scripts/install-mobile.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  (default)            Install existing APK (or build if not found) & launch"
      echo "  --build, -b          Build APK locally first, then install & launch"
      echo "  --remote, --ci, -r   Download latest APK from GitHub and install"
      echo "  --connect, -c <IP>   Connect to phone via Wireless ADB (e.g. 192.168.1.50:5555)"
      echo "  --devices, -l        List all connected ADB devices"
      echo "  --apk, -a <file>     Install a specific APK file"
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
echo -e "${BOLD}${CYAN}   📲 TicketIn Mobile 1-Command Phone Installer    ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Check ADB
ADB_BIN=$(which adb 2>/dev/null || echo "")
if [[ -z "${ADB_BIN}" ]]; then
  echo -e "${RED}❌ Error: 'adb' (Android Debug Bridge) is not installed or not in PATH.${NC}"
  echo -e "To install adb on Linux:"
  echo -e "   sudo apt-get update && sudo apt-get install -y adb"
  echo -e "Or download Android SDK Platform-Tools."
  exit 1
fi

# Handle Wi-Fi ADB connect mode
if [[ "${MODE}" == "connect" ]]; then
  if [[ -z "${WIFI_TARGET}" ]]; then
    echo -e "${RED}❌ Please specify the phone's IP address (e.g. ./scripts/install-mobile.sh --connect 192.168.1.50:5555)${NC}"
    exit 1
  fi
  # Add port 5555 if missing
  if [[ "${WIFI_TARGET}" != *:* ]]; then
    WIFI_TARGET="${WIFI_TARGET}:5555"
  fi
  echo -e "${BLUE}🔌 Connecting to ${WIFI_TARGET} via Wireless ADB...${NC}"
  "${ADB_BIN}" connect "${WIFI_TARGET}"
  echo ""
  "${ADB_BIN}" devices
  exit 0
fi

# Handle devices list mode
if [[ "${MODE}" == "devices" ]]; then
  echo -e "${BLUE}🔍 Checking connected Android devices...${NC}"
  "${ADB_BIN}" devices -l
  exit 0
fi

# Detect Connected Devices
echo -e "${BLUE}🔍 Checking for connected Android devices/emulators...${NC}"
CONNECTED_DEVICES=$("${ADB_BIN}" devices | grep -v "List of devices" | grep "device$" | awk '{print $1}' || echo "")

if [[ -z "${CONNECTED_DEVICES}" ]]; then
  echo -e "${YELLOW}⚠️  No active Android device or emulator detected via ADB.${NC}"
  echo ""
  echo -e "${BOLD}Cara menghubungkan HP Anda:${NC}"
  echo -e "1. ${CYAN}Kabel USB:${NC} Aktifkan 'Developer Options' & 'USB Debugging' di HP, lalu colok kabel USB."
  echo -e "2. ${CYAN}Wireless Wi-Fi ADB:${NC} Pastikan HP & laptop di Wi-Fi yang sama, lalu jalankan:"
  echo -e "   ${BOLD}make connect-phone IP=<ip-hp-anda>${NC}"
  echo -e "   atau: ${BOLD}./scripts/install-mobile.sh --connect <ip-hp-anda>:5555${NC}"
  echo ""
  exit 1
fi

DEVICE_COUNT=$(echo "${CONNECTED_DEVICES}" | wc -l)
echo -e "${GREEN}✓ Found ${DEVICE_COUNT} connected device(s):${NC}"
for DEV in ${CONNECTED_DEVICES}; do
  MODEL=$("${ADB_BIN}" -s "${DEV}" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || echo "Android Device")
  echo -e "  📱 ${BOLD}${DEV}${NC} (${CYAN}${MODEL}${NC})"
done
echo ""

TARGET_APK=""

# 1. Specific APK passed
if [[ -n "${SPECIFIC_APK}" && -f "${SPECIFIC_APK}" ]]; then
  TARGET_APK="${SPECIFIC_APK}"
fi

# 2. Remote / CI mode
if [[ "${MODE}" == "remote" && -z "${TARGET_APK}" ]]; then
  echo -e "${BLUE}🌐 Fetching latest release APK from GitHub (${GITHUB_REPO})...${NC}"
  mkdir -p "${OUTPUT_DIR}"
  DOWNLOAD_DEST="${OUTPUT_DIR}/TicketIn-remote-latest.apk"
  
  DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/TicketIn-release.apk"
  
  echo -e "${CYAN}Downloading from: ${DOWNLOAD_URL}${NC}"
  if curl -sL --fail -o "${DOWNLOAD_DEST}" "${DOWNLOAD_URL}"; then
    echo -e "${GREEN}✓ Download complete!${NC}"
    TARGET_APK="${DOWNLOAD_DEST}"
  else
    echo -e "${YELLOW}⚠️  Could not download from latest release (maybe no release created yet).${NC}"
    echo -e "${BLUE}Trying to find local APK instead...${NC}"
  fi
fi

# 3. Build mode or auto-build if no APK exists
if [[ "${MODE}" == "build" ]]; then
  echo -e "${BLUE}🔨 Running local build script...${NC}"
  "${ROOT_DIR}/build-apk.sh" --debug
  TARGET_APK="${OUTPUT_DIR}/TicketIn-latest.apk"
fi

# 4. Auto mode: find best existing APK or build
if [[ -z "${TARGET_APK}" ]]; then
  if [[ -f "${OUTPUT_DIR}/TicketIn-latest.apk" ]]; then
    TARGET_APK="${OUTPUT_DIR}/TicketIn-latest.apk"
  elif [[ -f "${OUTPUT_DIR}/TicketIn-debug.apk" ]]; then
    TARGET_APK="${OUTPUT_DIR}/TicketIn-debug.apk"
  elif [[ -f "${OUTPUT_DIR}/TicketIn-release.apk" ]]; then
    TARGET_APK="${OUTPUT_DIR}/TicketIn-release.apk"
  elif [[ -f "${ROOT_DIR}/mobile/build/app/outputs/flutter-apk/app-debug.apk" ]]; then
    TARGET_APK="${ROOT_DIR}/mobile/build/app/outputs/flutter-apk/app-debug.apk"
  else
    echo -e "${YELLOW}ℹ️  No compiled APK found. Starting local build...${NC}"
    "${ROOT_DIR}/build-apk.sh" --debug
    TARGET_APK="${OUTPUT_DIR}/TicketIn-latest.apk"
  fi
fi

if [[ ! -f "${TARGET_APK}" ]]; then
  echo -e "${RED}❌ Error: No APK file found at ${TARGET_APK}${NC}"
  exit 1
fi

APK_FILE_NAME=$(basename "${TARGET_APK}")
APK_SIZE=$(du -h "${TARGET_APK}" | cut -f1)

echo -e "${BLUE}📦 Target APK: ${BOLD}${APK_FILE_NAME}${NC} (${APK_SIZE})"
echo ""

# Install on all connected devices
for DEV in ${CONNECTED_DEVICES}; do
  DEV_NAME=$("${ADB_BIN}" -s "${DEV}" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || echo "${DEV}")
  echo -e "${YELLOW}📲 Installing on [${DEV_NAME} (${DEV})]...${NC}"
  
  if "${ADB_BIN}" -s "${DEV}" install -r "${TARGET_APK}"; then
    echo -e "${GREEN}✓ Successfully installed on ${DEV_NAME}!${NC}"
    
    # Auto Launching
    echo -e "${CYAN}🚀 Launching TicketIn...${NC}"
    "${ADB_BIN}" -s "${DEV}" shell monkey -p "${PACKAGE_NAME}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || \
    "${ADB_BIN}" -s "${DEV}" shell am start -n "${PACKAGE_NAME}/${MAIN_ACTIVITY}" >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ App launched on ${DEV_NAME}${NC}"
  else
    echo -e "${RED}❌ Failed to install on ${DEV_NAME}.${NC}"
  fi
  echo ""
done

echo -e "${BOLD}${GREEN}🎉 Done! TicketIn is installed and running on your phone.${NC}"
