#include <napi.h>

typedef struct TSLanguage TSLanguage;

extern "C" TSLanguage *tree_sitter_ucode();
extern "C" TSLanguage *tree_sitter_ucode_markup();
extern "C" TSLanguage *tree_sitter_ucdocs();

// "tree-sitter", "language" hashed with BLAKE2
const napi_type_tag LANGUAGE_TYPE_TAG = {
    0x8AF2E5212AD58ABF, 0xD5006CAD83ABBA16
};

static Napi::External<TSLanguage> Language(Napi::Env env, TSLanguage *language) {
    auto external = Napi::External<TSLanguage>::New(env, language);
    external.TypeTag(&LANGUAGE_TYPE_TAG);
    return external;
}

static Napi::Object Grammar(Napi::Env env, TSLanguage *language) {
    auto grammar = Napi::Object::New(env);
    grammar["language"] = Language(env, language);
    return grammar;
}

// The package itself is the ucode grammar; all three are also exported by name.
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports["language"] = Language(env, tree_sitter_ucode());
    exports["ucode"] = Grammar(env, tree_sitter_ucode());
    exports["ucode_markup"] = Grammar(env, tree_sitter_ucode_markup());
    exports["ucdocs"] = Grammar(env, tree_sitter_ucdocs());
    return exports;
}

NODE_API_MODULE(tree_sitter_ucode_binding, Init)
