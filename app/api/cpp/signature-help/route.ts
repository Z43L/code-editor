import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ signatureHelp: null });
    }

    // Basic C++ signature help - in a full implementation you'd use clangd LSP
    const signatureHelp = null; // Not implemented yet

    return NextResponse.json({ signatureHelp });
  } catch (error) {
    console.error('C++ signature help Error en API:', error);
    return NextResponse.json({ signatureHelp: null });
  }
}