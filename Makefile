HOMEPAGE_URL := https://github.com/m00qek/tree-sitter-ucode
VERSION := 0.8.0

# One library per grammar: tree-sitter-ucode, tree-sitter-ucode-markup and
# tree-sitter-ucdocs. Unlike the tree-sitter scaffold, nothing here regenerates
# the parsers: <grammar>/src is committed, and regenerating needs the CLI plus
# Node for common/define-grammar.js (`npm run build`).
GRAMMARS := ucode ucode-markup ucdocs
dir_ucode := ucode
dir_ucode-markup := ucode_markup
dir_ucdocs := ucdocs

# install directory layout
PREFIX ?= /usr/local
DATADIR ?= $(PREFIX)/share
INCLUDEDIR ?= $(PREFIX)/include
LIBDIR ?= $(PREFIX)/lib
BINDIR ?= $(PREFIX)/bin
PCLIBDIR ?= $(LIBDIR)/pkgconfig

# flags
ARFLAGS ?= rcs
override CFLAGS += -std=c11 -fPIC

# ABI versioning
SONAME_MAJOR = $(shell sed -n 's/\#define LANGUAGE_VERSION //p' ucode/src/parser.c)
SONAME_MINOR = $(word 1,$(subst ., ,$(VERSION)))

# OS-specific bits
MACHINE := $(shell $(CC) -dumpmachine)

ifneq ($(findstring darwin,$(MACHINE)),)
	SOEXT = dylib
	SOEXTVER_MAJOR = $(SONAME_MAJOR).$(SOEXT)
	SOEXTVER = $(SONAME_MAJOR).$(SONAME_MINOR).$(SOEXT)
	LINKSHARED = -dynamiclib -Wl,-install_name,$(LIBDIR)/lib$(1).$(SOEXTVER),-rpath,@executable_path/../Frameworks
else ifneq ($(findstring mingw32,$(MACHINE)),)
	SOEXT = dll
	LINKSHARED = -s -shared -Wl,--out-implib,lib$(1).dll.a
else
	SOEXT = so
	SOEXTVER_MAJOR = $(SOEXT).$(SONAME_MAJOR)
	SOEXTVER = $(SOEXT).$(SONAME_MAJOR).$(SONAME_MINOR)
	LINKSHARED = -shared -Wl,-soname,lib$(1).$(SOEXTVER)
ifneq ($(filter $(shell uname),FreeBSD NetBSD DragonFly),)
	PCLIBDIR := $(PREFIX)/libdata/pkgconfig
endif
endif

# $(call pc_sed): fill in a bindings/c/*.pc.in template.
pc_sed = sed -e 's|@PROJECT_VERSION@|$(VERSION)|' \
	-e 's|@CMAKE_INSTALL_LIBDIR@|$(LIBDIR:$(PREFIX)/%=%)|' \
	-e 's|@CMAKE_INSTALL_INCLUDEDIR@|$(INCLUDEDIR:$(PREFIX)/%=%)|' \
	-e 's|@PROJECT_HOMEPAGE_URL@|$(HOMEPAGE_URL)|' \
	-e 's|@CMAKE_INSTALL_PREFIX@|$(PREFIX)|'

# $(call grammar,<name>): the build and install rules for tree-sitter-<name>.
define grammar
LIB_$(1) := tree-sitter-$(1)
SRC_$(1) := $(dir_$(1))/src
OBJS_$(1) := $$(SRC_$(1))/parser.o $$(SRC_$(1))/scanner.o

# The shared common/scanner.h includes "tree_sitter/parser.h", which GCC/Clang
# resolve via the include path, not relative to the includer.
$$(SRC_$(1))/%.o: $$(SRC_$(1))/%.c
	$$(CC) $$(CPPFLAGS) $$(CFLAGS) -I$$(SRC_$(1)) -c $$< -o $$@

# The code grammars' scanner.c only #includes common/scanner.h, where the
# scanner lives.
$$(SRC_$(1))/scanner.o: common/scanner.h

lib$$(LIB_$(1)).a: $$(OBJS_$(1))
	$$(AR) $$(ARFLAGS) $$@ $$^

lib$$(LIB_$(1)).$$(SOEXT): $$(OBJS_$(1))
	$$(CC) $$(LDFLAGS) $$(call LINKSHARED,$$(LIB_$(1))) $$^ $$(LDLIBS) -o $$@
ifneq ($$(STRIP),)
	$$(STRIP) $$@
endif

$$(LIB_$(1)).pc: bindings/c/$$(LIB_$(1)).pc.in
	$$(call pc_sed) $$< > $$@

all: lib$$(LIB_$(1)).a lib$$(LIB_$(1)).$$(SOEXT) $$(LIB_$(1)).pc

