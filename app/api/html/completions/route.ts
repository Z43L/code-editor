import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Cache para archivos temporales
const tempFileCache = new Map<string, { content: string; tempPath: string; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 segundos

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ completions: [] });
    }

    // Verificar si tenemos un archivo en cache válido
    const cacheKey = `${fileName}:${content.length}`;
    const cached = tempFileCache.get(cacheKey);
    const now = Date.now();

    let tempFilePath: string;
    if (cached && (now - cached.timestamp) < CACHE_DURATION && cached.content === content) {
      tempFilePath = cached.tempPath;
    } else {
      // Crear archivo temporal
      const tempDir = path.join(os.tmpdir(), 'html-lsp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
      tempFilePath = path.join(tempDir, tempFileName);

      await fs.writeFile(tempFilePath, content, 'utf8');

      // Actualizar cache
      tempFileCache.set(cacheKey, {
        content,
        tempPath: tempFilePath,
        timestamp: now
      });

      // Limpiar cache antiguo
      for (const [key, value] of tempFileCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
          try {
            await fs.unlink(value.tempPath);
          } catch (e) {
            // Ignorar errores al eliminar archivos temporales
          }
          tempFileCache.delete(key);
        }
      }
    }

    // Calcular línea y carácter desde la posición
    const lines = content.substring(0, position).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    // Ejecutar vscode-html-language-server para obtener completions
    const completions = await getHtmlCompletions(tempFilePath, line, character);

    return NextResponse.json({ completions });

  } catch (error) {
    console.error('Error in HTML completions:', error);

    // Fallback a completions básicas
    const basicCompletions = getBasicHtmlCompletions();
    return NextResponse.json({ completions: basicCompletions });
  }
}

async function getHtmlCompletions(filePath: string, line: number, character: number) {
  try {
    // Para este ejemplo, usaremos completions básicas mejoradas
    // En una implementación completa, usaríamos el language server directamente
    const content = await fs.readFile(filePath, 'utf8');
    const currentLine = content.split('\n')[line] || '';
    const beforeCursor = currentLine.substring(0, character);

    const completions: any[] = [];

    // Detectar si estamos dentro de una etiqueta
    if (beforeCursor.includes('<') && !beforeCursor.includes('>')) {
      const tagMatch = beforeCursor.match(/<(\w*)$/);
      if (tagMatch) {
        // Completions de etiquetas
        const htmlTags = [
          'html', 'head', 'body', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'a', 'img', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'form', 'input',
          'button', 'select', 'option', 'textarea', 'label', 'script', 'style', 'link',
          'meta', 'title', 'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
          'canvas', 'video', 'audio', 'source', 'iframe', 'br', 'hr', 'wbr'
        ];

        const partialTag = tagMatch[1].toLowerCase();
        const matchingTags = htmlTags.filter(tag => tag.startsWith(partialTag));

        completions.push(...matchingTags.map(tag => ({
          label: tag,
          kind: 1, // Text
          detail: 'HTML tag',
          insertText: `${tag}>$1</${tag}>`,
          insertTextFormat: 2, // Snippet
          documentation: getTagDocumentation(tag)
        })));
      }
    }

    // Detectar si estamos dentro de atributos
    const attrMatch = beforeCursor.match(/<(\w+)\s+([^>]*)\s+(\w*)$/);
    if (attrMatch) {
      const tagName = attrMatch[1];
      const partialAttr = attrMatch[3];

      const attributes = getTagAttributes(tagName);
      const matchingAttrs = attributes.filter(attr => attr.startsWith(partialAttr));

      completions.push(...matchingAttrs.map(attr => ({
        label: attr,
        kind: 4, // Property
        detail: 'HTML attribute',
        insertText: `${attr}="$1"`,
        insertTextFormat: 2, // Snippet
        documentation: getAttributeDocumentation(attr)
      })));
    }

    // Detectar valores de atributos
    const valueMatch = beforeCursor.match(/(\w+)="([^"]*)$/);
    if (valueMatch) {
      const attrName = valueMatch[1];
      const partialValue = valueMatch[2];

      const values = getAttributeValues(attrName);
      const matchingValues = values.filter(value => value.startsWith(partialValue));

      completions.push(...matchingValues.map(value => ({
        label: value,
        kind: 12, // Value
        detail: 'Attribute value',
        insertText: value,
        documentation: getValueDocumentation(attrName, value)
      })));
    }

    return completions;

  } catch (error) {
    console.error('Error getting HTML completions:', error);
    return getBasicHtmlCompletions();
  }
}

function getBasicHtmlCompletions() {
  const htmlTags = [
    'html', 'head', 'body', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'img', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'form', 'input',
    'button', 'select', 'option', 'textarea', 'label', 'script', 'style', 'link',
    'meta', 'title', 'header', 'nav', 'main', 'section', 'article', 'aside', 'footer'
  ];

  const htmlAttributes = [
    'id', 'class', 'style', 'href', 'src', 'alt', 'type', 'name', 'value',
    'placeholder', 'required', 'disabled', 'checked', 'selected', 'width', 'height'
  ];

  return [
    ...htmlTags.map(tag => ({
      label: tag,
      kind: 1,
      detail: 'HTML tag',
      insertText: `<${tag}>$1</${tag}>`,
      insertTextFormat: 2
    })),
    ...htmlAttributes.map(attr => ({
      label: attr,
      kind: 4,
      detail: 'HTML attribute',
      insertText: `${attr}="$1"`,
      insertTextFormat: 2
    }))
  ];
}

