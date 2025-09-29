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

    // Buscar definiciones en el documento HTML
    const definition = findHtmlDefinition(content, line, character);

    return NextResponse.json({ definition });
  } catch (error) {
    console.error('HTML definition Error en API:', error);
    return NextResponse.json({ definition: null });
  }
}

function findHtmlDefinition(content: string, line: number, character: number) {
  const lines = content.split('\n');
  const currentLine = lines[line] || '';

  // Buscar IDs en la línea actual
  const idRegex = /id="([^"]*)"/g;
  let match;

  while ((match = idRegex.exec(currentLine)) !== null) {
    const idStart = match.index;
    const idValueStart = idStart + 4; // 'id="' tiene 4 caracteres
    const idValueEnd = idValueStart + match[1].length;

    if (character >= idValueStart && character <= idValueEnd) {
      // El cursor está sobre un valor de ID
      const idValue = match[1];

      // Buscar todas las referencias a este ID en el documento
      const references = findIdReferences(content, idValue);

      if (references.length > 0) {
        return {
          uri: 'file://current.html',
          range: {
            start: { line, character: idValueStart },
            end: { line, character: idValueEnd }
          },
          references: references
        };
      }
    }
  }

  // Buscar clases en la línea actual
  const classRegex = /class="([^"]*)"/g;
  while ((match = classRegex.exec(currentLine)) !== null) {
    const classStart = match.index;
    const classValueStart = classStart + 7; // 'class="' tiene 7 caracteres
    const classValueEnd = classValueStart + match[1].length;

    if (character >= classValueStart && character <= classValueEnd) {
      // El cursor está sobre un valor de clase
      const classValue = match[1];

      // Buscar todas las referencias a esta clase en el documento
      const references = findClassReferences(content, classValue);

      if (references.length > 0) {
        return {
          uri: 'file://current.html',
          range: {
            start: { line, character: classValueStart },
            end: { line, character: classValueEnd }
          },
          references: references
        };
      }
    }
  }

  // Buscar referencias a IDs (como href="#id")
  const hrefRegex = /href="#([^"]*)"/g;
  while ((match = hrefRegex.exec(currentLine)) !== null) {
    const hrefStart = match.index;
    const idValueStart = hrefStart + 7; // 'href="#' tiene 7 caracteres
    const idValueEnd = idValueStart + match[1].length;

    if (character >= idValueStart && character <= idValueEnd) {
      // El cursor está sobre una referencia a ID
      const idValue = match[1];

      // Buscar la definición del ID
      const definition = findIdDefinition(content, idValue);

      if (definition) {
        return {
          uri: 'file://current.html',
          range: definition.range,
          definition: definition
        };
      }
    }
  }

  return null;
}

function findIdReferences(content: string, idValue: string) {
  const references = [];
  const lines = content.split('\n');

  // Buscar todas las referencias al ID
  const idRefRegex = new RegExp(`id="${idValue}"`, 'g');
  const hrefRefRegex = new RegExp(`href="#${idValue}"`, 'g');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Buscar definición del ID
    let match;
    while ((match = idRefRegex.exec(line)) !== null) {
      references.push({
        uri: 'file://current.html',
        range: {
          start: { line: i, character: match.index + 4 },
          end: { line: i, character: match.index + 4 + idValue.length }
        },
        kind: 'definition'
      });
    }

    // Buscar referencias al ID
    while ((match = hrefRefRegex.exec(line)) !== null) {
      references.push({
        uri: 'file://current.html',
        range: {
          start: { line: i, character: match.index + 7 },
          end: { line: i, character: match.index + 7 + idValue.length }
        },
        kind: 'reference'
      });
    }
  }

  return references;
}

function findClassReferences(content: string, classValue: string) {
  const references = [];
  const lines = content.split('\n');

  // Buscar todas las referencias a la clase
  const classRegex = new RegExp(`class="[^"]*\\b${classValue}\\b[^"]*"`, 'g');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let match;
    while ((match = classRegex.exec(line)) !== null) {
      // Encontrar la posición exacta de la clase dentro del atributo
      const classAttr = match[0];
      const classStart = match.index;
      const classValueStart = classAttr.indexOf(classValue);

      references.push({
        uri: 'file://current.html',
        range: {
          start: { line: i, character: classStart + classValueStart },
          end: { line: i, character: classStart + classValueStart + classValue.length }
        },
        kind: 'reference'
      });
    }
  }

  return references;
}

function findIdDefinition(content: string, idValue: string) {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idRegex = new RegExp(`id="${idValue}"`, 'g');
    const match = idRegex.exec(line);

    if (match) {
      return {
        uri: 'file://current.html',
        range: {
          start: { line: i, character: match.index + 4 },
          end: { line: i, character: match.index + 4 + idValue.length }
        }
      };
    }
  }

  return null;
}