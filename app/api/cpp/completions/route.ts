import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ completions: [] });
    }

    // Completado básico de C++ - en una implementación completa usarías clangd LSP
    const cppKeywords = [
      'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor',
      'bool', 'break', 'case', 'catch', 'char', 'char16_t', 'char32_t', 'class',
      'compl', 'const', 'constexpr', 'const_cast', 'continue', 'decltype',
      'default', 'delete', 'do', 'double', 'dynamic_cast', 'else', 'enum',
      'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto',
      'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept',
      'not', 'not_eq', 'nullptr', 'operator', 'or', 'or_eq', 'private',
      'protected', 'public', 'register', 'reinterpret_cast', 'return',
      'short', 'signed', 'sizeof', 'static', 'static_assert', 'static_cast',
      'struct', 'switch', 'template', 'this', 'thread_local', 'throw',
      'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned',
      'using', 'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq'
    ];

    const stdFunctions = [
      'cout', 'cin', 'endl', 'vector', 'string', 'map', 'set', 'array',
      'unique_ptr', 'shared_ptr', 'make_unique', 'make_shared'
    ];

    const completions = [
      ...cppKeywords.map(keyword => ({
        label: keyword,
        kind: 'keyword',
        detail: 'palabra clave',
        insertText: keyword
      })),
      ...stdFunctions.map(func => ({
        label: func,
        kind: 'function',
        detail: 'función std',
        insertText: func
      }))
    ];

    return NextResponse.json({ completions });
  } catch (error) {
    console.error('Error en API de completado de C++:', error);
    return NextResponse.json({ completions: [] });
  }
}