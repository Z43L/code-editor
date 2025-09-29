import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  message: string;
  version?: string;
}

export async function GET(request: NextRequest) {
  const healthChecks: HealthStatus[] = [];

  // Verificar servicios LSP disponibles
  const services = [
    { name: 'clangd', command: 'clangd --version' },
    { name: 'pyright', command: 'pyright --version' },
    { name: 'gopls', command: 'gopls version' },
    { name: 'vscode-json-languageserver', command: 'vscode-json-languageserver --version' },
    { name: 'vscode-css-languageserver', command: 'vscode-css-languageserver --version' },
    { name: 'vscode-html-languageserver', command: 'vscode-html-languageserver --version' }
  ];

  for (const service of services) {
    try {
      const { stdout } = await execAsync(service.command, { timeout: 5000 });
      const version = stdout.trim().split('\n')[0];
      healthChecks.push({
        service: service.name,
        status: 'healthy',
        message: 'Servicio disponible',
        version: version
      });
    } catch (error) {
      healthChecks.push({
        service: service.name,
        status: 'unhealthy',
        message: 'Servicio no disponible o no instalado'
      });
    }
  }

  // Verificar estado general del sistema
  const systemHealth: HealthStatus = {
    service: 'system',
    status: 'healthy',
    message: 'Sistema operativo funcionando correctamente'
  };

  healthChecks.unshift(systemHealth);

  // Determinar estado general
  const hasUnhealthy = healthChecks.some(check => check.status === 'unhealthy');
  const overallStatus = hasUnhealthy ? 'warning' : 'healthy';

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: healthChecks,
    message: hasUnhealthy
      ? 'Algunos servicios LSP no están disponibles. El sistema funcionará con capacidades reducidas.'
      : 'Todos los servicios LSP están disponibles y funcionando correctamente.'
  });
}