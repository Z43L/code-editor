import { NextRequest, NextResponse } from 'next/server';
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
    const tempFile = path.join(tempDir, `temp_java_${Date.now()}.java`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use enhanced Java completions
      const completions = await getJavaCompletions(tempFile, content, position);

      return NextResponse.json({ completions });
    } catch (error) {
      console.error('Java completions error:', error);
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
    console.error('Error en API de completado de Java:', error);
    return NextResponse.json({ completions: [] });
  }
}

async function getJavaCompletions(filePath: string, content: string, position: number) {
  return new Promise<any[]>((resolve, reject) => {
    try {
      // Enhanced completions with context analysis
      const completions = getBasicCompletions();

      // Add context-aware completions based on content analysis
      const lines = content.split('\n');
      const currentLine = lines[Math.min(position, lines.length - 1)] || '';
      const beforeCursor = currentLine.substring(0, position - (lines.slice(0, Math.min(position, lines.length)).join('\n').length + position));

      // Analyze imports and add relevant completions
      const imports = lines.filter(line => line.trim().startsWith('import'));
      const importedPackages = imports.map(imp => {
        const match = imp.match(/import\s+([^;]+);/);
        return match ? match[1] : null;
      }).filter(Boolean);

      // Add package-specific completions
      if (importedPackages.some(pkg => pkg && pkg.includes('java.util'))) {
        completions.push(...[
          { label: 'ArrayList', kind: 'class', detail: 'java.util.ArrayList', insertText: 'ArrayList<>()' },
          { label: 'HashMap', kind: 'class', detail: 'java.util.HashMap', insertText: 'HashMap<>()' },
          { label: 'HashSet', kind: 'class', detail: 'java.util.HashSet', insertText: 'HashSet<>()' },
          { label: 'Arrays.asList', kind: 'method', detail: 'Arrays.asList()', insertText: 'Arrays.asList()' },
          { label: 'Collections.sort', kind: 'method', detail: 'Collections.sort()', insertText: 'Collections.sort()' }
        ]);
      }

      if (importedPackages.some(pkg => pkg && pkg.includes('java.io'))) {
        completions.push(...[
          { label: 'File', kind: 'class', detail: 'java.io.File', insertText: 'File' },
          { label: 'FileReader', kind: 'class', detail: 'java.io.FileReader', insertText: 'FileReader' },
          { label: 'FileWriter', kind: 'class', detail: 'java.io.FileWriter', insertText: 'FileWriter' },
          { label: 'BufferedReader', kind: 'class', detail: 'java.io.BufferedReader', insertText: 'BufferedReader' }
        ]);
      }

      if (importedPackages.some(pkg => pkg && pkg.includes('java.lang'))) {
        completions.push(...[
          { label: 'String', kind: 'class', detail: 'java.lang.String', insertText: 'String' },
          { label: 'Integer', kind: 'class', detail: 'java.lang.Integer', insertText: 'Integer' },
          { label: 'System.out.println', kind: 'method', detail: 'System.out.println()', insertText: 'System.out.println()' }
        ]);
      }

      resolve(completions);
    } catch (error) {
      reject(error);
    }
  });
}

function getBasicCompletions() {
  const javaKeywords = [
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
    'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
    'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
    'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
    'package', 'private', 'protected', 'public', 'return', 'short', 'static',
    'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
    'transient', 'try', 'void', 'volatile', 'while'
  ];

  const primitiveTypes = [
    'boolean', 'byte', 'char', 'double', 'float', 'int', 'long', 'short'
  ];

  const commonClasses = [
    'String', 'Object', 'Integer', 'Double', 'Boolean', 'ArrayList', 'HashMap',
    'HashSet', 'LinkedList', 'TreeMap', 'TreeSet', 'Vector', 'Stack',
    'System', 'Math', 'Arrays', 'Collections', 'Scanner', 'PrintWriter',
    'File', 'Exception', 'RuntimeException', 'IOException', 'NullPointerException'
  ];

  const commonMethods = [
    'equals', 'hashCode', 'toString', 'clone', 'getClass', 'notify', 'notifyAll', 'wait',
    'length', 'charAt', 'substring', 'indexOf', 'lastIndexOf', 'replace', 'split', 'trim',
    'parseInt', 'parseDouble', 'valueOf', 'toLowerCase', 'toUpperCase',
    'add', 'remove', 'get', 'set', 'size', 'isEmpty', 'contains', 'clear',
    'println', 'print', 'printf', 'readLine', 'next', 'nextInt', 'nextDouble',
    'sin', 'cos', 'tan', 'sqrt', 'pow', 'abs', 'max', 'min', 'random',
    'sort', 'binarySearch', 'fill', 'copyOf', 'asList'
  ];

  return [
    ...javaKeywords.map(keyword => ({
      label: keyword,
      kind: 'keyword',
      detail: 'keyword',
      insertText: keyword
    })),
    ...primitiveTypes.map(type => ({
      label: type,
      kind: 'type',
      detail: 'primitive type',
      insertText: type
    })),
    ...commonClasses.map(cls => ({
      label: cls,
      kind: 'class',
      detail: `java.lang.${cls}`,
      insertText: cls
    })),
    ...commonMethods.map(method => ({
      label: method,
      kind: 'method',
      detail: 'method',
      insertText: `${method}()`
    }))
  ];
}