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

    // Detectar si estamos dentro de una función CSS
    const signatureHelp = getCssSignatureHelp(beforeCursor);

    return NextResponse.json({ signatureHelp });
  } catch (error) {
    console.error('CSS signature help Error en API:', error);
    return NextResponse.json({ signatureHelp: null });
  }
}

function getCssSignatureHelp(beforeCursor: string) {
  // Detectar funciones CSS
  const functionRegex = /(\w+)\s*\(\s*([^)]*)$/;
  const match = beforeCursor.match(functionRegex);

  if (match) {
    const functionName = match[1];
    const argsSoFar = match[2];

    // Contar parámetros ya proporcionados
    const paramCount = (argsSoFar.match(/,/g) || []).length;

    // Obtener la signatura para esta función
    const signature = getCssFunctionSignature(functionName);
    if (signature) {
      return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: Math.min(paramCount, signature.parameters.length - 1)
      };
    }
  }

  // Detectar propiedades CSS con múltiples valores
  const propertyRegex = /(\w+[-\w]*)\s*:\s*([^;]*)$/;
  const propMatch = beforeCursor.match(propertyRegex);

  if (propMatch) {
    const propertyName = propMatch[1];
    const valuesSoFar = propMatch[2];

    // Contar valores ya proporcionados
    const valueCount = (valuesSoFar.match(/\s+/g) || []).length;

    // Obtener la signatura para esta propiedad
    const signature = getCssPropertySignature(propertyName);
    if (signature) {
      return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: Math.min(valueCount, signature.parameters.length - 1)
      };
    }
  }

  return null;
}

