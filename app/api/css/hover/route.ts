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

    // Detectar qué elemento CSS está bajo el cursor
    const hoverInfo = getCssHoverInfo(content, line, character);

    return NextResponse.json({ hover: hoverInfo });
  } catch (error) {
    console.error('CSS hover Error en API:', error);
    return NextResponse.json({ hover: null });
  }
}

function getCssHoverInfo(content: string, line: number, character: number) {
  const lines = content.split('\n');
  const currentLine = lines[line] || '';

  // Buscar propiedades CSS en la línea actual
  const propertyRegex = /(\w+[-\w]*)\s*:/g;
  let match;

  while ((match = propertyRegex.exec(currentLine)) !== null) {
    const propertyStart = match.index;
    const propertyEnd = propertyStart + match[1].length;

    if (character >= propertyStart && character <= propertyEnd) {
      const propertyName = match[1];
      return {
        contents: {
          kind: 'markdown',
          value: getPropertyHoverMarkdown(propertyName)
        },
        range: {
          start: { line, character: propertyStart },
          end: { line, character: propertyEnd }
        }
      };
    }
  }

  // Buscar valores de propiedades CSS
  const valueRegex = /:\s*([^;]+);?/g;
  while ((match = valueRegex.exec(currentLine)) !== null) {
    const valueStart = currentLine.indexOf(match[1], match.index);
    const valueEnd = valueStart + match[1].length;

    if (character >= valueStart && character <= valueEnd) {
      // Encontrar la propiedad correspondiente
      const propertyMatch = currentLine.match(/(\w+[-\w]*)\s*:\s*[^;]+;?/);
      if (propertyMatch) {
        const propertyName = propertyMatch[1];
        const value = match[1].trim();

        return {
          contents: {
            kind: 'markdown',
            value: getValueHoverMarkdown(propertyName, value)
          },
          range: {
            start: { line, character: valueStart },
            end: { line, character: valueEnd }
          }
        };
      }
    }
  }

  // Buscar selectores CSS
  const selectorRegex = /^([^{]+)\s*\{/;
  const selectorMatch = currentLine.match(selectorRegex);
  if (selectorMatch) {
    const selectorStart = 0;
    const selectorEnd = selectorMatch[1].length;

    if (character >= selectorStart && character <= selectorEnd) {
      const selector = selectorMatch[1].trim();
      return {
        contents: {
          kind: 'markdown',
          value: getSelectorHoverMarkdown(selector)
        },
        range: {
          start: { line, character: selectorStart },
          end: { line, character: selectorEnd }
        }
      };
    }
  }

  // Buscar reglas @ en la línea actual
  const atRuleRegex = /@(\w+)/g;
  while ((match = atRuleRegex.exec(currentLine)) !== null) {
    const atRuleStart = match.index;
    const atRuleEnd = atRuleStart + match[0].length;

    if (character >= atRuleStart && character <= atRuleEnd) {
      const atRule = match[1];
      return {
        contents: {
          kind: 'markdown',
          value: getAtRuleHoverMarkdown(atRule)
        },
        range: {
          start: { line, character: atRuleStart },
          end: { line, character: atRuleEnd }
        }
      };
    }
  }

  return null;
}

function getPropertyHoverMarkdown(propertyName: string): string {
  const propertyDocs: { [key: string]: { description: string; values?: string[]; initial?: string } } = {
    'color': {
      description: 'Establece el color del texto',
      values: ['<color>'],
      initial: 'depende del agente de usuario'
    },
    'background-color': {
      description: 'Establece el color de fondo de un elemento',
      values: ['<color>', 'transparent'],
      initial: 'transparent'
    },
    'font-size': {
      description: 'Establece el tamaño de una fuente',
      values: ['<absolute-size>', '<relative-size>', '<length>', '<percentage>'],
      initial: 'medium'
    },
    'font-family': {
      description: 'Especifica la familia de fuentes para el texto',
      values: ['<family-name>', '<generic-family>'],
      initial: 'depende del agente de usuario'
    },
    'font-weight': {
      description: 'Establece qué tan gruesos o delgados deben mostrarse los caracteres en el texto',
      values: ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
      initial: 'normal'
    },
    'margin': {
      description: 'Establece todas las propiedades de margen en una declaración',
      values: ['<length>', '<percentage>', 'auto'],
      initial: '0'
    },
    'padding': {
      description: 'Establece todas las propiedades de relleno en una declaración',
      values: ['<length>', '<percentage>'],
      initial: '0'
    },
    'border': {
      description: 'Establece todas las propiedades de borde en una declaración',
      values: ['<border-width>', '<border-style>', '<color>'],
      initial: 'Ver propiedades individuales'
    },
    'width': {
      description: 'Establece el ancho de un elemento',
      values: ['<length>', '<percentage>', 'auto', 'min-content', 'max-content', 'fit-content'],
      initial: 'auto'
    },
    'height': {
      description: 'Establece la altura de un elemento',
      values: ['<length>', '<percentage>', 'auto', 'min-content', 'max-content', 'fit-content'],
      initial: 'auto'
    },
    'display': {
      description: 'Especifica el comportamiento de visualización de un elemento',
      values: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none', 'contents', 'table', 'table-row', 'table-cell'],
      initial: 'inline'
    },
    'position': {
      description: 'Especifica el tipo de método de posicionamiento usado para un elemento',
      values: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
      initial: 'static'
    },
    'top': {
      description: 'Especifica la posición superior de un elemento posicionado',
      values: ['<length>', '<percentage>', 'auto'],
      initial: 'auto'
    },
    'left': {
      description: 'Especifica la posición izquierda de un elemento posicionado',
      values: ['<length>', '<percentage>', 'auto'],
      initial: 'auto'
    },
    'right': {
      description: 'Especifica la posición derecha de un elemento posicionado',
      values: ['<length>', '<percentage>', 'auto'],
      initial: 'auto'
    },
    'bottom': {
      description: 'Especifica la posición inferior de un elemento posicionado',
      values: ['<length>', '<percentage>', 'auto'],
      initial: 'auto'
    },
    'flex': {
      description: 'Especifica la longitud del elemento, relativa al resto de los elementos flexibles dentro del mismo contenedor',
      values: ['none', '<number>'],
      initial: '0 1 auto'
    },
    'grid': {
      description: 'Una propiedad abreviada para las propiedades grid-template-rows, grid-template-columns, grid-template-areas, grid-auto-rows, grid-auto-columns y grid-auto-flow',
      initial: 'Ver propiedades individuales'
    },
    'align-items': {
      description: 'Especifica la alineación predeterminada para elementos dentro de un contenedor flexible o contenedor de cuadrícula',
      values: ['stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'first baseline', 'last baseline', 'start', 'end', 'self-start', 'self-end'],
      initial: 'stretch'
    },
    'justify-content': {
      description: 'Especifica cómo el navegador distribuye el espacio entre y alrededor de los elementos de contenido',
      values: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end', 'left', 'right'],
      initial: 'flex-start'
    },
    'text-align': {
      description: 'Especifica la alineación horizontal del texto en un elemento',
      values: ['left', 'right', 'center', 'justify', 'start', 'end'],
      initial: 'start (o left si la dirección es ltr, right si la dirección es rtl)'
    },
    'line-height': {
      description: 'Establece la altura de una caja de línea',
      values: ['normal', '<number>', '<length>', '<percentage>'],
      initial: 'normal'
    },
    'letter-spacing': {
      description: 'Aumenta o disminuye el espacio entre caracteres en un texto',
      values: ['normal', '<length>'],
      initial: 'normal'
    },
    'text-decoration': {
      description: 'Especifica la decoración agregada al texto',
      values: ['none', 'underline', 'overline', 'line-through', 'blink'],
      initial: 'none'
    },
    'opacity': {
      description: 'Establece el nivel de opacidad para un elemento',
      values: ['<alpha-value>'],
      initial: '1'
    },
    'transform': {
      description: 'Aplica una transformación 2D o 3D a un elemento',
      values: ['none', '<transform-function>+'],
      initial: 'none'
    },
    'transition': {
      description: 'Una propiedad abreviada para transition-property, transition-duration, transition-timing-function y transition-delay',
      values: ['<single-transition-property>', '<time>', '<easing-function>', '<time>'],
      initial: 'Ver propiedades individuales'
    },
    'animation': {
      description: 'Una propiedad abreviada para todas las propiedades animation-*',
      values: ['<single-animation-name>', '<time>', '<easing-function>', '<time>', '<single-animation-iteration-count>', '<single-animation-direction>', '<single-animation-fill-mode>', '<single-animation-play-state>'],
      initial: 'Ver propiedades individuales'
    },
    'box-shadow': {
      description: 'Adjunta una o más sombras a un elemento',
      values: ['none', '<shadow>+'],
      initial: 'none'
    },
    'border-radius': {
      description: 'Define el radio de las esquinas del elemento',
      values: ['<length>', '<percentage>'],
      initial: '0'
    }
  };

  const propInfo = propertyDocs[propertyName];
  if (!propInfo) {
    return `**${propertyName}**\n\nPropiedad CSS`;
  }

  let markdown = `**${propertyName}**\n\n${propInfo.description}`;

  if (propInfo.values && propInfo.values.length > 0) {
    markdown += '\n\n**Valores:** ' + propInfo.values.join(' | ');
  }

  if (propInfo.initial) {
    markdown += `\n\n**Valor inicial:** ${propInfo.initial}`;
  }

  return markdown;
}

function getValueHoverMarkdown(propertyName: string, value: string): string {
  // Para valores simples, devolver información básica
  const valueDocs: { [key: string]: { [key: string]: string } } = {
    'display': {
      'block': 'El elemento genera una caja de elemento de bloque, generando saltos de línea tanto antes como después del elemento cuando está en el flujo normal.',
      'inline': 'El elemento genera una o más cajas de elementos en línea que no generan saltos de línea antes o después de sí mismas.',
      'inline-block': 'El elemento genera una caja de elemento de bloque que fluirá con el contenido circundante como si fuera una sola caja en línea.',
      'flex': 'El elemento se comporta como un elemento de bloque y dispone su contenido según el modelo de flexbox.',
      'grid': 'El elemento se comporta como un elemento de bloque y dispone su contenido según el modelo de cuadrícula.',
      'none': 'Desactiva la visualización de un elemento para que no tenga efecto en el diseño.'
    },
    'position': {
      'static': 'El elemento se posiciona según el flujo normal del documento.',
      'relative': 'El elemento se posiciona relativo a su posición normal.',
      'absolute': 'El elemento se elimina del flujo normal del documento y no se crea espacio para el elemento en el diseño de la página.',
      'fixed': 'El elemento se elimina del flujo normal del documento y no se crea espacio para el elemento en el diseño de la página.',
      'sticky': 'El elemento se posiciona basado en la posición de desplazamiento del usuario.'
    },
    'font-weight': {
      'normal': 'Peso de fuente normal. Igual a 400.',
      'bold': 'Peso de fuente negrita. Igual a 700.',
      'lighter': 'Un peso de fuente relativo más ligero que el elemento padre.',
      'bolder': 'Un peso de fuente relativo más pesado que el elemento padre.'
    },
    'text-align': {
      'left': 'El contenido en línea se alinea al borde izquierdo de la caja de línea.',
      'right': 'El contenido en línea se alinea al borde derecho de la caja de línea.',
      'center': 'El contenido en línea se centra dentro de la caja de línea.',
      'justify': 'El contenido en línea se justifica. El texto debe espaciarse para alinear sus bordes izquierdo y derecho con los bordes izquierdo y derecho de la caja de línea.'
    }
  };

  const propValues = valueDocs[propertyName];
  if (propValues && propValues[value]) {
    return `**\`${value}\`**\n\n${propValues[value]}`;
  }

  // Para colores nombrados
  if (['color', 'background-color', 'border-color'].includes(propertyName) && isNamedColor(value)) {
    return `**\`${value}\`**\n\nColor CSS nombrado`;
  }

  // Para valores numéricos con unidades
  if (value.match(/^\d+(\.\d+)?(px|em|rem|%|vh|vw|vmin|vmax|pt|pc|in|cm|mm|ex|ch)$/)) {
    return `**\`${value}\`**\n\nValor de longitud CSS`;
  }

  return `**\`${value}\`**\n\nValor para ${propertyName}`;
}

function getSelectorHoverMarkdown(selector: string): string {
  const selectorDocs: { [key: string]: string } = {
    '*': 'Selector universal - selecciona todos los elementos',
    'element': 'Selector de tipo - selecciona todos los elementos del tipo dado',
    '.class': 'Selector de clase - selecciona elementos con un atributo de clase específico',
    '#id': 'Selector de ID - selecciona un solo elemento con un atributo id específico',
    '[attr]': 'Selector de atributo - selecciona elementos con un atributo específico',
    '[attr=value]': 'Selector de atributo - selecciona elementos con un valor de atributo específico',
    ':hover': 'Selector de pseudoclase - selecciona elementos cuando el mouse está sobre ellos',
    ':focus': 'Selector de pseudoclase - selecciona elementos que tienen foco',
    ':active': 'Selector de pseudoclase - selecciona elementos que están siendo activados',
    ':visited': 'Selector de pseudoclase - selecciona enlaces que han sido visitados',
    ':link': 'Selector de pseudoclase - selecciona enlaces no visitados',
    ':first-child': 'Selector de pseudoclase - selecciona el primer hijo de su padre',
    ':last-child': 'Selector de pseudoclase - selecciona el último hijo de su padre',
    ':nth-child()': 'Selector de pseudoclase - selecciona elementos basados en su posición entre hermanos',
    ':not()': 'Selector de pseudoclase - selecciona elementos que no coinciden con el selector dentro',
    '::before': 'Selector de pseudoelemento - inserta contenido antes del contenido del elemento',
    '::after': 'Selector de pseudoelemento - inserta contenido después del contenido del elemento',
    'element element': 'Combinador descendiente - selecciona elementos que son descendientes del primer elemento',
    'element > element': 'Combinador hijo - selecciona elementos que son hijos directos del primer elemento',
    'element + element': 'Combinador hermano adyacente - selecciona elementos que siguen inmediatamente al primer elemento',
    'element ~ element': 'Combinador hermano general - selecciona elementos que siguen al primer elemento'
  };

  // Buscar coincidencias exactas primero
  if (selectorDocs[selector]) {
    return `**${selector}**\n\n${selectorDocs[selector]}`;
  }

  // Buscar patrones
  for (const [pattern, description] of Object.entries(selectorDocs)) {
    if (pattern.includes('element') && selector.match(new RegExp(pattern.replace(/element/g, '[\\w-]+')))) {
      return `**${selector}**\n\n${description}`;
    }
  }

  return `**${selector}**\n\nSelector CSS`;
}

function getAtRuleHoverMarkdown(atRule: string): string {
  const atRuleDocs: { [key: string]: { description: string; syntax?: string } } = {
    'media': {
      description: 'Applies styles based on media queries',
      syntax: '@media <media-query-list> { <stylesheet> }'
    },
    'keyframes': {
      description: 'Defines the animation sequence',
      syntax: '@keyframes <keyframes-name> { <keyframe-block-list> }'
    },
    'import': {
      description: 'Importa una hoja de estilo externa',
      syntax: '@import <url> <media-query-list>?;'
    },
    'font-face': {
      description: 'Define fuentes personalizadas',
      syntax: '@font-face { <font-face-property-list> }'
    },
    'supports': {
      description: 'Aplica estilos basados en soporte de características',
      syntax: '@supports <supports-condition> { <stylesheet> }'
    },
    'charset': {
      description: 'Especifica la codificación de caracteres de la hoja de estilo',
      syntax: '@charset "<charset>";'
    },
    'namespace': {
      description: 'Declara un espacio de nombres XML',
      syntax: '@namespace <prefix>? <url>;'
    },
    'page': {
      description: 'Especifica la dimensión, orientación, márgenes, etc. de una caja de página para medios paginados',
      syntax: '@page <page-selector-list>? { <page-body> }'
    },
    'layer': {
      description: 'Declara una capa de cascada',
      syntax: '@layer <layer-name>? { <stylesheet> }'
    }
  };

  const ruleInfo = atRuleDocs[atRule];
  if (!ruleInfo) {
    return `**@${atRule}**\n\nRegla @ de CSS`;
  }

  let markdown = `**@${atRule}**\n\n${ruleInfo.description}`;

  if (ruleInfo.syntax) {
    markdown += `\n\n**Sintaxis:** \`${ruleInfo.syntax}\``;
  }

  return markdown;
}

function isNamedColor(value: string): boolean {
  const namedColors = [
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
    'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
    'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
    'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
    'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
    'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
    'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
    'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
    'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
    'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
    'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
    'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
    'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
    'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
    'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
    'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
    'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
    'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
    'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue',
    'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver',
    'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue',
    'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke',
    'yellow', 'yellowgreen', 'transparent', 'currentColor'
  ];

  return namedColors.includes(value.toLowerCase());
}