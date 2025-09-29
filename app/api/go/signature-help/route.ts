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
    const tempFile = path.join(tempDir, `temp_go_${Date.now()}.go`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use gopls for signature help
      const signatureHelp = await getGoplsSignatureHelp(tempFile, content, position);

      return NextResponse.json({ signatureHelp });
    } catch (error) {
      console.error('Go signature help error:', error);
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
    console.error('Go signature help Error en API:', error);
    return NextResponse.json({ signatureHelp: null });
  }
}

async function getGoplsSignatureHelp(filePath: string, content: string, position: number) {
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
    'append': {
      label: 'append(slice []T, elems ...T) []T',
      documentation: 'Appends elements to the end of a slice. If the slice has sufficient capacity, the slice is re-sliced to accommodate the new elements. If not, a new array is allocated.',
      parameters: [
        { label: 'slice []T', documentation: 'The slice to append to' },
        { label: 'elems ...T', documentation: 'Elements to append' }
      ]
    },
    'len': {
      label: 'len(v Type) int',
      documentation: 'Returns the length of v, according to its type.',
      parameters: [
        { label: 'v Type', documentation: 'Value to get length of' }
      ]
    },
    'cap': {
      label: 'cap(v Type) int',
      documentation: 'Returns the capacity of v, according to its type.',
      parameters: [
        { label: 'v Type', documentation: 'Value to get capacity of' }
      ]
    },
    'make': {
      label: 'make(Type, size ...IntegerType) Type',
      documentation: 'Allocates and initializes a slice, map, or channel.',
      parameters: [
        { label: 'Type', documentation: 'Type to allocate (slice, map, or channel)' },
        { label: 'size ...IntegerType', documentation: 'Size/capacity parameters' }
      ]
    },
    'new': {
      label: 'new(Type) *Type',
      documentation: 'Returns a pointer to a newly allocated zero value of type Type.',
      parameters: [
        { label: 'Type', documentation: 'Type to allocate' }
      ]
    },
    'fmt.Println': {
      label: 'fmt.Println(a ...interface{}) (n int, err error)',
      documentation: 'Prints to standard output with a newline.',
      parameters: [
        { label: 'a ...interface{}', documentation: 'Values to print' }
      ]
    },
    'fmt.Printf': {
      label: 'fmt.Printf(format string, a ...interface{}) (n int, err error)',
      documentation: 'Prints formatted output to standard output.',
      parameters: [
        { label: 'format string', documentation: 'Format string' },
        { label: 'a ...interface{}', documentation: 'Values to format' }
      ]
    },
    'fmt.Sprintf': {
      label: 'fmt.Sprintf(format string, a ...interface{}) string',
      documentation: 'Returns a formatted string.',
      parameters: [
        { label: 'format string', documentation: 'Format string' },
        { label: 'a ...interface{}', documentation: 'Values to format' }
      ]
    },
    'os.Open': {
      label: 'os.Open(name string) (*File, error)',
      documentation: 'Opens the named file for reading.',
      parameters: [
        { label: 'name string', documentation: 'File name' }
      ]
    },
    'os.Create': {
      label: 'os.Create(name string) (*File, error)',
      documentation: 'Creates the named file with mode 0666.',
      parameters: [
        { label: 'name string', documentation: 'File name' }
      ]
    },
    'strings.Contains': {
      label: 'strings.Contains(s, substr string) bool',
      documentation: 'Reports whether substr is within s.',
      parameters: [
        { label: 's string', documentation: 'String to search in' },
        { label: 'substr string', documentation: 'Substring to search for' }
      ]
    },
    'strings.Split': {
      label: 'strings.Split(s, sep string) []string',
      documentation: 'Slices s into all substrings separated by sep.',
      parameters: [
        { label: 's string', documentation: 'String to split' },
        { label: 'sep string', documentation: 'Separator' }
      ]
    },
    'strings.Join': {
      label: 'strings.Join(elems []string, sep string) string',
      documentation: 'Concatenates the elements of elems with sep.',
      parameters: [
        { label: 'elems []string', documentation: 'Strings to join' },
        { label: 'sep string', documentation: 'Separator' }
      ]
    },
    'strconv.Itoa': {
      label: 'strconv.Itoa(i int) string',
      documentation: 'Converts int to string.',
      parameters: [
        { label: 'i int', documentation: 'Integer to convert' }
      ]
    },
    'strconv.Atoi': {
      label: 'strconv.Atoi(s string) (int, error)',
      documentation: 'Converts string to int.',
      parameters: [
        { label: 's string', documentation: 'String to convert' }
      ]
    },
    'time.Now': {
      label: 'time.Now() Time',
      documentation: 'Returns the current local time.',
      parameters: []
    },
    'time.Sleep': {
      label: 'time.Sleep(d Duration)',
      documentation: 'Pauses the current goroutine for at least the duration d.',
      parameters: [
        { label: 'd Duration', documentation: 'Duration to sleep' }
      ]
    },
    'json.Marshal': {
      label: 'json.Marshal(v interface{}) ([]byte, error)',
      documentation: 'Returns the JSON encoding of v.',
      parameters: [
        { label: 'v interface{}', documentation: 'Value to marshal' }
      ]
    },
    'json.Unmarshal': {
      label: 'json.Unmarshal(data []byte, v interface{}) error',
      documentation: 'Parses the JSON-encoded data and stores the result in v.',
      parameters: [
        { label: 'data []byte', documentation: 'JSON data' },
        { label: 'v interface{}', documentation: 'Value to unmarshal into' }
      ]
    },
    'http.Get': {
      label: 'http.Get(url string) (resp *Response, err error)',
      documentation: 'Issues a GET to the specified URL.',
      parameters: [
        { label: 'url string', documentation: 'URL to request' }
      ]
    },
    'http.Post': {
      label: 'http.Post(url string, contentType string, body io.Reader) (resp *Response, err error)',
      documentation: 'Posts to the specified URL.',
      parameters: [
        { label: 'url string', documentation: 'URL to post to' },
        { label: 'contentType string', documentation: 'Content type' },
        { label: 'body io.Reader', documentation: 'Request body' }
      ]
    },
    'http.ListenAndServe': {
      label: 'http.ListenAndServe(addr string, handler Handler) error',
      documentation: 'Listens on the given address and serves HTTP requests.',
      parameters: [
        { label: 'addr string', documentation: 'Address to listen on' },
        { label: 'handler Handler', documentation: 'HTTP handler' }
      ]
    }
  };

  return signatures[functionName] || null;
}