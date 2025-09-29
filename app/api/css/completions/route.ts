import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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
      const tempDir = path.join(os.tmpdir(), 'css-lsp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.css`;
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

    // Obtener completions inteligentes para CSS
    const completions = await getCssCompletions(content, line, character);

    return NextResponse.json({ completions });

  } catch (error) {
    console.error('Error in CSS completions:', error);

    // Fallback a completions básicas
    const basicCompletions = getBasicCssCompletions();
    return NextResponse.json({ completions: basicCompletions });
  }
}

async function getCssCompletions(content: string, line: number, character: number) {
  const currentLine = content.split('\n')[line] || '';
  const beforeCursor = currentLine.substring(0, character);

  const completions: any[] = [];

  // Detectar si estamos dentro de una regla CSS
  if (beforeCursor.includes('{') && !beforeCursor.includes('}')) {
    // Estamos dentro de una declaración de propiedades
    const lastColon = beforeCursor.lastIndexOf(':');
    const lastSemicolon = beforeCursor.lastIndexOf(';');

    if (lastColon > lastSemicolon) {
      // Estamos escribiendo un valor de propiedad
      const propertyMatch = beforeCursor.substring(0, lastColon).trim().match(/(\w+[-\w]*)\s*$/);
      if (propertyMatch) {
        const propertyName = propertyMatch[1];
        const partialValue = beforeCursor.substring(lastColon + 1).trim();

        const values = getPropertyValues(propertyName);
        const matchingValues = values.filter(value => value.startsWith(partialValue));

        completions.push(...matchingValues.map(value => ({
          label: value,
          kind: 12, // Value
          detail: `${propertyName} value`,
          insertText: value,
          documentation: getValueDocumentation(propertyName, value)
        })));
      }
    } else {
      // Estamos escribiendo una propiedad
      const partialProperty = beforeCursor.substring(beforeCursor.lastIndexOf('{') + 1).trim();
      const properties = getCssProperties();
      const matchingProperties = properties.filter(prop => prop.startsWith(partialProperty));

      completions.push(...matchingProperties.map(prop => ({
        label: prop,
        kind: 4, // Property
        detail: 'CSS property',
        insertText: `${prop}: $1;`,
        insertTextFormat: 2, // Snippet
        documentation: getPropertyDocumentation(prop)
      })));
    }
  } else if (beforeCursor.includes('@')) {
    // Estamos escribiendo una regla @ (como @media, @keyframes, etc.)
    const atRuleMatch = beforeCursor.match(/@(\w*)$/);
    if (atRuleMatch) {
      const partialAtRule = atRuleMatch[1];
      const atRules = ['media', 'keyframes', 'import', 'font-face', 'supports', 'charset'];
      const matchingAtRules = atRules.filter(rule => rule.startsWith(partialAtRule));

      completions.push(...matchingAtRules.map(rule => ({
        label: rule,
        kind: 15, // Keyword
        detail: `CSS @${rule} rule`,
        insertText: rule,
        documentation: getAtRuleDocumentation(rule)
      })));
    }
  } else {
    // Estamos escribiendo un selector
    const partialSelector = beforeCursor.trim();
    const selectors = getCssSelectors();
    const matchingSelectors = selectors.filter(sel => sel.startsWith(partialSelector));

    completions.push(...matchingSelectors.map(sel => ({
      label: sel,
      kind: 1, // Text
      detail: 'CSS selector',
      insertText: `${sel} {\n\t$1\n}`,
      insertTextFormat: 2, // Snippet
      documentation: getSelectorDocumentation(sel)
    })));

    // También sugerir propiedades CSS comunes
    const properties = getCssProperties().slice(0, 10); // Solo las primeras 10
    completions.push(...properties.map(prop => ({
      label: prop,
      kind: 4, // Property
      detail: 'CSS property',
      insertText: `${prop}: $1;`,
      insertTextFormat: 2, // Snippet
      documentation: getPropertyDocumentation(prop)
    })));
  }

  return completions;
}

