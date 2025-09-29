import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ hover: null });
    }

    // Calcular línea y carácter desde la posición
    const lines = content.substring(0, position).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    const currentLine = lines[line] || '';
    const beforeCursor = currentLine.substring(0, character);

    // Detectar qué elemento está bajo el cursor
    const hoverInfo = getHtmlHoverInfo(content, line, character);

    return NextResponse.json({ hover: hoverInfo });
  } catch (error) {
    console.error('HTML hover Error en API:', error);
    return NextResponse.json({ hover: null });
  }
}

function getHtmlHoverInfo(content: string, line: number, character: number) {
  const lines = content.split('\n');
  const currentLine = lines[line] || '';

  // Buscar etiquetas HTML en la línea actual
  const tagRegex = /<\/?(\w+)(?:\s[^>]*)?>/g;
  let match;
  let tagMatch = null;

  while ((match = tagRegex.exec(currentLine)) !== null) {
    const tagStart = match.index;
    const tagEnd = tagStart + match[0].length;

    if (character >= tagStart && character <= tagEnd) {
      tagMatch = match;
      break;
    }
  }

  if (tagMatch) {
    const tagName = tagMatch[1];
    const isClosing = tagMatch[0].startsWith('</');

    return {
      contents: {
        kind: 'markdown',
        value: getTagHoverMarkdown(tagName, isClosing)
      },
      range: {
        start: { line, character: tagMatch.index },
        end: { line, character: tagMatch.index + tagMatch[0].length }
      }
    };
  }

  // Buscar atributos en la línea actual
  const attrRegex = /(\w+)="([^"]*)"/g;
  while ((match = attrRegex.exec(currentLine)) !== null) {
    const attrStart = match.index;
    const attrEnd = attrStart + match[0].length;

    if (character >= attrStart && character <= attrEnd) {
      const attrName = match[1];
      const attrValue = match[2];

      // Determinar si el cursor está sobre el nombre del atributo o el valor
      const attrNameEnd = attrStart + attrName.length;
      if (character <= attrNameEnd) {
        return {
          contents: {
            kind: 'markdown',
            value: getAttributeHoverMarkdown(attrName)
          },
          range: {
            start: { line, character: attrStart },
            end: { line, character: attrNameEnd }
          }
        };
      } else {
        return {
          contents: {
            kind: 'markdown',
            value: getAttributeValueHoverMarkdown(attrName, attrValue)
          },
          range: {
            start: { line, character: attrNameEnd + 2 },
            end: { line, character: attrEnd - 1 }
          }
        };
      }
    }
  }

  return null;
}

