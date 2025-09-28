import { NextRequest, NextResponse } from 'next/server';
import { Linter } from 'eslint';

const linter = new Linter();

export async function POST(request: NextRequest) {
  try {
    const { code, language } = await request.json();

    if (!code || !['javascript', 'typescript'].includes(language)) {
      return NextResponse.json({ errors: [] });
    }

    try {
      // Configuración mínima para detectar errores de sintaxis
      const config = {
        parserOptions: { 
          ecmaVersion: 2020 as const, 
          sourceType: 'module' as const,
        },
        env: { es6: true, browser: true, node: true },
        rules: {},
      };

      const results = linter.verify(code, config);
      const errors = results.map((e: any) => ({
        line: e.line,
        message: e.message,
      }));

      return NextResponse.json({ errors });
    } catch (err) {
      console.error('ESLint error:', err);
      return NextResponse.json({ errors: [{ line: 1, message: 'Error al analizar el código: ' + (err as Error).message }] });
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ errors: [] }, { status: 500 });
  }
}