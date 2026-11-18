UUID := linux-spaces@zarrx
ZIP := build/$(UUID).shell-extension.zip

.PHONY: schemas pack install lint nested nested-45 nested-47 nested-48 nested-49 check-versions

schemas:
	glib-compile-schemas --strict extension/schemas

pack: schemas
	@# gnome-extensions 46 segfaults if --out-dir is missing, so create it first.
	mkdir -p $(CURDIR)/build
	gnome-extensions pack $(CURDIR)/extension --extra-source=$(CURDIR)/extension/src --force --out-dir=$(CURDIR)/build

install: pack
	gnome-extensions install --force $(ZIP)

lint:
	npx --yes @biomejs/biome check extension

nested:
	bash scripts/nested.sh

nested-45 nested-47 nested-48 nested-49:
	bash scripts/nested-container.sh $(subst nested-,,$@)

check-versions:
	@mkdir -p scratchpad; for v in 45 47 48 49; do \
		start=$$(date +%s); \
		bash scripts/nested-container.sh $$v check > scratchpad/check-$$v.log 2>&1; \
		echo "$$v: $$(grep -m1 'GNOME Shell' scratchpad/check-$$v.log) | $$(grep -m1 'EXTENSION STATE' scratchpad/check-$$v.log) | $$(grep -c 'JS ERROR' scratchpad/check-$$v.log) JS ERROR lines | $$(( $$(date +%s) - start ))s | log scratchpad/check-$$v.log"; \
	done