function getTagHoverMarkdown(tagName: string, isClosing: boolean): string {
  const tagDocs: { [key: string]: { description: string; attributes?: string[]; category: string } } = {
    'html': {
      description: 'El elemento raíz de un documento HTML. Todos los demás elementos deben ser descendientes de este elemento.',
      category: 'Estructura del Documento'
    },
    'head': {
      description: 'Contiene información legible por máquina (metadatos) sobre el documento, como su título, scripts y hojas de estilo.',
      category: 'Estructura del Documento'
    },
    'body': {
      description: 'Representa el contenido de un documento HTML. Solo puede haber un elemento <body> en un documento.',
      category: 'Estructura del Documento'
    },
    'div': {
      description: 'Un elemento contenedor genérico sin significado semántico. Se usa para agrupar contenido y aplicar estilos.',
      category: 'Diseño'
    },
    'span': {
      description: 'Un contenedor en línea genérico sin significado semántico. Se usa para agrupar texto y aplicar estilos.',
      category: 'Diseño'
    },
    'p': {
      description: 'Representa un párrafo de texto.',
      category: 'Contenido de Texto'
    },
    'h1': {
      description: 'Representa un encabezado de nivel superior. Debe haber solo un h1 por documento.',
      category: 'Encabezados'
    },
    'h2': {
      description: 'Representa un encabezado de segundo nivel.',
      category: 'Encabezados'
    },
    'h3': {
      description: 'Representa un encabezado de tercer nivel.',
      category: 'Encabezados'
    },
    'h4': {
      description: 'Representa un encabezado de cuarto nivel.',
      category: 'Encabezados'
    },
    'h5': {
      description: 'Representa un encabezado de quinto nivel.',
      category: 'Encabezados'
    },
    'h6': {
      description: 'Representa un encabezado de sexto nivel.',
      category: 'Encabezados'
    },
    'a': {
      description: 'Crea hipervínculos a otras páginas web, archivos, ubicaciones dentro de la misma página, direcciones de correo electrónico o cualquier otra URL.',
      attributes: ['href', 'target', 'rel', 'download'],
      category: 'Enlaces'
    },
    'img': {
      description: 'Incrusta una imagen en el documento.',
      attributes: ['src', 'alt', 'width', 'height', 'loading'],
      category: 'Contenido Incrustado'
    },
    'ul': {
      description: 'Representa una lista desordenada de elementos.',
      category: 'Listas'
    },
    'ol': {
      description: 'Representa una lista ordenada de elementos.',
      category: 'Listas'
    },
    'li': {
      description: 'Representa un elemento de lista dentro de listas ordenadas (ol) o desordenadas (ul).',
      category: 'Listas'
    },
    'table': {
      description: 'Representa datos tabulares.',
      category: 'Tablas'
    },
    'tr': {
      description: 'Representa una fila en una tabla.',
      category: 'Tablas'
    },
    'td': {
      description: 'Representa una celda de datos en una tabla.',
      category: 'Tablas'
    },
    'th': {
      description: 'Representa una celda de encabezado en una tabla.',
      category: 'Tablas'
    },
    'form': {
      description: 'Representa un formulario que recopila entrada del usuario.',
      attributes: ['action', 'method', 'enctype'],
      category: 'Formularios'
    },
    'input': {
      description: 'Crea controles interactivos para formularios basados en web.',
      attributes: ['type', 'name', 'value', 'placeholder', 'required'],
      category: 'Forms'
    },
    'button': {
      description: 'Crea un botón en el que se puede hacer clic.',
      attributes: ['type', 'disabled'],
      category: 'Formularios'
    },
    'select': {
      description: 'Crea una lista desplegable.',
      attributes: ['name', 'multiple', 'required'],
      category: 'Formularios'
    },
    'option': {
      description: 'Representa una opción en un elemento select.',
      attributes: ['value', 'selected'],
      category: 'Formularios'
    },
    'textarea': {
      description: 'Crea un control de entrada de texto multilínea.',
      attributes: ['name', 'rows', 'cols', 'placeholder'],
      category: 'Formularios'
    },
    'script': {
      description: 'Incrusta o referencia código ejecutable.',
      attributes: ['src', 'type', 'async', 'defer'],
      category: 'Scripting'
    },
    'style': {
      description: 'Contiene información de estilo para un documento.',
      attributes: ['type', 'media'],
      category: 'Estilos'
    },
    'link': {
      description: 'Enlaza a recursos externos como hojas de estilo.',
      attributes: ['href', 'rel', 'type'],
      category: 'Metadatos del Documento'
    },
    'meta': {
      description: 'Representa metadatos que no pueden ser representados por otros elementos HTML relacionados con meta.',
      attributes: ['name', 'content', 'charset'],
      category: 'Metadatos del Documento'
    },
    'title': {
      description: 'Define el título del documento.',
      category: 'Metadatos del Documento'
    }
  };

  const tagInfo = tagDocs[tagName];
  if (!tagInfo) {
    return `**${isClosing ? '</' : '<'}${tagName}>**\n\nElemento HTML desconocido`;
  }

  let markdown = `**${isClosing ? '</' : '<'}${tagName}>** - ${tagInfo.category}\n\n${tagInfo.description}`;

  if (tagInfo.attributes && tagInfo.attributes.length > 0) {
    markdown += '\n\n**Atributos comunes:**\n' + tagInfo.attributes.map(attr => `- \`${attr}\``).join('\n');
  }

  return markdown;
}

