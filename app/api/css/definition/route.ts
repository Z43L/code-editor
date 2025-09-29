import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ definition: null });
    }

    // Calcular línea y carácter desde la posición
    const lines = content.substring(0, position).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    const currentLine = lines[line] || '';
    const beforeCursor = currentLine.substring(0, character);

    // Buscar definiciones en el documento CSS
    const definition = findCssDefinition(content, line, character);

    return NextResponse.json({ definition });
  } catch (error) {
    console.error('CSS definition Error en API:', error);
    return NextResponse.json({ definition: null });
  }
}

function findCssDefinition(content: string, line: number, character: number) {
  const lines = content.split('\n');
  const currentLine = lines[line] || '';

  // Buscar clases CSS en la línea actual
  const classRegex = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  let match;

  while ((match = classRegex.exec(currentLine)) !== null) {
    const classStart = match.index;
    const classValueStart = classStart + 1; // '.' tiene 1 caracter
    const classValueEnd = classValueStart + match[1].length;

    if (character >= classValueStart && character <= classValueEnd) {
      // El cursor está sobre un nombre de clase
      const className = match[1];

      // Buscar todas las definiciones de esta clase en el documento
      const definitions = findClassDefinitions(content, className);

      if (definitions.length > 0) {
        return {
          uri: 'file://current.css',
          range: {
            start: { line, character: classValueStart },
            end: { line, character: classValueEnd }
          },
          definitions: definitions
        };
      }
    }
  }

  // Buscar IDs CSS en la línea actual
  const idRegex = /#([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  while ((match = idRegex.exec(currentLine)) !== null) {
    const idStart = match.index;
    const idValueStart = idStart + 1; // '#' tiene 1 caracter
    const idValueEnd = idValueStart + match[1].length;

    if (character >= idValueStart && character <= idValueEnd) {
      // El cursor está sobre un ID
      const idName = match[1];

      // Buscar la definición del ID
      const definition = findIdDefinition(content, idName);

      if (definition) {
        return {
          uri: 'file://current.css',
          range: {
            start: { line, character: idValueStart },
            end: { line, character: idValueEnd }
          },
          definition: definition
        };
      }
    }
  }

  // Buscar variables CSS en la línea actual
  const varRegex = /var\((--[a-zA-Z_-][a-zA-Z0-9_-]*)\)/g;
  while ((match = varRegex.exec(currentLine)) !== null) {
    const varStart = currentLine.indexOf(match[1], match.index);
    const varEnd = varStart + match[1].length;

    if (character >= varStart && character <= varEnd) {
      // El cursor está sobre una variable CSS
      const varName = match[1];

      // Buscar la definición de la variable
      const definition = findVariableDefinition(content, varName);

      if (definition) {
        return {
          uri: 'file://current.css',
          range: {
            start: { line, character: varStart },
            end: { line, character: varEnd }
          },
          definition: definition
        };
      }
    }
  }

  // Buscar definiciones de variables CSS (--variable)
  const varDefRegex = /(--[a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  while ((match = varDefRegex.exec(currentLine)) !== null) {
    const varStart = match.index;
    const varEnd = varStart + match[1].length;

    if (character >= varStart && character <= varEnd) {
      // El cursor está sobre una definición de variable
      const varName = match[1];

      // Buscar todas las referencias a esta variable
      const references = findVariableReferences(content, varName);

      if (references.length > 0) {
        return {
          uri: 'file://current.css',
          range: {
            start: { line, character: varStart },
            end: { line, character: varEnd }
          },
          references: references
        };
      }
    }
  }

  return null;
}

function findClassDefinitions(content: string, className: string) {
  const definitions = [];
  const lines = content.split('\n');

  // Buscar todas las definiciones de la clase
  const classDefRegex = new RegExp(`\\.${className}\\b[^}]*\\{`, 'g');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = classDefRegex.exec(line);

    if (match) {
      definitions.push({
        uri: 'file://current.css',
        range: {
          start: { line: i, character: match.index + 1 },
          end: { line: i, character: match.index + 1 + className.length }
        },
        kind: 'definition'
      });
    }
  }

  return definitions;
}

function findIdDefinition(content: string, idName: string) {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idDefRegex = new RegExp(`#${idName}\\b[^}]*\\{`, 'g');
    const match = idDefRegex.exec(line);

    if (match) {
      return {
        uri: 'file://current.css',
        range: {
          start: { line: i, character: match.index + 1 },
          end: { line: i, character: match.index + 1 + idName.length }
        }
      };
    }
  }

  return null;
}

function findVariableDefinition(content: string, varName: string) {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const varDefRegex = new RegExp(`${varName}\\s*:`, 'g');
    const match = varDefRegex.exec(line);

    if (match) {
      return {
        uri: 'file://current.css',
        range: {
          start: { line: i, character: match.index },
          end: { line: i, character: match.index + varName.length }
        }
      };
    }
  }

  return null;
}

function findVariableReferences(content: string, varName: string) {
  const references = [];
  const lines = content.split('\n');

  // Buscar todas las referencias a la variable
  const varRefRegex = new RegExp(`var\\(${varName}\\)`, 'g');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;

    while ((match = varRefRegex.exec(line)) !== null) {
      references.push({
        uri: 'file://current.css',
        range: {
          start: { line: i, character: match.index + 4 },
          end: { line: i, character: match.index + 4 + varName.length }
        },
        kind: 'reference'
      });
    }
  }

  return references;
}