function getCssFunctionSignature(functionName: string) {
  const functionSignatures: { [key: string]: any } = {
    'rgb': {
      label: 'rgb(red, green, blue)',
      documentation: 'Defines a color using the Red-Green-Blue (RGB) model',
      parameters: [
        { label: 'red', documentation: 'The red component (0-255)' },
        { label: 'green', documentation: 'The green component (0-255)' },
        { label: 'blue', documentation: 'The blue component (0-255)' }
      ]
    },
    'rgba': {
      label: 'rgba(red, green, blue, alpha)',
      documentation: 'Defines a color using the Red-Green-Blue-Alpha (RGBA) model',
      parameters: [
        { label: 'red', documentation: 'The red component (0-255)' },
        { label: 'green', documentation: 'The green component (0-255)' },
        { label: 'blue', documentation: 'The blue component (0-255)' },
        { label: 'alpha', documentation: 'The alpha component (0-1)' }
      ]
    },
    'hsl': {
      label: 'hsl(hue, saturation, lightness)',
      documentation: 'Defines a color using the Hue-Saturation-Lightness (HSL) model',
      parameters: [
        { label: 'hue', documentation: 'The hue angle (0-360)' },
        { label: 'saturation', documentation: 'The saturation percentage (0%-100%)' },
        { label: 'lightness', documentation: 'The lightness percentage (0%-100%)' }
      ]
    },
    'hsla': {
      label: 'hsla(hue, saturation, lightness, alpha)',
      documentation: 'Defines a color using the Hue-Saturation-Lightness-Alpha (HSLA) model',
      parameters: [
        { label: 'hue', documentation: 'The hue angle (0-360)' },
        { label: 'saturation', documentation: 'The saturation percentage (0%-100%)' },
        { label: 'lightness', documentation: 'The lightness percentage (0%-100%)' },
        { label: 'alpha', documentation: 'The alpha component (0-1)' }
      ]
    },
    'calc': {
      label: 'calc(expression)',
      documentation: 'Performs a calculation to be used as the property value',
      parameters: [
        { label: 'expression', documentation: 'A mathematical expression (e.g., 100% - 20px)' }
      ]
    },
    'min': {
      label: 'min(value1, value2, ...)',
      documentation: 'Returns the smallest value from a list of comma-separated expressions',
      parameters: [
        { label: 'value1, value2, ...', documentation: 'Two or more comma-separated values' }
      ]
    },
    'max': {
      label: 'max(value1, value2, ...)',
      documentation: 'Returns the largest value from a list of comma-separated expressions',
      parameters: [
        { label: 'value1, value2, ...', documentation: 'Two or more comma-separated values' }
      ]
    },
    'clamp': {
      label: 'clamp(min, val, max)',
      documentation: 'Clamps a value between an upper and lower bound',
      parameters: [
        { label: 'min', documentation: 'The minimum value' },
        { label: 'val', documentation: 'The preferred value' },
        { label: 'max', documentation: 'The maximum value' }
      ]
    },
    'translate': {
      label: 'translate(x, y)\ntranslate(x)',
      documentation: 'Translates an element along the X and Y axes',
      parameters: [
        { label: 'x', documentation: 'The translation along the X axis' },
        { label: 'y', documentation: 'The translation along the Y axis' }
      ]
    },
    'translateX': {
      label: 'translateX(x)',
      documentation: 'Translates an element along the X axis',
      parameters: [
        { label: 'x', documentation: 'The translation along the X axis' }
      ]
    },
    'translateY': {
      label: 'translateY(y)',
      documentation: 'Translates an element along the Y axis',
      parameters: [
        { label: 'y', documentation: 'The translation along the Y axis' }
      ]
    },
    'scale': {
      label: 'scale(x, y)\nscale(factor)',
      documentation: 'Scales an element along the X and Y axes',
      parameters: [
        { label: 'x', documentation: 'The scale factor along the X axis' },
        { label: 'y', documentation: 'The scale factor along the Y axis' }
      ]
    },
    'scaleX': {
      label: 'scaleX(x)',
      documentation: 'Scales an element along the X axis',
      parameters: [
        { label: 'x', documentation: 'The scale factor along the X axis' }
      ]
    },
    'scaleY': {
      label: 'scaleY(y)',
      documentation: 'Scales an element along the Y axis',
      parameters: [
        { label: 'y', documentation: 'The scale factor along the Y axis' }
      ]
    },
    'rotate': {
      label: 'rotate(angle)',
      documentation: 'Rotates an element around its origin',
      parameters: [
        { label: 'angle', documentation: 'The rotation angle (e.g., 45deg)' }
      ]
    },
    'skew': {
      label: 'skew(ax, ay)\nskew(ax)',
      documentation: 'Skews an element along the X and Y axes',
      parameters: [
        { label: 'ax', documentation: 'The skew angle along the X axis' },
        { label: 'ay', documentation: 'The skew angle along the Y axis' }
      ]
    },
    'skewX': {
      label: 'skewX(ax)',
      documentation: 'Skews an element along the X axis',
      parameters: [
        { label: 'ax', documentation: 'The skew angle along the X axis' }
      ]
    },
    'skewY': {
      label: 'skewY(ay)',
      documentation: 'Skews an element along the Y axis',
      parameters: [
        { label: 'ay', documentation: 'The skew angle along the Y axis' }
      ]
    },
    'matrix': {
      label: 'matrix(scaleX, skewY, skewX, scaleY, translateX, translateY)',
      documentation: 'Specifies a 2D transformation matrix',
      parameters: [
        { label: 'scaleX', documentation: 'The X scale factor' },
        { label: 'skewY', documentation: 'The Y skew factor' },
        { label: 'skewX', documentation: 'The X skew factor' },
        { label: 'scaleY', documentation: 'The Y scale factor' },
        { label: 'translateX', documentation: 'The X translation' },
        { label: 'translateY', documentation: 'The Y translation' }
      ]
    },
    'linear-gradient': {
      label: 'linear-gradient(direction, color-stop1, color-stop2, ...)',
      documentation: 'Creates a linear gradient',
      parameters: [
        { label: 'direction', documentation: 'The direction of the gradient (optional)' },
        { label: 'color-stop1, color-stop2, ...', documentation: 'Two or more color stops' }
      ]
    },
    'radial-gradient': {
      label: 'radial-gradient(shape size at position, color-stop1, color-stop2, ...)',
      documentation: 'Creates a radial gradient',
      parameters: [
        { label: 'shape size at position', documentation: 'The shape, size, and position (optional)' },
        { label: 'color-stop1, color-stop2, ...', documentation: 'Two or more color stops' }
      ]
    },
    'conic-gradient': {
      label: 'conic-gradient(from angle at position, color-stop1, color-stop2, ...)',
      documentation: 'Creates a conic gradient',
      parameters: [
        { label: 'from angle at position', documentation: 'The angle and position (optional)' },
        { label: 'color-stop1, color-stop2, ...', documentation: 'Two or more color stops' }
      ]
    },
    'url': {
      label: 'url(url)',
      documentation: 'References a resource by URL',
      parameters: [
        { label: 'url', documentation: 'The URL of the resource' }
      ]
    },
    'var': {
      label: 'var(--custom-property)\nvar(--custom-property, fallback)',
      documentation: 'References a custom CSS property (CSS variable)',
      parameters: [
        { label: '--custom-property', documentation: 'The name of the custom property' },
        { label: 'fallback', documentation: 'The fallback value if the custom property is not defined' }
      ]
    },
    'attr': {
      label: 'attr(attribute-name)\nattr(attribute-name, type)\nattr(attribute-name, type, fallback)',
      documentation: 'Returns the value of an attribute of the selected element',
      parameters: [
        { label: 'attribute-name', documentation: 'The name of the attribute' },
        { label: 'type', documentation: 'The type to cast the attribute value to' },
        { label: 'fallback', documentation: 'The fallback value if the attribute is not present' }
      ]
    }
  };

  return functionSignatures[functionName] || null;
}

