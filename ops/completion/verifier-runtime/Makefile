build-IngressFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp webhook.mjs core.mjs "$(ARTIFACTS_DIR)/"
	cp package.json "$(ARTIFACTS_DIR)/"
	npm install --omit=dev --prefix "$(ARTIFACTS_DIR)" --package-lock=false --ignore-scripts --no-audit --no-fund
build-WorkerFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp worker.mjs core.mjs github-app.mjs package.json "$(ARTIFACTS_DIR)/"
	cp ../../../scripts/completion-gate.cjs "$(ARTIFACTS_DIR)/completion-gate.cjs"
	npm install --omit=dev --prefix "$(ARTIFACTS_DIR)" --package-lock=false --ignore-scripts --no-audit --no-fund
