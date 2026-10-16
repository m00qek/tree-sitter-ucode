-- Check the Neovim indents, folds and text objects in a real Neovim, with the
-- plugins that read them: nvim-treesitter (main branch: indentexpr) and
-- nvim-treesitter-textobjects (main branch). Grammars come from
-- .build/parsers/ (`npm run build` or `node scripts/run-tests.js --build-only`
-- first) and queries from <grammar>/queries/.
--
--   nvim --headless --clean -l scripts/check-nvim-queries.lua \
--     <nvim-treesitter checkout> <nvim-treesitter-textobjects checkout>
--
-- Exits 1 if any case fails.

local root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':p:h:h')
local nts, tso = arg[1], arg[2]
if not nts or not tso then
  io.stderr:write('usage: nvim --headless --clean -l scripts/check-nvim-queries.lua <nvim-treesitter> <nvim-treesitter-textobjects>\n')
  os.exit(2)
end

-- A runtime directory holding only this checkout's parsers and queries.
local rtp = vim.fn.tempname()
vim.fn.mkdir(rtp .. '/parser', 'p')
vim.fn.mkdir(rtp .. '/queries', 'p')
for _, lang in ipairs({ 'ucode', 'ucode_markup', 'ucdocs' }) do
  local lib = root .. '/.build/parsers/' .. lang .. '.so'
  if vim.fn.filereadable(lib) == 0 then
    io.stderr:write(lib .. ' not found: build the parsers first\n')
    os.exit(2)
  end
  vim.uv.fs_symlink(lib, rtp .. '/parser/' .. lang .. '.so')
  vim.uv.fs_symlink(root .. '/' .. lang .. '/queries', rtp .. '/queries/' .. lang)
  vim.treesitter.language.register(lang, lang)
end
vim.opt.rtp:prepend(tso)
vim.opt.rtp:prepend(nts)
vim.opt.rtp:prepend(rtp)
-- What startup would source: nvim-treesitter's plugin/ registers predicates
-- its queries (and these) use, such as kind-eq?.
vim.cmd('runtime! plugin/**/*.lua')

local shared = require('nvim-treesitter-textobjects.shared')
local failed = false

local function report(ok, name, want, got)
  if ok then
    print(string.format('ok    %-52s %s', name, want))
  else
    print(string.format('FAIL  %-52s expected %s, got %s', name, want, got))
    failed = true
  end
end

-- A fresh buffer in `lang` holding `text`; returns its number.
local function open(lang, text)
  vim.cmd('enew!')
  local buf = vim.api.nvim_get_current_buf()
  vim.bo[buf].bufhidden = 'wipe'
  vim.bo[buf].shiftwidth = 2
  vim.bo[buf].expandtab = true
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(text, '\n'))
  vim.bo[buf].filetype = lang
  vim.treesitter.start(buf, lang)
  vim.bo[buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
  return buf
end

-- Press `o` on `line` and type `typed`; the new line must be indented `want`.
local function indent(lang, line, want, name, text, typed)
  local buf = open(lang, text)
  vim.api.nvim_win_set_cursor(0, { line, 0 })
  vim.cmd('normal! o' .. (typed or 'X'))
  -- Re-indent a typed closer: Neovim only does so itself for the keys in
  -- 'indentkeys' (`}` is there by default, `endif` is not).
  if typed then vim.cmd('normal! ==') end
  local got = vim.fn.indent(line + 1)
  report(got == want, 'indent: ' .. name, want, got)
  vim.api.nvim_buf_delete(buf, { force = true })
end

-- Re-indenting the whole of a well-indented `text` (gg=G) must not change it.
local function reindent(lang, name, text)
  local buf = open(lang, text)
  vim.cmd('silent normal! gg=G')
  local got = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), '\n')
  local bad = '(unchanged)'
  if got ~= text then
    local want_lines, got_lines = vim.split(text, '\n'), vim.split(got, '\n')
    for i = 1, #want_lines do
      if want_lines[i] ~= got_lines[i] then
        bad = string.format('line %d %q', i, got_lines[i] or '')
        break
      end
    end
  end
  report(got == text, 'reindent: ' .. name, '(unchanged)', bad)
  vim.api.nvim_buf_delete(buf, { force = true })