function getBasicCssCompletions() {
  const cssProperties = [
    'color', 'background-color', 'font-size', 'font-family', 'font-weight',
    'margin', 'padding', 'border', 'width', 'height', 'display', 'position',
    'top', 'left', 'right', 'bottom', 'flex', 'grid', 'align-items', 'justify-content',
    'text-align', 'line-height', 'letter-spacing', 'text-decoration', 'opacity',
    'transform', 'transition', 'animation', 'box-shadow', 'border-radius'
  ];

  const cssValues = [
    'none', 'auto', 'inherit', 'initial', 'unset', 'block', 'inline', 'inline-block',
    'flex', 'grid', 'relative', 'absolute', 'fixed', 'static', 'center', 'left', 'right',
    'transparent', 'white', 'black', 'red', 'blue', 'green', 'yellow', 'purple'
  ];

  return [
    ...cssProperties.map(prop => ({
      label: prop,
      kind: 4,
      detail: 'CSS property',
      insertText: `${prop}: $1;`,
      insertTextFormat: 2
    })),
    ...cssValues.map(value => ({
      label: value,
      kind: 12,
      detail: 'CSS value',
      insertText: value
    }))
  ];
}

function getCssProperties(): string[] {
  return [
    'align-content', 'align-items', 'align-self', 'all', 'animation', 'animation-delay',
    'animation-direction', 'animation-duration', 'animation-fill-mode', 'animation-iteration-count',
    'animation-name', 'animation-play-state', 'animation-timing-function', 'backface-visibility',
    'background', 'background-attachment', 'background-blend-mode', 'background-clip',
    'background-color', 'background-image', 'background-origin', 'background-position',
    'background-repeat', 'background-size', 'border', 'border-bottom', 'border-bottom-color',
    'border-bottom-left-radius', 'border-bottom-right-radius', 'border-bottom-style',
    'border-bottom-width', 'border-collapse', 'border-color', 'border-image', 'border-image-outset',
    'border-image-repeat', 'border-image-slice', 'border-image-source', 'border-image-width',
    'border-left', 'border-left-color', 'border-left-style', 'border-left-width', 'border-radius',
    'border-right', 'border-right-color', 'border-right-style', 'border-right-width',
    'border-spacing', 'border-style', 'border-top', 'border-top-color', 'border-top-left-radius',
    'border-top-right-radius', 'border-top-style', 'border-top-width', 'border-width', 'bottom',
    'box-decoration-break', 'box-shadow', 'box-sizing', 'break-after', 'break-before', 'break-inside',
    'caption-side', 'caret-color', 'clear', 'clip', 'clip-path', 'color', 'column-count',
    'column-fill', 'column-gap', 'column-rule', 'column-rule-color', 'column-rule-style',
    'column-rule-width', 'column-span', 'column-width', 'columns', 'content', 'counter-increment',
    'counter-reset', 'cursor', 'direction', 'display', 'empty-cells', 'filter', 'flex', 'flex-basis',
    'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap', 'float', 'font',
    'font-family', 'font-feature-settings', 'font-kerning', 'font-language-override', 'font-size',
    'font-size-adjust', 'font-stretch', 'font-style', 'font-synthesis', 'font-variant',
    'font-variant-alternates', 'font-variant-caps', 'font-variant-east-asian', 'font-variant-ligatures',
    'font-variant-numeric', 'font-variant-position', 'font-weight', 'gap', 'grid', 'grid-area',
    'grid-auto-columns', 'grid-auto-flow', 'grid-auto-rows', 'grid-column', 'grid-column-end',
    'grid-column-gap', 'grid-column-start', 'grid-gap', 'grid-row', 'grid-row-end', 'grid-row-gap',
    'grid-row-start', 'grid-template', 'grid-template-areas', 'grid-template-columns',
    'grid-template-rows', 'hanging-punctuation', 'height', 'hyphens', 'image-rendering',
    'isolation', 'justify-content', 'justify-items', 'justify-self', 'left', 'letter-spacing',
    'line-break', 'line-height', 'list-style', 'list-style-image', 'list-style-position',
    'list-style-type', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top',
    'mask', 'mask-clip', 'mask-composite', 'mask-image', 'mask-mode', 'mask-origin', 'mask-position',
    'mask-repeat', 'mask-size', 'mask-type', 'max-height', 'max-width', 'min-height', 'min-width',
    'mix-blend-mode', 'object-fit', 'object-position', 'opacity', 'order', 'orphans', 'outline',
    'outline-color', 'outline-offset', 'outline-style', 'outline-width', 'overflow', 'overflow-wrap',
    'overflow-x', 'overflow-y', 'padding', 'padding-bottom', 'padding-left', 'padding-right',
    'padding-top', 'page-break-after', 'page-break-before', 'page-break-inside', 'perspective',
    'perspective-origin', 'pointer-events', 'position', 'quotes', 'resize', 'right', 'row-gap',
    'scroll-behavior', 'scroll-margin', 'scroll-padding', 'shape-image-threshold', 'shape-margin',
    'shape-outside', 'tab-size', 'table-layout', 'text-align', 'text-align-last', 'text-combine-upright',
    'text-decoration', 'text-decoration-color', 'text-decoration-line', 'text-decoration-style',
    'text-decoration-thickness', 'text-emphasis', 'text-emphasis-color', 'text-emphasis-position',
    'text-emphasis-style', 'text-indent', 'text-justify', 'text-orientation', 'text-overflow',
    'text-rendering', 'text-shadow', 'text-transform', 'text-underline-offset',
    'text-underline-position', 'top', 'transform', 'transform-origin', 'transform-style',
    'transition', 'transition-delay', 'transition-duration', 'transition-property',
    'transition-timing-function', 'unicode-bidi', 'user-select', 'vertical-align', 'visibility',
    'white-space', 'widows', 'width', 'will-change', 'word-break', 'word-spacing', 'word-wrap',
    'writing-mode', 'z-index', 'zoom'
  ];
}