function getCssPropertySignature(propertyName: string) {
  const propertySignatures: { [key: string]: any } = {
    'margin': {
      label: 'margin: <length> | <percentage> | auto',
      documentation: 'Sets all the margin properties in one declaration',
      parameters: [
        { label: 'all', documentation: 'All four margins' }
      ]
    },
    'margin-top': {
      label: 'margin-top: <length> | <percentage> | auto',
      documentation: 'Sets the top margin of an element',
      parameters: [
        { label: 'value', documentation: 'The margin value' }
      ]
    },
    'margin-right': {
      label: 'margin-right: <length> | <percentage> | auto',
      documentation: 'Sets the right margin of an element',
      parameters: [
        { label: 'value', documentation: 'The margin value' }
      ]
    },
    'margin-bottom': {
      label: 'margin-bottom: <length> | <percentage> | auto',
      documentation: 'Sets the bottom margin of an element',
      parameters: [
        { label: 'value', documentation: 'The margin value' }
      ]
    },
    'margin-left': {
      label: 'margin-left: <length> | <percentage> | auto',
      documentation: 'Sets the left margin of an element',
      parameters: [
        { label: 'value', documentation: 'The margin value' }
      ]
    },
    'padding': {
      label: 'padding: <length> | <percentage>',
      documentation: 'Sets all the padding properties in one declaration',
      parameters: [
        { label: 'all', documentation: 'All four paddings' }
      ]
    },
    'padding-top': {
      label: 'padding-top: <length> | <percentage>',
      documentation: 'Sets the top padding of an element',
      parameters: [
        { label: 'value', documentation: 'The padding value' }
      ]
    },
    'padding-right': {
      label: 'padding-right: <length> | <percentage>',
      documentation: 'Sets the right padding of an element',
      parameters: [
        { label: 'value', documentation: 'The padding value' }
      ]
    },
    'padding-bottom': {
      label: 'padding-bottom: <length> | <percentage>',
      documentation: 'Sets the bottom padding of an element',
      parameters: [
        { label: 'value', documentation: 'The padding value' }
      ]
    },
    'padding-left': {
      label: 'padding-left: <length> | <percentage>',
      documentation: 'Sets the left padding of an element',
      parameters: [
        { label: 'value', documentation: 'The padding value' }
      ]
    },
    'border': {
      label: 'border: <border-width> <border-style> <color>',
      documentation: 'Sets all the border properties in one declaration',
      parameters: [
        { label: 'width', documentation: 'The width of the border' },
        { label: 'style', documentation: 'The style of the border' },
        { label: 'color', documentation: 'The color of the border' }
      ]
    },
    'border-radius': {
      label: 'border-radius: <length> | <percentage>',
      documentation: 'Defines the radius of the element\'s corners',
      parameters: [
        { label: 'all', documentation: 'All four corners' }
      ]
    },
    'box-shadow': {
      label: 'box-shadow: <offset-x> <offset-y> <blur-radius> <spread-radius> <color>',
      documentation: 'Attaches one or more shadows to an element',
      parameters: [
        { label: 'offset-x', documentation: 'The horizontal offset' },
        { label: 'offset-y', documentation: 'The vertical offset' },
        { label: 'blur-radius', documentation: 'The blur radius (optional)' },
        { label: 'spread-radius', documentation: 'The spread radius (optional)' },
        { label: 'color', documentation: 'The color of the shadow (optional)' }
      ]
    },
    'text-shadow': {
      label: 'text-shadow: <offset-x> <offset-y> <blur-radius> <color>',
      documentation: 'Adds shadow to text',
      parameters: [
        { label: 'offset-x', documentation: 'The horizontal offset' },
        { label: 'offset-y', documentation: 'The vertical offset' },
        { label: 'blur-radius', documentation: 'The blur radius (optional)' },
        { label: 'color', documentation: 'The color of the shadow (optional)' }
      ]
    },
    'background': {
      label: 'background: <color> <image> <repeat> <attachment> <position>',
      documentation: 'Sets all the background properties in one declaration',
      parameters: [
        { label: 'color', documentation: 'The background color' },
        { label: 'image', documentation: 'The background image' },
        { label: 'repeat', documentation: 'How the background image is repeated' },
        { label: 'attachment', documentation: 'Whether the background is fixed or scrolls' },
        { label: 'position', documentation: 'The position of the background image' }
      ]
    },
    'font': {
      label: 'font: <font-style> <font-variant> <font-weight> <font-size> <line-height> <font-family>',
      documentation: 'Sets all the font properties in one declaration',
      parameters: [
        { label: 'style', documentation: 'The font style' },
        { label: 'variant', documentation: 'The font variant' },
        { label: 'weight', documentation: 'The font weight' },
        { label: 'size', documentation: 'The font size' },
        { label: 'line-height', documentation: 'The line height' },
        { label: 'family', documentation: 'The font family' }
      ]
    },
    'transition': {
      label: 'transition: <property> <duration> <timing-function> <delay>',
      documentation: 'A shorthand property for transition-property, transition-duration, transition-timing-function, and transition-delay',
      parameters: [
        { label: 'property', documentation: 'The CSS property to transition' },
        { label: 'duration', documentation: 'The duration of the transition' },
        { label: 'timing-function', documentation: 'The timing function' },
        { label: 'delay', documentation: 'The delay before the transition starts' }
      ]
    },
    'animation': {
      label: 'animation: <name> <duration> <timing-function> <delay> <iteration-count> <direction> <fill-mode> <play-state>',
      documentation: 'A shorthand property for all the animation-* properties',
      parameters: [
        { label: 'name', documentation: 'The name of the animation' },
        { label: 'duration', documentation: 'The duration of the animation' },
        { label: 'timing-function', documentation: 'The timing function' },
        { label: 'delay', documentation: 'The delay before the animation starts' },
        { label: 'iteration-count', documentation: 'The number of times the animation should run' },
        { label: 'direction', documentation: 'Whether the animation should play in reverse' },
        { label: 'fill-mode', documentation: 'What values are applied by the animation outside its execution time' },
        { label: 'play-state', documentation: 'Whether the animation is running or paused' }
      ]
    },
    'flex': {
      label: 'flex: <flex-grow> <flex-shrink> <flex-basis>',
      documentation: 'Specifies the length of the item, relative to the rest of the flexible items inside the same container',
      parameters: [
        { label: 'grow', documentation: 'How much the item will grow' },
        { label: 'shrink', documentation: 'How much the item will shrink' },
        { label: 'basis', documentation: 'The initial length of the item' }
      ]
    },
    'grid-template-columns': {
      label: 'grid-template-columns: <track-size>+',
      documentation: 'Defines the columns of the grid',
      parameters: [
        { label: 'track-size', documentation: 'The size of each column track' }
      ]
    },
    'grid-template-rows': {
      label: 'grid-template-rows: <track-size>+',
      documentation: 'Defines the rows of the grid',
      parameters: [
        { label: 'track-size', documentation: 'The size of each row track' }
      ]
    }
  };

  return propertySignatures[propertyName] || null;
}