import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ signatureHelp: null });
    }

    // Calcular línea y carácter desde la posición
    const lines = content.substring(0, position).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    const currentLine = lines[line] || '';
    const beforeCursor = currentLine.substring(0, character);

    // Detectar si estamos dentro de una etiqueta HTML
    const signatureHelp = getHtmlSignatureHelp(beforeCursor);

    return NextResponse.json({ signatureHelp });
  } catch (error) {
    console.error('HTML signature help Error en API:', error);
    return NextResponse.json({ signatureHelp: null });
  }
}

function getHtmlSignatureHelp(beforeCursor: string) {
  // Detectar si estamos dentro de una etiqueta
  const tagMatch = beforeCursor.match(/<(\w+)(?:\s+([^>]*))?$/);
  if (!tagMatch) {
    return null;
  }

  const tagName = tagMatch[1];
  const attrsSoFar = tagMatch[2] || '';

  // Contar parámetros (atributos) ya proporcionados
  const attrCount = (attrsSoFar.match(/\w+="[^"]*"/g) || []).length;

  // Obtener la signatura para esta etiqueta
  const signature = getTagSignature(tagName);
  if (!signature) {
    return null;
  }

  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter: Math.min(attrCount, signature.parameters.length - 1)
  };
}

function getTagSignature(tagName: string) {
  const tagSignatures: { [key: string]: any } = {
    'a': {
      label: '<a href="URL" target="_blank|_self|_parent|_top" rel="noopener|noreferrer" download></a>',
      documentation: 'Creates a hyperlink to other web pages, files, or locations.',
      parameters: [
        { label: 'href="URL"', documentation: 'The URL of the linked resource' },
        { label: 'target="_blank|_self|_parent|_top"', documentation: 'Where to open the linked document' },
        { label: 'rel="noopener|noreferrer"', documentation: 'Relationship between current and linked document' },
        { label: 'download', documentation: 'Download the linked resource instead of navigating to it' }
      ]
    },
    'img': {
      label: '<img src="URL" alt="text" width="number" height="number" loading="lazy|eager">',
      documentation: 'Embeds an image into the document.',
      parameters: [
        { label: 'src="URL"', documentation: 'The URL of the image' },
        { label: 'alt="text"', documentation: 'Alternative text for the image' },
        { label: 'width="number"', documentation: 'The width of the image in pixels' },
        { label: 'height="number"', documentation: 'The height of the image in pixels' },
        { label: 'loading="lazy|eager"', documentation: 'How the image should be loaded' }
      ]
    },
    'input': {
      label: '<input type="text|password|email|number|..." name="name" value="value" placeholder="text" required>',
      documentation: 'Creates an interactive control for web-based forms.',
      parameters: [
        { label: 'type="text|password|email|number|..."', documentation: 'The type of input control' },
        { label: 'name="name"', documentation: 'The name of the form control' },
        { label: 'value="value"', documentation: 'The value of the form control' },
        { label: 'placeholder="text"', documentation: 'A hint to the user' },
        { label: 'required', documentation: 'Indicates the field must be filled' }
      ]
    },
    'form': {
      label: '<form action="URL" method="get|post" enctype="application/x-www-form-urlencoded|multipart/form-data">',
      documentation: 'Represents a form that collects user input.',
      parameters: [
        { label: 'action="URL"', documentation: 'The URL where form data is sent' },
        { label: 'method="get|post"', documentation: 'The HTTP method for form submission' },
        { label: 'enctype="application/x-www-form-urlencoded|multipart/form-data"', documentation: 'How form data is encoded' }
      ]
    },
    'link': {
      label: '<link href="URL" rel="stylesheet|icon|canonical" type="text/css" media="screen|print">',
      documentation: 'Links to external resources like stylesheets.',
      parameters: [
        { label: 'href="URL"', documentation: 'The URL of the linked resource' },
        { label: 'rel="stylesheet|icon|canonical"', documentation: 'The relationship of the linked resource' },
        { label: 'type="text/css"', documentation: 'The MIME type of the linked resource' },
        { label: 'media="screen|print"', documentation: 'The media for which the resource is intended' }
      ]
    },
    'meta': {
      label: '<meta name="description|keywords|author" content="text" charset="UTF-8" http-equiv="refresh|content-type">',
      documentation: 'Represents metadata that cannot be represented by other HTML elements.',
      parameters: [
        { label: 'name="description|keywords|author"', documentation: 'The name of the metadata' },
        { label: 'content="text"', documentation: 'The value of the metadata' },
        { label: 'charset="UTF-8"', documentation: 'The character encoding for the document' },
        { label: 'http-equiv="refresh|content-type"', documentation: 'Pragma directive' }
      ]
    },
    'script': {
      label: '<script src="URL" type="text/javascript" async defer crossorigin="anonymous|use-credentials">',
      documentation: 'Embeds or references executable code.',
      parameters: [
        { label: 'src="URL"', documentation: 'The URL of the script' },
        { label: 'type="text/javascript"', documentation: 'The MIME type of the script' },
        { label: 'async', documentation: 'Execute script asynchronously' },
        { label: 'defer', documentation: 'Defer script execution until page loads' },
        { label: 'crossorigin="anonymous|use-credentials"', documentation: 'CORS setting for the script' }
      ]
    },
    'button': {
      label: '<button type="submit|reset|button" disabled name="name" value="value">',
      documentation: 'Creates a clickable button.',
      parameters: [
        { label: 'type="submit|reset|button"', documentation: 'The type of button' },
        { label: 'disabled', documentation: 'Disables the button' },
        { label: 'name="name"', documentation: 'The name of the button' },
        { label: 'value="value"', documentation: 'The value of the button' }
      ]
    },
    'select': {
      label: '<select name="name" multiple disabled required size="number">',
      documentation: 'Creates a dropdown list.',
      parameters: [
        { label: 'name="name"', documentation: 'The name of the select element' },
        { label: 'multiple', documentation: 'Allows multiple selections' },
        { label: 'disabled', documentation: 'Disables the select element' },
        { label: 'required', documentation: 'Indicates selection is required' },
        { label: 'size="number"', documentation: 'Number of visible options' }
      ]
    },
    'textarea': {
      label: '<textarea name="name" rows="number" cols="number" placeholder="text" required disabled>',
      documentation: 'Creates a multi-line text input control.',
      parameters: [
        { label: 'name="name"', documentation: 'The name of the textarea' },
        { label: 'rows="number"', documentation: 'Number of visible text lines' },
        { label: 'cols="number"', documentation: 'Number of visible characters per line' },
        { label: 'placeholder="text"', documentation: 'A hint to the user' },
        { label: 'required', documentation: 'Indicates field must be filled' },
        { label: 'disabled', documentation: 'Disables the textarea' }
      ]
    },
    'iframe': {
      label: '<iframe src="URL" width="number" height="number" frameborder="0|1" allowfullscreen loading="lazy|eager">',
      documentation: 'Embeds another HTML document into the current document.',
      parameters: [
        { label: 'src="URL"', documentation: 'The URL of the embedded document' },
        { label: 'width="number"', documentation: 'The width of the iframe' },
        { label: 'height="number"', documentation: 'The height of the iframe' },
        { label: 'frameborder="0|1"', documentation: 'Whether to display a border' },
        { label: 'allowfullscreen', documentation: 'Allows fullscreen mode' },
        { label: 'loading="lazy|eager"', documentation: 'How the iframe should be loaded' }
      ]
    }
  };

  return tagSignatures[tagName] || null;
}