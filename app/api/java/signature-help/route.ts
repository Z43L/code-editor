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
    const tempFile = path.join(tempDir, `temp_java_${Date.now()}.java`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use enhanced Java signature help
      const signatureHelp = await getJavaSignatureHelp(tempFile, content, position);

      return NextResponse.json({ signatureHelp });
    } catch (error) {
      console.error('Java signature help error:', error);
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
    console.error('Java signature help Error en API:', error);
    return NextResponse.json({ signatureHelp: null });
  }
}

async function getJavaSignatureHelp(filePath: string, content: string, position: number) {
  return new Promise<any>((resolve, reject) => {
    try {
      // Calculate line and character from position
      const lines = content.substring(0, position).split('\n');
      const line = lines.length - 1;
      const character = lines[lines.length - 1].length;

      // Get the current line
      const currentLine = content.split('\n')[line] || '';

      // Check if we're inside a method call
      const beforeCursor = currentLine.substring(0, character);
      const methodCallMatch = beforeCursor.match(/(\w+)\s*\(\s*([^)]*)$/);

      if (methodCallMatch) {
        const methodName = methodCallMatch[1];
        const argsSoFar = methodCallMatch[2];

        const signature = getMethodSignature(methodName);
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

function getMethodSignature(methodName: string) {
  const signatures: { [key: string]: any } = {
    'println': {
      label: 'println(String x)\nprintln(Object x)\nprintln(char[] x)\nprintln(char x)\nprintln(int x)\nprintln(long x)\nprintln(float x)\nprintln(double x)\nprintln(boolean x)',
      documentation: 'Prints a String and then terminates the line.',
      parameters: [
        { label: 'x', documentation: 'The value to print' }
      ]
    },
    'print': {
      label: 'print(String s)\nprint(Object obj)\nprint(char[] s)\nprint(char c)\nprint(int i)\nprint(long l)\nprint(float f)\nprint(double d)\nprint(boolean b)',
      documentation: 'Prints a string.',
      parameters: [
        { label: 's/obj/c/i/l/f/d/b', documentation: 'The value to print' }
      ]
    },
    'printf': {
      label: 'printf(String format, Object... args)\nprintf(Locale l, String format, Object... args)',
      documentation: 'A convenience method to write a formatted string to this writer.',
      parameters: [
        { label: 'format', documentation: 'A format string as described in Format string syntax' },
        { label: 'args', documentation: 'Arguments referenced by the format specifiers in the format string' },
        { label: 'l', documentation: 'The locale to apply during formatting' }
      ]
    },
    'length': {
      label: 'length()',
      documentation: 'Returns the length of this string.',
      parameters: []
    },
    'charAt': {
      label: 'charAt(int index)',
      documentation: 'Returns the char value at the specified index.',
      parameters: [
        { label: 'index', documentation: 'the index of the char value' }
      ]
    },
    'substring': {
      label: 'substring(int beginIndex)\nsubstring(int beginIndex, int endIndex)',
      documentation: 'Returns a string that is a substring of this string.',
      parameters: [
        { label: 'beginIndex', documentation: 'the beginning index, inclusive' },
        { label: 'endIndex', documentation: 'the ending index, exclusive' }
      ]
    },
    'indexOf': {
      label: 'indexOf(String str)\nindexOf(String str, int fromIndex)\nindexOf(int ch)\nindexOf(int ch, int fromIndex)',
      documentation: 'Returns the index within this string of the first occurrence of the specified substring.',
      parameters: [
        { label: 'str', documentation: 'the substring to search for' },
        { label: 'fromIndex', documentation: 'the index to start the search from' },
        { label: 'ch', documentation: 'a character (Unicode code point)' }
      ]
    },
    'lastIndexOf': {
      label: 'lastIndexOf(String str)\nlastIndexOf(String str, int fromIndex)\nlastIndexOf(int ch)\nlastIndexOf(int ch, int fromIndex)',
      documentation: 'Returns the index within this string of the last occurrence of the specified substring.',
      parameters: [
        { label: 'str', documentation: 'the substring to search for' },
        { label: 'fromIndex', documentation: 'the index to start the search from' },
        { label: 'ch', documentation: 'a character (Unicode code point)' }
      ]
    },
    'replace': {
      label: 'replace(CharSequence target, CharSequence replacement)',
      documentation: 'Replaces each substring that matches the literal target sequence.',
      parameters: [
        { label: 'target', documentation: 'The sequence of char values to be replaced' },
        { label: 'replacement', documentation: 'The replacement sequence of char values' }
      ]
    },
    'split': {
      label: 'split(String regex)\nsplit(String regex, int limit)',
      documentation: 'Splits this string around matches of the given regular expression.',
      parameters: [
        { label: 'regex', documentation: 'the delimiting regular expression' },
        { label: 'limit', documentation: 'result threshold' }
      ]
    },
    'trim': {
      label: 'trim()',
      documentation: 'Returns a string whose value is this string, with any leading and trailing whitespace removed.',
      parameters: []
    },
    'parseInt': {
      label: 'parseInt(String s)\nparseInt(String s, int radix)',
      documentation: 'Parses the string argument as a signed decimal integer.',
      parameters: [
        { label: 's', documentation: 'a String containing the int representation to be parsed' },
        { label: 'radix', documentation: 'the radix to be used while parsing s' }
      ]
    },
    'parseDouble': {
      label: 'parseDouble(String s)',
      documentation: 'Returns a new double initialized to the value represented by the specified String.',
      parameters: [
        { label: 's', documentation: 'the string to be parsed' }
      ]
    },
    'valueOf': {
      label: 'valueOf(Object obj)\nvalueOf(char[] data)\nvalueOf(char[] data, int offset, int count)\nvalueOf(boolean b)\nvalueOf(char c)\nvalueOf(int i)\nvalueOf(long l)\nvalueOf(float f)\nvalueOf(double d)',
      documentation: 'Returns the string representation of the Object argument.',
      parameters: [
        { label: 'obj/data/b/c/i/l/f/d', documentation: 'an Object/char array/boolean/char/int/long/float/double' },
        { label: 'offset', documentation: 'the offset' },
        { label: 'count', documentation: 'the length' }
      ]
    },
    'toLowerCase': {
      label: 'toLowerCase()\ntoLowerCase(Locale locale)',
      documentation: 'Converts all of the characters in this String to lower case.',
      parameters: [
        { label: 'locale', documentation: 'use the rules of the given Locale' }
      ]
    },
    'toUpperCase': {
      label: 'toUpperCase()\ntoUpperCase(Locale locale)',
      documentation: 'Converts all of the characters in this String to upper case.',
      parameters: [
        { label: 'locale', documentation: 'use the rules of the given Locale' }
      ]
    },
    'add': {
      label: 'add(E e)',
      documentation: 'Appends the specified element to the end of this list.',
      parameters: [
        { label: 'e', documentation: 'element to be appended to this list' }
      ]
    },
    'remove': {
      label: 'remove(Object o)\nremove(int index)',
      documentation: 'Removes the first occurrence of the specified element from this list.',
      parameters: [
        { label: 'o', documentation: 'element to be removed from this list, if present' },
        { label: 'index', documentation: 'the index of the element to be removed' }
      ]
    },
    'get': {
      label: 'get(int index)',
      documentation: 'Returns the element at the specified position in this list.',
      parameters: [
        { label: 'index', documentation: 'index of the element to return' }
      ]
    },
    'set': {
      label: 'set(int index, E element)',
      documentation: 'Replaces the element at the specified position in this list with the specified element.',
      parameters: [
        { label: 'index', documentation: 'index of the element to replace' },
        { label: 'element', documentation: 'element to be stored at the specified position' }
      ]
    },
    'size': {
      label: 'size()',
      documentation: 'Returns the number of elements in this collection.',
      parameters: []
    },
    'isEmpty': {
      label: 'isEmpty()',
      documentation: 'Returns true if this collection contains no elements.',
      parameters: []
    },
    'contains': {
      label: 'contains(Object o)',
      documentation: 'Returns true if this collection contains the specified element.',
      parameters: [
        { label: 'o', documentation: 'element whose presence in this collection is to be tested' }
      ]
    },
    'clear': {
      label: 'clear()',
      documentation: 'Removes all of the elements from this collection.',
      parameters: []
    },
    'readLine': {
      label: 'readLine()',
      documentation: 'Reads a line of text.',
      parameters: []
    },
    'next': {
      label: 'next()',
      documentation: 'Finds and returns the next complete token from this scanner.',
      parameters: []
    },
    'nextInt': {
      label: 'nextInt()\nnextInt(int radix)',
      documentation: 'Scans the next token of the input as an int.',
      parameters: [
        { label: 'radix', documentation: 'the radix used to interpret the token' }
      ]
    },
    'nextDouble': {
      label: 'nextDouble()',
      documentation: 'Scans the next token of the input as a double.',
      parameters: []
    },
    'sin': {
      label: 'sin(double a)',
      documentation: 'Returns the trigonometric sine of an angle.',
      parameters: [
        { label: 'a', documentation: 'an angle, in radians' }
      ]
    },
    'cos': {
      label: 'cos(double a)',
      documentation: 'Returns the trigonometric cosine of an angle.',
      parameters: [
        { label: 'a', documentation: 'an angle, in radians' }
      ]
    },
    'tan': {
      label: 'tan(double a)',
      documentation: 'Returns the trigonometric tangent of an angle.',
      parameters: [
        { label: 'a', documentation: 'an angle, in radians' }
      ]
    },
    'sqrt': {
      label: 'sqrt(double a)',
      documentation: 'Returns the correctly rounded positive square root of a double value.',
      parameters: [
        { label: 'a', documentation: 'a value' }
      ]
    },
    'pow': {
      label: 'pow(double a, double b)',
      documentation: 'Returns the value of the first argument raised to the power of the second argument.',
      parameters: [
        { label: 'a', documentation: 'the base' },
        { label: 'b', documentation: 'the exponent' }
      ]
    },
    'abs': {
      label: 'abs(int a)\nabs(long a)\nabs(float a)\nabs(double a)',
      documentation: 'Returns the absolute value of the argument.',
      parameters: [
        { label: 'a', documentation: 'the argument whose absolute value is to be determined' }
      ]
    },
    'max': {
      label: 'max(int a, int b)\nmax(long a, long b)\nmax(float a, float b)\nmax(double a, double b)',
      documentation: 'Returns the greater of two values.',
      parameters: [
        { label: 'a', documentation: 'an argument' },
        { label: 'b', documentation: 'another argument' }
      ]
    },
    'min': {
      label: 'min(int a, int b)\nmin(long a, long b)\nmin(float a, float b)\nmin(double a, double b)',
      documentation: 'Returns the smaller of two values.',
      parameters: [
        { label: 'a', documentation: 'an argument' },
        { label: 'b', documentation: 'another argument' }
      ]
    },
    'random': {
      label: 'random()',
      documentation: 'Returns a double value with a positive sign, greater than or equal to 0.0 and less than 1.0.',
      parameters: []
    },
    'sort': {
      label: 'sort(int[] a)\nsort(Object[] a)\nsort(T[] a, Comparator<? super T> c)',
      documentation: 'Sorts the specified array into ascending numerical order.',
      parameters: [
        { label: 'a', documentation: 'the array to be sorted' },
        { label: 'c', documentation: 'the comparator to determine the order of the array' }
      ]
    },
    'binarySearch': {
      label: 'binarySearch(int[] a, int key)\nbinarySearch(Object[] a, Object key)\nbinarySearch(T[] a, T key, Comparator<? super T> c)',
      documentation: 'Searches the specified array for the specified value using the binary search algorithm.',
      parameters: [
        { label: 'a', documentation: 'the array to be searched' },
        { label: 'key', documentation: 'the value to be searched for' },
        { label: 'c', documentation: 'the comparator by which the array is ordered' }
      ]
    },
    'fill': {
      label: 'fill(int[] a, int val)\nfill(Object[] a, Object val)\nfill(T[] a, T val, int fromIndex, int toIndex)',
      documentation: 'Assigns the specified value to each element of the specified array.',
      parameters: [
        { label: 'a', documentation: 'the array to be filled' },
        { label: 'val', documentation: 'the value to be stored in all elements of the array' },
        { label: 'fromIndex', documentation: 'the index of the first element (inclusive) to be filled with the specified value' },
        { label: 'toIndex', documentation: 'the index of the last element (exclusive) to be filled with the specified value' }
      ]
    },
    'copyOf': {
      label: 'copyOf(int[] original, int newLength)\ncopyOf(T[] original, int newLength)\ncopyOf(U[] original, int newLength, Class<? extends T[]> newType)',
      documentation: 'Copies the specified array, truncating or padding with zeros.',
      parameters: [
        { label: 'original', documentation: 'the array to be copied' },
        { label: 'newLength', documentation: 'the length of the copy to be returned' },
        { label: 'newType', documentation: 'the class of the copy to be returned' }
      ]
    },
    'asList': {
      label: 'asList(T... a)',
      documentation: 'Returns a fixed-size list backed by the specified array.',
      parameters: [
        { label: 'a', documentation: 'the array by which the list will be backed' }
      ]
    }
  };

  return signatures[methodName] || null;
}