end

-- The fold level of each line.
local function folds(lang, want, name, text)
  local buf = open(lang, text)
  vim.wo.foldmethod = 'expr'
  vim.wo.foldexpr = 'v:lua.vim.treesitter.foldexpr()'
  vim.treesitter.get_parser(buf):parse()
  vim.cmd('normal! zx')
  local got = {}
  for l = 1, vim.api.nvim_buf_line_count(buf) do
    got[#got + 1] = vim.fn.foldlevel(l)
  end
  local w, g = table.concat(want, ''), table.concat(got, '')
  report(w == g, 'folds: ' .. name, w, g)
  vim.api.nvim_buf_delete(buf, { force = true })
end

-- `|` in `text` marks the cursor; the text object must select `want`.
local function textobject(lang, capture, want, name, text)
  local at = text:find('|', 1, true)
  local src = text:sub(1, at - 1) .. text:sub(at + 1)
  local buf = open(lang, src)
  local before = src:sub(1, at - 1)
  local row = select(2, before:gsub('\n', '')) + 1
  local col = #before - (before:match('.*\n()') or 1) + 1
  local r = shared.textobject_at_point(capture, 'textobjects', buf, { row, col })
  local got = r and src:sub(r[3] + 1, r[6]) or '(nothing)'
  report(got == want, 'textobject ' .. capture .. ': ' .. name, vim.inspect(want), vim.inspect(got))
  vim.api.nvim_buf_delete(buf, { force = true })
end

-- Indentation (the same cases as scripts/check-helix-indents.sh, plus
-- closing delimiters and end keywords typed on a new line).
indent('ucode', 1, 2, 'brace block body', 'if (a) {\n}')
indent('ucode', 1, 2, 'object literal', 'let o = {\n};')
indent('ucode', 1, 2, 'call arguments', 'foo(\n);')
indent('ucode', 2, 4, 'nested brace block', 'if (a) {\n  if (b) {\n  }\n}')
indent('ucode', 3, 0, 'after a closing brace', 'if (a) {\n  x();\n}')
indent('ucode', 2, 0, 'after a statement', 'x = 1\ny = 2')
indent('ucode', 3, 4, 'switch case body', 'switch (x) {\n  case 1:\n    a();\n}')
indent('ucode', 2, 4, 'empty switch case', 'switch (x) {\n  case 1:\n}')
indent('ucode', 2, 0, 'typed } closes a block', 'if (a) {\n  x();', '}')
indent('ucode', 2, 0, 'typed ] closes an array', 'let a = [\n  1,', ']')
indent('ucode', 2, 0, 'typed ) closes arguments', 'foo(\n  1,', ')')
indent('ucode', 1, 2, 'alt-syntax if body', 'if (a):\nendif')
indent('ucode', 2, 0, 'typed endif', 'if (a):\n  x();', 'endif')
indent('ucode', 2, 0, 'typed else in alt-syntax if', 'if (a):\n  x();', 'else')
indent('ucode', 1, 2, 'alt-syntax for body', 'for (x in xs):\nendfor')
indent('ucode', 1, 2, 'colon-form function body', 'function f():\nendfunction')
indent('ucode', 1, 2, 'braceless if, end of file', 'if (a)')
indent('ucode', 1, 2, 'braceless if, code below', 'if (a)\nfoo();')
indent('ucode', 3, 2, 'braceless else, end of file', 'if (a)\n  x();\nelse')
indent('ucode', 1, 2, 'braceless while', 'while (a)')
indent('ucode', 1, 2, 'braceless for-in', 'for (x in xs)')
indent('ucode', 1, 0, 'after a one-line if', 'if (a) x();')
indent('ucode', 2, 0, 'after a braceless if body', 'if (a)\n  x();')
indent('ucode', 4, 0, 'after a braceless else body', 'if (a)\n  x();\nelse\n  y();')

reindent('ucode', 'a script', table.concat({
  'import { a, b } from "./m.uc";',
  '',
  '/**',
  ' * Doc.',
  ' */',
  'export function f(x, y) {',
  '  let o = {',
  '    k: [',
  '      1,',
  '      2,',
  '    ],',
  '    g: function() {',
  '      return x;',
  '    },',
  '  };',
  '  if (x)',
  '    y = 1;',
  '  else if (y) {',
  '    y = 2;',
  '  } else',
  '    y = 3;',
  '  switch (y) {',
  '    case 1:',
  '      break;',
  '    default:',
  '      foo(',
  '        a,',
  '        b,',
  '      );',
  '  }',
  '  for (let k, v in o)',
  '    print(k);',
  '  while (x)',
  '    x--;',
  '  return o;',
  '};',
  'if (a):',
  '  b();',
  'elif (c):',
  '  d();',
  'else',
  '  e();',
  'endif',
  'for (x in xs):',
  '  print(x);',
  'endfor',
  'function g():',
  '  return 1;',
  'endfunction',
  'if (a) {',
  '  x();',
  '}',
  'else {',
  '  y();',
  '}',
  'try {',
  '  x();',
  '} catch (e) {',
  '  warn(e);',
  '}',
}, '\n'))
reindent('ucode_markup', 'a template', table.concat({
  '{% if (a) { %}',
  '  text',
  '{% } %}',
  '{% for (x in xs): %}',
  '  {{ x }}',
  '{% endfor %}',
}, '\n'))

-- Folds
folds('ucode', { 1, 1, 1, 0 }, 'a brace block', 'if (a) {\n  x();\n}\ny();')
folds('ucode', { 1, 1, 1, 0 }, 'a run of imports', 'import a from "a";\nimport b from "b";\nimport c from "c";\nlet x = 1;')
folds('ucode', { 1, 1, 1, 0 }, 'a multi-line doc comment', '/**\n * doc\n */\nlet x = 1;')
folds('ucode', { 1, 2, 2, 2, 2, 2, 1 }, 'switch cases',
  'switch (x) {\n  case 1:\n    a();\n    break;\n  default:\n    b();\n}')
folds('ucode', { 1, 1, 1 }, 'an alt-syntax if', 'if (a):\n  x();\nendif')

-- Text objects
textobject('ucode', '@parameter.inner', 'b', 'middle parameter', 'function f(a, |b, c) {}')
textobject('ucode', '@parameter.outer', ', b', 'middle parameter with its comma', 'function f(a, |b, c) {}')
textobject('ucode', '@parameter.outer', 'a,', 'first parameter with its comma', 'function f(|a, b) {}')
textobject('ucode', '@parameter.inner', 'y + 1', 'call argument', 'foo(x, |y + 1);')
textobject('ucode', '@parameter.outer', ', y + 1', 'call argument with its comma', 'foo(x, |y + 1);')
textobject('ucode', '@parameter.inner', '2', 'array element', 'let a = [1, |2, 3];')
textobject('ucode', '@parameter.inner', 'b: 2', 'object entry', 'let o = { a: 1, |b: 2 };')
textobject('ucode', '@block.inner', 'x();\n  y();', 'the inside of a block', 'if (a) {\n  |x();\n  y();\n}')
textobject('ucode', '@block.outer', '{\n  x();\n  y();\n}', 'a block with its braces', 'if (a) {\n  |x();\n  y();\n}')
textobject('ucode', '@function.inner', 'return a;', 'a function body', 'function f(a) {\n  |return a;\n}')
textobject('ucode', '@function.inner', 'x();\n  y();', 'a colon-form function body', 'function f():\n  |x();\n  y();\nendfunction')
textobject('ucode', '@loop.inner', 'x();\n  y();', 'an alt-syntax loop body', 'for (k in o):\n  |x();\n  y();\nendfor')
textobject('ucode', '@conditional.inner', 'x();', 'an if body', 'if (a) {\n  |x();\n}')
textobject('ucode', '@call.inner', 'a, b', 'call arguments', 'foo(|a, b);')
textobject('ucode', '@assignment.rhs', '1 + 2', 'right side of an assignment', 'x = |1 + 2;')
textobject('ucode', '@return.inner', 'a + b', 'returned value', 'function f() { return |a + b; }')
textobject('ucode', '@comment.outer', '/** doc */', 'a doc comment', '/** |doc */\nlet x;')

os.exit(failed and 1 or 0)
