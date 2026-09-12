# PaperDesk — build, package and install into VS Code.
#
#   make install     build, package and install into your VS Code
#   make help        list every target
#
# Extension identity comes from package.json, so nothing here needs editing
# when the version changes. Override tools or paths on the command line, e.g.
#   make install CODE=code-insiders

SHELL := /bin/bash
.DEFAULT_GOAL := help

CODE           ?= code
NPM            ?= npm
EXTENSIONS_DIR ?= $(HOME)/.vscode/extensions

pkg        = $(shell node -p "require('./package.json').$(1)")
NAME       := $(call pkg,name)
PUBLISHER  := $(call pkg,publisher)
VERSION    := $(call pkg,version)
ID         := $(PUBLISHER).$(NAME)
VSIX       := $(NAME)-$(VERSION).vsix

SOURCES    := $(shell find src media -type f) package.json package.nls.json vite.config.ts scripts/build-host.mjs README.md LICENSE

.PHONY: help deps dev build check package install uninstall reinstall where clean

help: ## Show this help
	@echo "PaperDesk $(VERSION)  ($(ID))"
	@echo
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36mmake %-10s\033[0m %s\n", $$1, $$2}'

node_modules: package.json package-lock.json
	$(NPM) install
	@touch node_modules

deps: node_modules ## Install dependencies

dev: node_modules ## Run the Vite dev server and host watcher (then press F5)
	$(NPM) run dev

build: node_modules ## Production build into dist/
	$(NPM) run build

check: node_modules ## Typecheck and lint
	$(NPM) run typecheck
	$(NPM) run lint

$(VSIX): node_modules $(SOURCES)
	$(NPM) run vsix

package: $(VSIX) ## Package an installable .vsix

install: $(VSIX) ## Build, package and install into VS Code's extensions folder
	$(CODE) --install-extension $(VSIX) --force
	@echo
	@echo "Installed $(ID) $(VERSION) into $(EXTENSIONS_DIR)/$(ID)-$(VERSION)"
	@echo "Reload any open VS Code window: Ctrl+Shift+P → Developer: Reload Window"

uninstall: ## Remove the extension from VS Code
	$(CODE) --uninstall-extension $(ID)

reinstall: uninstall ## Uninstall, then install a fresh build
	@$(MAKE) --no-print-directory install

where: ## Show where the installed extension lives
	@ls -d $(EXTENSIONS_DIR)/$(ID)-* 2>/dev/null || echo "$(ID) is not installed in $(EXTENSIONS_DIR)"

clean: ## Remove build output and packages
	rm -rf dist *.vsix