install-$(1): lib$$(LIB_$(1)).a lib$$(LIB_$(1)).$$(SOEXT)
	install -d '$$(DESTDIR)$$(DATADIR)'/tree-sitter/queries/$(dir_$(1)) '$$(DESTDIR)$$(INCLUDEDIR)'/tree_sitter '$$(DESTDIR)$$(PCLIBDIR)' '$$(DESTDIR)$$(LIBDIR)'
	install -m644 bindings/c/tree_sitter/$$(LIB_$(1)).h '$$(DESTDIR)$$(INCLUDEDIR)'/tree_sitter/$$(LIB_$(1)).h
	# Generated here, not copied: the .pc built by `all` has the PREFIX of
	# that run, and `make install PREFIX=…` must not install a stale one.
	$$(call pc_sed) bindings/c/$$(LIB_$(1)).pc.in > '$$(DESTDIR)$$(PCLIBDIR)'/$$(LIB_$(1)).pc
	install -m644 lib$$(LIB_$(1)).a '$$(DESTDIR)$$(LIBDIR)'/lib$$(LIB_$(1)).a
ifneq ($$(findstring mingw32,$$(MACHINE)),)
	install -d '$$(DESTDIR)$$(BINDIR)'
	install -m755 lib$$(LIB_$(1)).dll '$$(DESTDIR)$$(BINDIR)'/lib$$(LIB_$(1)).dll
	install -m755 lib$$(LIB_$(1)).dll.a '$$(DESTDIR)$$(LIBDIR)'/lib$$(LIB_$(1)).dll.a
else
	install -m755 lib$$(LIB_$(1)).$$(SOEXT) '$$(DESTDIR)$$(LIBDIR)'/lib$$(LIB_$(1)).$$(SOEXTVER)
	cd '$$(DESTDIR)$$(LIBDIR)' && ln -sf lib$$(LIB_$(1)).$$(SOEXTVER) lib$$(LIB_$(1)).$$(SOEXTVER_MAJOR)
	cd '$$(DESTDIR)$$(LIBDIR)' && ln -sf lib$$(LIB_$(1)).$$(SOEXTVER_MAJOR) lib$$(LIB_$(1)).$$(SOEXT)
endif
	install -m644 $(dir_$(1))/queries/*.scm '$$(DESTDIR)$$(DATADIR)'/tree-sitter/queries/$(dir_$(1))

uninstall-$(1):
	$$(RM) '$$(DESTDIR)$$(LIBDIR)'/lib$$(LIB_$(1)).a \
		'$$(DESTDIR)$$(LIBDIR)'/lib$$(LIB_$(1)).$$(SOEXTVER) \
		'$$(DESTDIR)$$(LIBDIR)'/lib$$(LIB_$(1)).$$(SOEXTVER_MAJOR) \
		'$$(DESTDIR)$$(LIBDIR)'/lib$$(LIB_$(1)).$$(SOEXT) \
		'$$(DESTDIR)$$(INCLUDEDIR)'/tree_sitter/$$(LIB_$(1)).h \
		'$$(DESTDIR)$$(PCLIBDIR)'/$$(LIB_$(1)).pc
	$$(RM) -r '$$(DESTDIR)$$(DATADIR)'/tree-sitter/queries/$(dir_$(1))

clean-$(1):
	$$(RM) $$(OBJS_$(1)) $$(LIB_$(1)).pc lib$$(LIB_$(1)).a lib$$(LIB_$(1)).$$(SOEXT) lib$$(LIB_$(1)).dll.a
endef

all:

$(foreach g,$(GRAMMARS),$(eval $(call grammar,$(g))))

install: $(addprefix install-,$(GRAMMARS))
uninstall: $(addprefix uninstall-,$(GRAMMARS))
clean: $(addprefix clean-,$(GRAMMARS))

test:
	node scripts/run-tests.js

# Link-and-load test of the C libraries: install into .build/c-test, build
# bindings/c/test.c from the installed headers, pkg-config files and shared
# libraries, then parse a sample per grammar and compile every installed
# query. Needs the tree-sitter runtime (0.25 or newer), found by pkg-config
# unless TS_CFLAGS / TS_LIBS are given.
TS_CFLAGS ?= $(shell pkg-config --cflags tree-sitter)
TS_LIBS ?= $(shell pkg-config --libs tree-sitter)
C_TEST := $(CURDIR)/.build/c-test
test-c: all
	$(RM) -r '$(C_TEST)'
	$(MAKE) install PREFIX='$(C_TEST)'
	$(CC) -std=c11 -Wall -Wextra bindings/c/test.c -o '$(C_TEST)/test' $(TS_CFLAGS) \
		$$(PKG_CONFIG_PATH='$(C_TEST)/lib/pkgconfig' pkg-config --cflags --libs \
			tree-sitter-ucode tree-sitter-ucode-markup tree-sitter-ucdocs) \
		$(TS_LIBS) -Wl,-rpath,'$(C_TEST)/lib'
	'$(C_TEST)/test' '$(C_TEST)/share/tree-sitter/queries'

.PHONY: all install uninstall clean test test-c \
	$(addprefix install-,$(GRAMMARS)) $(addprefix uninstall-,$(GRAMMARS)) $(addprefix clean-,$(GRAMMARS))
