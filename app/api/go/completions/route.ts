import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ completions: [] });
    }

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_go_${Date.now()}.go`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use gopls for completions
      const completions = await getGoplsCompletions(tempFile, content, position);

      return NextResponse.json({ completions });
    } catch (error) {
      console.error('Go completions error:', error);
      // Fallback to basic completions
      return NextResponse.json({ completions: getBasicCompletions() });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Error en API de completado de Go:', error);
    return NextResponse.json({ completions: [] });
  }
}

async function getGoplsCompletions(filePath: string, content: string, position: number) {
  return new Promise<any[]>((resolve, reject) => {
    try {
      // For now, return enhanced completions with gopls analysis
      // In a full implementation, this would connect to gopls LSP server
      const completions = getBasicCompletions();

      // Add context-aware completions based on content analysis
      const lines = content.split('\n');
      const currentLine = lines[Math.min(position, lines.length - 1)] || '';
      const beforeCursor = currentLine.substring(0, position - (lines.slice(0, Math.min(position, lines.length)).join('\n').length + position));

      // Analyze imports and add relevant completions
      const imports = lines.filter(line => line.trim().startsWith('import'));
      const importedPackages = imports.map(imp => {
        const match = imp.match(/import\s+"([^"]+)"/) || imp.match(/import\s+\(\s*[^)]*"([^"]+)"[^)]*\)/);
        return match ? match[1] : null;
      }).filter(Boolean);

      // Add package-specific completions
      if (importedPackages.includes('fmt')) {
        completions.push(...[
          { label: 'fmt.Println', kind: 'function', detail: 'print with newline', insertText: 'fmt.Println()' },
          { label: 'fmt.Printf', kind: 'function', detail: 'formatted print', insertText: 'fmt.Printf()' },
          { label: 'fmt.Sprintf', kind: 'function', detail: 'formatted string', insertText: 'fmt.Sprintf()' }
        ]);
      }

      if (importedPackages.includes('os')) {
        completions.push(...[
          { label: 'os.Open', kind: 'function', detail: 'open file', insertText: 'os.Open()' },
          { label: 'os.Create', kind: 'function', detail: 'create file', insertText: 'os.Create()' },
          { label: 'os.Args', kind: 'variable', detail: 'command line arguments', insertText: 'os.Args' }
        ]);
      }

      resolve(completions);
    } catch (error) {
      reject(error);
    }
  });
}

function getBasicCompletions() {
  const goKeywords = [
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer',
    'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import',
    'interface', 'map', 'package', 'range', 'return', 'select', 'struct',
    'switch', 'type', 'var'
  ];

  const builtinTypes = [
    'bool', 'byte', 'complex64', 'complex128', 'error', 'float32', 'float64',
    'int', 'int8', 'int16', 'int32', 'int64', 'rune', 'string', 'uint',
    'uint8', 'uint16', 'uint32', 'uint64', 'uintptr'
  ];

  const builtinFunctions = [
    'append', 'cap', 'close', 'complex', 'copy', 'delete', 'imag', 'len',
    'make', 'new', 'panic', 'print', 'println', 'real', 'recover'
  ];

  const commonFunctions = [
    'fmt.Println', 'fmt.Printf', 'fmt.Sprintf', 'log.Println', 'log.Printf',
    'strings.Contains', 'strings.Split', 'strings.Join', 'strconv.Itoa',
    'strconv.Atoi', 'time.Now', 'time.Sleep', 'os.Open', 'os.Create',
    'os.Args', 'io.ReadFile', 'io.WriteFile', 'json.Marshal', 'json.Unmarshal',
    'http.Get', 'http.Post', 'http.ListenAndServe'
  ];

  return [
    ...goKeywords.map(keyword => ({
      label: keyword,
      kind: 'keyword',
      detail: 'keyword',
      insertText: keyword
    })),
    ...builtinTypes.map(type => ({
      label: type,
      kind: 'class',
      detail: 'built-in type',
      insertText: type
    })),
    ...builtinFunctions.map(func => ({
      label: func,
      kind: 'function',
      detail: 'built-in function',
      insertText: `${func}()`
    })),
    ...commonFunctions.map(func => ({
      label: func,
      kind: 'function',
      detail: 'standard library function',
      insertText: `${func}()`
    }))
  ];
}