function getAttributeHoverMarkdown(attrName: string): string {
  const attrDocs: { [key: string]: { description: string; values?: string[] } } = {
    'id': {
      description: 'Un identificador único para el elemento. Debe ser único dentro del documento.'
    },
    'class': {
      description: 'Una lista separada por espacios de clases para estilos y selección de JavaScript.'
    },
    'style': {
      description: 'Estilos CSS en línea aplicados al elemento.'
    },
    'href': {
      description: 'La URL del recurso enlazado.',
      values: ['URL', 'mailto:', 'tel:', '#anchor']
    },
    'src': {
      description: 'La URL del recurso incrustado.'
    },
    'alt': {
      description: 'Texto alternativo para lectores de pantalla y cuando la imagen no se carga.'
    },
    'type': {
      description: 'El tipo del elemento o entrada.'
    },
    'name': {
      description: 'El nombre del control de formulario.'
    },
    'value': {
      description: 'El valor del control de formulario.'
    },
    'placeholder': {
      description: 'Una pista para el usuario sobre qué ingresar.'
    },
    'required': {
      description: 'Indica que el campo debe ser completado.'
    },
    'disabled': {
      description: 'Deshabilita el control de formulario.'
    },
    'checked': {
      description: 'Indica que la casilla de verificación o botón de radio está seleccionado.'
    },
    'selected': {
      description: 'Indica que la opción está seleccionada por defecto.'
    },
    'width': {
      description: 'El ancho del elemento en píxeles o porcentaje.'
    },
    'height': {
      description: 'La altura del elemento en píxeles o porcentaje.'
    },
    'action': {
      description: 'La URL donde se enviarán los datos del formulario.'
    },
    'method': {
      description: 'El método HTTP a usar cuando se envía el formulario.',
      values: ['GET', 'POST']
    },
    'target': {
      description: 'Dónde abrir el documento enlazado.',
      values: ['_blank', '_self', '_parent', '_top']
    },
    'rel': {
      description: 'La relación entre el documento actual y el documento enlazado.',
      values: ['stylesheet', 'icon', 'canonical', 'alternate']
    },
    'charset': {
      description: 'La codificación de caracteres para el documento.',
      values: ['UTF-8', 'ISO-8859-1']
    },
    'content': {
      description: 'El valor asociado con el atributo http-equiv o name.'
    }
  };

  const attrInfo = attrDocs[attrName];
  if (!attrInfo) {
    return `**${attrName}**\n\nAtributo HTML`;
  }

  let markdown = `**${attrName}**\n\n${attrInfo.description}`;

  if (attrInfo.values && attrInfo.values.length > 0) {
    markdown += '\n\n**Valores posibles:**\n' + attrInfo.values.map(val => `- \`${val}\``).join('\n');
  }

  return markdown;
}

function getAttributeValueHoverMarkdown(attrName: string, attrValue: string): string {
  const valueDocs: { [key: string]: { [key: string]: string } } = {
    'type': {
      'text': 'Entrada de texto de una sola línea',
      'password': 'Entrada de contraseña (enmascarada)',
      'email': 'Entrada de dirección de correo electrónico',
      'number': 'Entrada numérica',
      'tel': 'Entrada de número de teléfono',
      'url': 'Entrada de URL',
      'search': 'Entrada de búsqueda',
      'date': 'Selector de fecha',
      'time': 'Selector de hora',
      'datetime-local': 'Selector de fecha y hora local',
      'month': 'Selector de mes',
      'week': 'Selector de semana',
      'color': 'Selector de color',
      'file': 'Selector de archivo',
      'hidden': 'Entrada oculta',
      'image': 'Botón de envío de imagen',
      'reset': 'Botón de reinicio',
      'submit': 'Botón de envío',
      'button': 'Botón genérico',
      'checkbox': 'Casilla de verificación',
      'radio': 'Botón de radio',
      'range': 'Control deslizante de rango'
    },
    'method': {
      'get': 'Los datos se agregan a la URL',
      'post': 'Los datos se envían en el cuerpo de la solicitud'
    },
    'target': {
      '_blank': 'Se abre en una nueva ventana/pestaña',
      '_self': 'Se abre en el mismo marco (predeterminado)',
      '_parent': 'Se abre en el marco padre',
      '_top': 'Se abre en la ventana completa'
    },
    'rel': {
      'stylesheet': 'Enlaza a una hoja de estilo',
      'icon': 'Enlaza a un ícono',
      'canonical': 'URL canónica',
      'alternate': 'Representación alternativa',
      'author': 'Página del autor',
      'bookmark': 'Marcador',
      'external': 'Enlace externo',
      'help': 'Página de ayuda',
      'license': 'Página de licencia',
      'next': 'Página siguiente',
      'nofollow': 'No seguir',
      'noopener': 'Sin opener',
      'noreferrer': 'Sin referrer',
      'prev': 'Página anterior',
      'search': 'Página de búsqueda',
      'tag': 'Página de etiqueta'
    },
    'charset': {
      'UTF-8': 'Codificación de caracteres Unicode',
      'ISO-8859-1': 'Codificación de caracteres Latin-1'
    }
  };

  const attrValues = valueDocs[attrName];
  if (attrValues && attrValues[attrValue]) {
    return `**\`${attrValue}\`**\n\n${attrValues[attrValue]}`;
  }

  return `**\`${attrValue}\`**\n\nValor para el atributo ${attrName}`;
}