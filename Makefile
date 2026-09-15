.PHONY: help build-mobile build-mobile-release install-mobile install-mobile-build install-mobile-ci connect-phone list-devices run-mobile test-mobile test-web lint-web typecheck-web build-web deploy-web deploy-web-preview ci dev-web dev-mobile

# Colors
CYAN  := \033[0;36m
GREEN := \033[0;32m
YELLOW:= \033[1;33m
BOLD  := \033[1m
NC    := \033[0m

help: ## Show this help menu
	@echo "$(BOLD)$(CYAN)TicketIn Development & CI/CD CLI$(NC)"
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-22s$(NC) %s\n", $$1, $$2}'

# ==============================================================================
# Mobile Commands (1-Command Install & Build)
# ==============================================================================
install-mobile: ## 1-Command: Install APK to phone via ADB & launch app
	@./scripts/install-mobile.sh

install-mobile-build: ## Build debug APK locally, then auto-install to phone & launch
	@./scripts/install-mobile.sh --build

install-mobile-ci: ## Download latest APK from GitHub Release & install to phone
	@./scripts/install-mobile.sh --remote

connect-phone: ## Connect to phone wirelessly (usage: make connect-phone IP=192.168.1.50)
	@./scripts/install-mobile.sh --connect $(IP)

list-devices: ## Show connected ADB devices / emulators
	@./scripts/install-mobile.sh --devices

build-mobile: ## Build Android APK (outputs to apk-output/)
	@./build-apk.sh --debug

build-mobile-release: ## Build optimized Release APK
	@./build-apk.sh --release

run-mobile: ## Build APK, install, and launch app on connected device
	@./build-apk.sh --debug --run

test-mobile: ## Run Flutter analyzer & tests
	@cd mobile && flutter analyze lib/ && flutter test

dev-mobile: ## Start Flutter development with hot reload
	@cd mobile && flutter run

# ==============================================================================
# Web Commands (Quality, Build, Vercel Deploy)
# ==============================================================================
lint-web: ## Run ESLint on Web
	@cd web && npm run lint

typecheck-web: ## Run TypeScript typecheck on Web
	@cd web && npm run typecheck

test-web: ## Run Web linter, typecheck, and unit tests
	@cd web && npm run lint && npm run typecheck

build-web: ## Build production Web application (Next.js)
	@cd web && npm run build

deploy-web: ## Deploy Web app to Vercel (Production)
	@echo "$(BOLD)$(CYAN)Deploying Web to Vercel Production...$(NC)"
	@cd web && npx vercel --prod

deploy-web-preview: ## Deploy Web app to Vercel (Preview branch)
	@echo "$(BOLD)$(CYAN)Deploying Web to Vercel Preview...$(NC)"
	@cd web && npx vercel

dev-web: ## Start Web development server
	@cd web && npm run dev

# ==============================================================================
# Global CI Checks
# ==============================================================================
ci: ## Run all local CI quality checks (Web & Mobile)
	@echo "$(BOLD)$(CYAN)Running Local CI Checks...$(NC)"
	@echo "$(GREEN)1. Linting & Typechecking Web...$(NC)"
	@cd web && npm run lint && npm run typecheck
	@echo "$(GREEN)2. Analyzing Mobile Code...$(NC)"
	@cd mobile && flutter analyze lib/
	@echo "$(BOLD)$(GREEN)All local CI checks passed!$(NC)"