function getPropertyValues(property: string): string[] {
  const propertyValues: { [key: string]: string[] } = {
    'display': ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none', 'contents', 'table', 'table-row', 'table-cell'],
    'position': ['static', 'relative', 'absolute', 'fixed', 'sticky'],
    'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
    'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
    'align-items': ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
    'text-align': ['left', 'right', 'center', 'justify', 'start', 'end'],
    'font-weight': ['normal', 'bold', 'lighter', 'bolder', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
    'border-style': ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'],
    'background-repeat': ['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round'],
    'background-attachment': ['scroll', 'fixed', 'local'],
    'background-position': ['top', 'bottom', 'left', 'right', 'center'],
    'animation-timing-function': ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end'],
    'cursor': ['auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress', 'wait', 'cell', 'crosshair', 'text', 'vertical-text', 'alias', 'copy', 'move', 'no-drop', 'not-allowed', 'grab', 'grabbing', 'all-scroll', 'col-resize', 'row-resize', 'n-resize', 'e-resize', 's-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'zoom-in', 'zoom-out'],
    'overflow': ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    'color': ['currentColor', 'transparent'],
    'background-color': ['currentColor', 'transparent'],
    'border-color': ['currentColor', 'transparent']
  };

  return propertyValues[property] || ['inherit', 'initial', 'unset'];
}

function getCssSelectors(): string[] {
  return [
    '.', '#', '*', 'element', ':hover', ':focus', ':active', ':visited', ':link',
    ':first-child', ':last-child', ':nth-child()', ':not()', '::before', '::after',
    '[attr]', '[attr=value]', '[attr^=value]', '[attr$=value]', '[attr*=value]'
  ];
}

function getPropertyDocumentation(property: string): string {
  const docs: { [key: string]: string } = {
    'color': 'Sets the color of text',
    'background-color': 'Sets the background color of an element',
    'font-size': 'Sets the size of a font',
    'font-family': 'Specifies the font family for text',
    'font-weight': 'Sets how thick or thin characters in text should be displayed',
    'margin': 'Sets all the margin properties in one declaration',
    'padding': 'Sets all the padding properties in one declaration',
    'border': 'Sets all the border properties in one declaration',
    'width': 'Sets the width of an element',
    'height': 'Sets the height of an element',
    'display': 'Specifies the display behavior of an element',
    'position': 'Specifies the type of positioning method used for an element',
    'flex': 'Specifies the length of the item, relative to the rest of the flexible items inside the same container',
    'grid': 'A shorthand property for the grid-template-rows, grid-template-columns, grid-template-areas, grid-auto-rows, grid-auto-columns, and grid-auto-flow properties',
    'align-items': 'Specifies the default alignment for items inside a flexible container or grid container',
    'justify-content': 'Specifies how the browser distributes space between and around content items',
    'text-align': 'Specifies the horizontal alignment of text in an element',
    'opacity': 'Sets the opacity level for an element',
    'transform': 'Applies a 2D or 3D transformation to an element',
    'transition': 'A shorthand property for transition-property, transition-duration, transition-timing-function, and transition-delay',
    'animation': 'A shorthand property for all the animation-* properties',
    'box-shadow': 'Attaches one or more shadows to an element',
    'border-radius': 'Defines the radius of the element\'s corners'
  };

  return docs[property] || `CSS property: ${property}`;
}

function getValueDocumentation(property: string, value: string): string {
  const docs: { [key: string]: { [key: string]: string } } = {
    'display': {
      'block': 'The element generates a block element box',
      'inline': 'The element generates one or more inline element boxes',
      'flex': 'The element behaves like a block element and lays out its content according to the flexbox model',
      'grid': 'The element behaves like a block element and lays out its content according to the grid model',
      'none': 'Turns off the display of an element'
    },
    'position': {
      'static': 'Default value. Elements render in order, as they appear in the document flow',
      'relative': 'The element is positioned relative to its normal position',
      'absolute': 'The element is positioned relative to its first positioned ancestor',
      'fixed': 'The element is positioned relative to the viewport',
      'sticky': 'The element is positioned based on the user\'s scroll position'
    },
    'font-weight': {
      'normal': 'Normal font weight (400)',
      'bold': 'Bold font weight (700)',
      'lighter': 'One relative font weight lighter',
      'bolder': 'One relative font weight heavier'
    }
  };

  return docs[property]?.[value] || `${value} value for ${property}`;
}

function getAtRuleDocumentation(rule: string): string {
  const docs: { [key: string]: string } = {
    'media': 'Applies styles based on media queries',
    'keyframes': 'Defines the animation sequence',
    'import': 'Imports an external stylesheet',
    'font-face': 'Defines custom fonts',
    'supports': 'Applies styles based on feature support',
    'charset': 'Specifies the character encoding of the stylesheet'
  };

  return docs[rule] || `CSS @${rule} rule`;
}

function getSelectorDocumentation(selector: string): string {
  const docs: { [key: string]: string } = {
    '.': 'Class selector - selects elements with a specific class attribute',
    '#': 'ID selector - selects a single element with a specific id attribute',
    '*': 'Universal selector - selects all elements',
    ':hover': 'Pseudo-class selector - selects elements when mouse is over them',
    ':focus': 'Pseudo-class selector - selects elements that have focus',
    ':first-child': 'Pseudo-class selector - selects the first child of its parent',
    '::before': 'Pseudo-element selector - inserts content before the element',
    '::after': 'Pseudo-element selector - inserts content after the element'
  };

  return docs[selector] || `CSS selector: ${selector}`;
}