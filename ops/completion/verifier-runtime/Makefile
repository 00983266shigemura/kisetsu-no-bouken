build-IngressFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp webhook.mjs core.mjs "$(ARTIFACTS_DIR)/"
	cp package.json package-lock.json "$(ARTIFACTS_DIR)/"
	npm ci --omit=dev --prefix "$(ARTIFACTS_DIR)" --ignore-scripts --no-audit --no-fund
build-WorkerFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp worker.mjs core.mjs github-app.mjs package.json package-lock.json merge-readiness.cjs "$(ARTIFACTS_DIR)/"
	cp ../../../scripts/completion-gate.cjs "$(ARTIFACTS_DIR)/completion-gate.cjs"
	npm ci --omit=dev --prefix "$(ARTIFACTS_DIR)" --ignore-scripts --no-audit --no-fund
