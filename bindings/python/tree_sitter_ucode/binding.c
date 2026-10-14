#include <Python.h>

typedef struct TSLanguage TSLanguage;

TSLanguage *tree_sitter_ucode(void);
TSLanguage *tree_sitter_ucode_markup(void);
TSLanguage *tree_sitter_ucdocs(void);

static PyObject* _binding_language_ucode(PyObject *Py_UNUSED(self), PyObject *Py_UNUSED(args)) {
    return PyCapsule_New(tree_sitter_ucode(), "tree_sitter.Language", NULL);
}

static PyObject* _binding_language_ucode_markup(PyObject *Py_UNUSED(self), PyObject *Py_UNUSED(args)) {
    return PyCapsule_New(tree_sitter_ucode_markup(), "tree_sitter.Language", NULL);
}

static PyObject* _binding_language_ucdocs(PyObject *Py_UNUSED(self), PyObject *Py_UNUSED(args)) {
    return PyCapsule_New(tree_sitter_ucdocs(), "tree_sitter.Language", NULL);
}

static struct PyModuleDef_Slot slots[] = {
#ifdef Py_GIL_DISABLED
    {Py_mod_gil, Py_MOD_GIL_NOT_USED},
#endif
    {0, NULL}
};

static PyMethodDef methods[] = {
    {"language_ucode", _binding_language_ucode, METH_NOARGS,
     "Get the tree-sitter language for ucode scripts."},
    {"language_ucode_markup", _binding_language_ucode_markup, METH_NOARGS,
     "Get the tree-sitter language for ucode templates."},
    {"language_ucdocs", _binding_language_ucdocs, METH_NOARGS,
     "Get the tree-sitter language for ucode doc comments."},
    {NULL, NULL, 0, NULL}
};

static struct PyModuleDef module = {
    .m_base = PyModuleDef_HEAD_INIT,
    .m_name = "_binding",
    .m_doc = NULL,
    .m_size = 0,
    .m_methods = methods,
    .m_slots = slots,
};

PyMODINIT_FUNC PyInit__binding(void) {
    return PyModuleDef_Init(&module);
}
