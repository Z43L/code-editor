import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ signatureHelp: null });
    }

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_python_${Date.now()}.py`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use pyright for signature help
      const signatureHelp = await getPyrightSignatureHelp(tempFile, content, position);

      return NextResponse.json({ signatureHelp });
    } catch (error) {
      console.error('Python signature help error:', error);
      return NextResponse.json({ signatureHelp: null });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Python signature help Error en API:', error);
    return NextResponse.json({ signatureHelp: null });
  }
}

async function getPyrightSignatureHelp(filePath: string, content: string, position: number) {
  return new Promise<any>((resolve, reject) => {
    try {
      // Calculate line and character from position
      const lines = content.substring(0, position).split('\n');
      const line = lines.length - 1;
      const character = lines[lines.length - 1].length;

      // Get the current line
      const currentLine = content.split('\n')[line] || '';

      // Check if we're inside a function call
      const beforeCursor = currentLine.substring(0, character);
      const functionCallMatch = beforeCursor.match(/(\w+)\s*\(\s*([^)]*)$/);

      if (functionCallMatch) {
        const functionName = functionCallMatch[1];
        const argsSoFar = functionCallMatch[2];

        const signature = getFunctionSignature(functionName);
        if (signature) {
          // Calculate active parameter
          const paramCount = argsSoFar.split(',').length - (argsSoFar.endsWith(',') ? 0 : 1);

          resolve({
            signatures: [signature],
            activeSignature: 0,
            activeParameter: Math.max(0, paramCount)
          });
          return;
        }
      }

      resolve(null);
    } catch (error) {
      reject(error);
    }
  });
}

function getFunctionSignature(functionName: string) {
  const signatures: { [key: string]: any } = {
    'print': {
      label: 'print(*objects, sep=\' \', end=\'\\n\', file=sys.stdout, flush=False)',
      documentation: 'Print objects to the text stream file, separated by sep and followed by end.',
      parameters: [
        { label: '*objects', documentation: 'Objects to print' },
        { label: 'sep=\' \'', documentation: 'Separator between objects' },
        { label: 'end=\'\\n\'', documentation: 'String appended after the last object' },
        { label: 'file=sys.stdout', documentation: 'File to write to' },
        { label: 'flush=False', documentation: 'Whether to flush the stream' }
      ]
    },
    'len': {
      label: 'len(obj)',
      documentation: 'Return the number of items in a container.',
      parameters: [
        { label: 'obj', documentation: 'Container object' }
      ]
    },
    'range': {
      label: 'range(stop)\nrange(start, stop[, step])',
      documentation: 'Return an object that produces a sequence of integers.',
      parameters: [
        { label: 'stop', documentation: 'End of sequence' },
        { label: 'start', documentation: 'Start of sequence (optional)' },
        { label: 'step', documentation: 'Step size (optional)' }
      ]
    },
    'open': {
      label: 'open(file, mode=\'r\', buffering=-1, encoding=None, errors=None, newline=None, closefd=True, opener=None)',
      documentation: 'Open file and return a stream.',
      parameters: [
        { label: 'file', documentation: 'Path to file' },
        { label: 'mode=\'r\'', documentation: 'Mode to open file' },
        { label: 'buffering=-1', documentation: 'Buffering policy' },
        { label: 'encoding=None', documentation: 'Text encoding' },
        { label: 'errors=None', documentation: 'Error handling' },
        { label: 'newline=None', documentation: 'Newline handling' },
        { label: 'closefd=True', documentation: 'Close file descriptor' },
        { label: 'opener=None', documentation: 'Custom opener' }
      ]
    },
    'str': {
      label: 'str(object)\nstr(bytes_or_buffer[, encoding[, errors]])',
      documentation: 'Create a new string object from the given object.',
      parameters: [
        { label: 'object', documentation: 'Object to convert' },
        { label: 'bytes_or_buffer', documentation: 'Bytes to decode' },
        { label: 'encoding', documentation: 'Encoding to use' },
        { label: 'errors', documentation: 'Error handling' }
      ]
    },
    'int': {
      label: 'int(x=0)\nint(x, base=10)',
      documentation: 'Convert a number or string to an integer.',
      parameters: [
        { label: 'x', documentation: 'Value to convert' },
        { label: 'base=10', documentation: 'Base for string conversion' }
      ]
    },
    'float': {
      label: 'float(x=0)',
      documentation: 'Convert a string or number to a floating point number.',
      parameters: [
        { label: 'x', documentation: 'Value to convert' }
      ]
    },
    'list': {
      label: 'list()\nlist(iterable)',
      documentation: 'Create a new list.',
      parameters: [
        { label: 'iterable', documentation: 'Iterable to convert (optional)' }
      ]
    },
    'dict': {
      label: 'dict()\ndict(mapping)\ndict(iterable)',
      documentation: 'Create a new dictionary.',
      parameters: [
        { label: 'mapping', documentation: 'Mapping to copy' },
        { label: 'iterable', documentation: 'Iterable of key-value pairs' }
      ]
    },
    'input': {
      label: 'input(prompt)',
      documentation: 'Read a string from standard input.',
      parameters: [
        { label: 'prompt', documentation: 'Prompt to display' }
      ]
    },
    'abs': {
      label: 'abs(x)',
      documentation: 'Return the absolute value of the argument.',
      parameters: [
        { label: 'x', documentation: 'Number' }
      ]
    },
    'max': {
      label: 'max(iterable, *[, key, default])\nmax(arg1, arg2, *args, *[, key])',
      documentation: 'Return the largest item in an iterable.',
      parameters: [
        { label: 'iterable', documentation: 'Iterable to find max in' },
        { label: 'arg1, arg2, *args', documentation: 'Arguments to compare' },
        { label: 'key', documentation: 'Key function' },
        { label: 'default', documentation: 'Default value' }
      ]
    },
    'min': {
      label: 'min(iterable, *[, key, default])\nmin(arg1, arg2, *args, *[, key])',
      documentation: 'Return the smallest item in an iterable.',
      parameters: [
        { label: 'iterable', documentation: 'Iterable to find min in' },
        { label: 'arg1, arg2, *args', documentation: 'Arguments to compare' },
        { label: 'key', documentation: 'Key function' },
        { label: 'default', documentation: 'Default value' }
      ]
    },
    'sum': {
      label: 'sum(iterable, /, start=0)',
      documentation: 'Return the sum of a sequence.',
      parameters: [
        { label: 'iterable', documentation: 'Iterable to sum' },
        { label: 'start=0', documentation: 'Starting value' }
      ]
    }
  };

  return signatures[functionName] || null;
}