function getTagAttributes(tagName: string): string[] {
  const tagAttributes: { [key: string]: string[] } = {
    'a': ['href', 'target', 'rel', 'download', 'type'],
    'img': ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
    'input': ['type', 'name', 'value', 'placeholder', 'required', 'disabled', 'checked', 'maxlength', 'minlength', 'pattern'],
    'form': ['action', 'method', 'enctype', 'target', 'autocomplete'],
    'button': ['type', 'disabled', 'name', 'value'],
    'select': ['name', 'multiple', 'disabled', 'required', 'size'],
    'option': ['value', 'selected', 'disabled'],
    'textarea': ['name', 'rows', 'cols', 'placeholder', 'required', 'disabled', 'maxlength', 'minlength'],
    'link': ['href', 'rel', 'type', 'media', 'sizes', 'crossorigin'],
    'meta': ['name', 'content', 'charset', 'http-equiv'],
    'script': ['src', 'type', 'async', 'defer', 'crossorigin', 'integrity'],
    'iframe': ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'loading']
  };

  return tagAttributes[tagName] || ['id', 'class', 'style', 'title'];
}

function getAttributeValues(attrName: string): string[] {
  const attributeValues: { [key: string]: string[] } = {
    'type': ['text', 'password', 'email', 'number', 'tel', 'url', 'search', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'file', 'hidden', 'image', 'reset', 'submit', 'button', 'checkbox', 'radio', 'range'],
    'method': ['get', 'post'],
    'enctype': ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
    'target': ['_blank', '_self', '_parent', '_top'],
    'rel': ['stylesheet', 'icon', 'preconnect', 'dns-prefetch', 'preload', 'canonical', 'alternate', 'author', 'bookmark', 'external', 'help', 'license', 'next', 'nofollow', 'noopener', 'noreferrer', 'prev', 'search', 'tag'],
    'loading': ['lazy', 'eager'],
    'decoding': ['sync', 'async', 'auto'],
    'autocomplete': ['on', 'off'],
    'crossorigin': ['anonymous', 'use-credentials']
  };

  return attributeValues[attrName] || [];
}

function getTagDocumentation(tagName: string): string {
  const docs: { [key: string]: string } = {
    'div': 'A generic container element',
    'span': 'An inline container element',
    'p': 'A paragraph element',
    'h1': 'A top-level heading',
    'h2': 'A second-level heading',
    'h3': 'A third-level heading',
    'a': 'A hyperlink element',
    'img': 'An image element',
    'ul': 'An unordered list',
    'ol': 'An ordered list',
    'li': 'A list item',
    'table': 'A table element',
    'tr': 'A table row',
    'td': 'A table cell',
    'th': 'A table header cell',
    'form': 'A form element',
    'input': 'An input element',
    'button': 'A button element',
    'select': 'A select element',
    'option': 'An option element',
    'textarea': 'A multi-line text input',
    'script': 'A script element',
    'style': 'A style element',
    'link': 'A link element',
    'meta': 'A meta element'
  };

  return docs[tagName] || `The ${tagName} HTML element`;
}

function getAttributeDocumentation(attrName: string): string {
  const docs: { [key: string]: string } = {
    'id': 'A unique identifier for the element',
    'class': 'A space-separated list of classes',
    'style': 'Inline CSS styles',
    'href': 'The URL of the linked resource',
    'src': 'The URL of the embedded resource',
    'alt': 'Alternative text for the image',
    'type': 'The type of the element',
    'name': 'The name of the element',
    'value': 'The value of the element',
    'placeholder': 'A hint to the user',
    'required': 'Indicates the field is required',
    'disabled': 'Disables the element',
    'checked': 'Indicates the checkbox is checked',
    'selected': 'Indicates the option is selected'
  };

  return docs[attrName] || `The ${attrName} attribute`;
}

function getValueDocumentation(attrName: string, value: string): string {
  const docs: { [key: string]: { [key: string]: string } } = {
    'type': {
      'text': 'A single-line text field',
      'password': 'A password field',
      'email': 'An email address field',
      'number': 'A number field',
      'tel': 'A telephone number field',
      'url': 'A URL field',
      'search': 'A search field',
      'date': 'A date picker',
      'time': 'A time picker',
      'color': 'A color picker',
      'file': 'A file picker',
      'hidden': 'A hidden field',
      'submit': 'A submit button',
      'reset': 'A reset button',
      'button': 'A generic button',
      'checkbox': 'A checkbox',
      'radio': 'A radio button',
      'range': 'A range slider'
    },
    'method': {
      'get': 'Submits data as URL parameters',
      'post': 'Submits data in the request body'
    },
    'target': {
      '_blank': 'Opens in a new window/tab',
      '_self': 'Opens in the same frame',
      '_parent': 'Opens in the parent frame',
      '_top': 'Opens in the full window'
    }
  };

  return docs[attrName]?.[value] || `${value} value for ${attrName}`;
}