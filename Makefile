# dependencies

SQLITE_AMALGAMATION = sqlite-amalgamation-3250200
SQLITE_AMALGAMATION_ZIP_URL = https://www.sqlite.org/2018/sqlite-amalgamation-3250200.zip
SQLITE_AMALGAMATION_ZIP_SHA1 = c9ff08b91a0faacabe2acb240e5dba3cf81071f3

EXTENSION_FUNCTIONS = extension-functions.c
EXTENSION_FUNCTIONS_URL = https://www.sqlite.org/contrib/download/extension-functions.c?get=25
EXTENSION_FUNCTIONS_SHA1 = c68fa706d6d9ff98608044c00212473f9c14892f

# source files

EXPORTED_FUNCTIONS_JSON = src/exported_functions.json

# temporary files

BITCODE_FILES = temp/bc/sqlite3.bc temp/bc/extension-functions.bc

# build options

CFLAGS = \
	-D_HAVE_SQLITE_CONFIG_H \
	-Isrc/c -I'deps/$(SQLITE_AMALGAMATION)'

EMFLAGS = \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s EXPORTED_FUNCTIONS=@$(EXPORTED_FUNCTIONS_JSON) \
	-s EXTRA_EXPORTED_RUNTIME_METHODS=[$(shell \
		grep -Po '(?<=declare function )\w+' src/ts/module.ts | sed -e 's/\(.*\)/"\1"/;' | paste -s -d,)] \
	-s RESERVED_FUNCTION_POINTERS=64 \
	-s WASM=1 \
	-s FORCE_FILESYSTEM=1 \
	-s DEFAULT_LIBRARY_FUNCS_TO_INCLUDE='["$$CHROMEFS", "$$IOFS", "$$NATIVEIOFS"]' \
	-lnodefs.js \
	--js-library ../emfs/library_chromefs.js \
	--js-library ../emfs/library_iofs.js \
	--js-library ../emfs/library_nativeiofs.js \
	--post-js temp/api.js \
	--post-js src/sqlite_worker.js

EMFLAGS_DEBUG = \
	-s INLINING_LIMIT=10 \
	-s ASSERTIONS=1 \
	-O3 \
	--emrun

EMFLAGS_DIST = \
	-s INLINING_LIMIT=50 \
	-s IGNORE_CLOSURE_COMPILER_ERRORS=1 \
	-Os \
	--emrun

# directories

.PHONY: all
all: dist

.PHONY: clean
clean:
	rm -rf dist debug temp

.PHONY: clean-all
clean-all:
	rm -rf dist debug temp deps cache

## cache

.PHONY: clean-cache
clean-cache:
	rm -rf cache

cache/$(SQLITE_AMALGAMATION).zip:
	mkdir -p cache
	curl -LsSf '$(SQLITE_AMALGAMATION_ZIP_URL)' -o $@

cache/$(EXTENSION_FUNCTIONS):
	mkdir -p cache
	curl -LsSf '$(EXTENSION_FUNCTIONS_URL)' -o $@

## deps

.PHONY: clean-deps
clean-deps:
	rm -rf deps

.PHONY: deps
deps: deps/$(SQLITE_AMALGAMATION) deps/$(EXTENSION_FUNCTIONS) deps/$(EXPORTED_FUNCTIONS)

deps/$(SQLITE_AMALGAMATION): cache/$(SQLITE_AMALGAMATION).zip
	mkdir -p deps
	echo '$(SQLITE_AMALGAMATION_ZIP_SHA1)' 'cache/$(SQLITE_AMALGAMATION).zip' | sha1sum -c
	rm -rf $@
	unzip 'cache/$(SQLITE_AMALGAMATION).zip' -d deps/
	touch $@

deps/$(EXTENSION_FUNCTIONS): cache/$(EXTENSION_FUNCTIONS)
	mkdir -p deps
	echo '$(EXTENSION_FUNCTIONS_SHA1)' 'cache/$(EXTENSION_FUNCTIONS)' | sha1sum -c
	cp 'cache/$(EXTENSION_FUNCTIONS)' $@

## temp

.PHONY: clean-temp
clean-temp:
	rm -rf temp

temp/bc/shell.bc: deps/$(SQLITE_AMALGAMATION) src/c/config.h
	mkdir -p temp/bc
	emcc $(CFLAGS) 'deps/$(SQLITE_AMALGAMATION)/shell.c' -o $@

temp/bc/sqlite3.bc: deps/$(SQLITE_AMALGAMATION) src/c/config.h
	mkdir -p temp/bc
	emcc $(CFLAGS) -s LINKABLE=1 'deps/$(SQLITE_AMALGAMATION)/sqlite3.c' -o $@

temp/bc/extension-functions.bc: deps/$(EXTENSION_FUNCTIONS) src/c/config.h
	mkdir -p temp/bc
	emcc $(CFLAGS) -s LINKABLE=1 'deps/$(EXTENSION_FUNCTIONS)' -o $@

temp/api.js: $(wildcard src/ts/*)
	tsc

## debug
.PHONY: clean-debug
clean-debug:
	rm -rf debug

.PHONY: debug
debug: debug/sqlite3.js debug/index.html

.PHONY: run-debug
run-debug: debug
	emrun --no_browser debug/index.html

debug/sqlite3.html: $(BITCODE_FILES) $(EXPORTED_FUNCTIONS_JSON) temp/api.js
	mkdir -p debug
	emcc $(EMFLAGS) $(EMFLAGS_DEBUG) $(BITCODE_FILES) -o $@

debug/sqlite3.js: $(BITCODE_FILES) $(EXPORTED_FUNCTIONS_JSON) temp/api.js src/sqlite_worker.js ../emfs/library_chromefs.js ../emfs/library_iofs.js ../emfs/library_nativeiofs.js
	mkdir -p debug
	emcc $(EMFLAGS) $(EMFLAGS_DEBUG) $(BITCODE_FILES) -o $@

debug/sqlite_client.js: src/sqlite_client.js
	cp $< $@

debug/benchmark.js: src/benchmark.js
	cp $< $@

debug/index.html: src/index.html debug/sqlite_client.js debug/benchmark.js
	cp $< $@

## dist

.PHONY: clean-dist
clean-dist:
	rm -rf dist

.PHONY: dist
dist: dist/sqlite3.js dist/index.html

.PHONY: run
run: dist
	emrun --no_browser dist/index.html

dist/sqlite3.html: $(BITCODE_FILES) $(EXPORTED_FUNCTIONS_JSON) temp/api.js
	mkdir -p dist
	emcc $(EMFLAGS) $(EMFLAGS_DIST) $(BITCODE_FILES) -o $@

dist/sqlite3.js: $(BITCODE_FILES) $(EXPORTED_FUNCTIONS_JSON) temp/api.js src/sqlite_worker.js
	mkdir -p dist
	emcc $(EMFLAGS) $(EMFLAGS_DIST) $(BITCODE_FILES) -o $@

dist/sqlite_client.js: src/sqlite_client.js
	cp $< $@

dist/benchmark.js: src/benchmark.js
	cp $< $@

dist/index.html: src/index.html dist/sqlite_client.js dist/benchmark.js
	cp $< $@
