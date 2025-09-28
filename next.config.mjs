/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // Configuración para asegurar que los archivos estáticos se generen correctamente
  // No usar assetPrefix para evitar problemas con next/font
  // assetPrefix: '/',
  basePath: '',
  // Configuración para ignorar errores durante la compilación
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configuración para imágenes
  images: {
    unoptimized: true,
  },
  // Configuración para archivos estáticos
  distDir: '.next',
  // Configuración adicional para Electron
  experimental: {
    // Deshabilitamos optimizeCss para evitar problemas con critters
    optimizeCss: false,
    esmExternals: 'loose',
  },
  // Configuración para publicPath
  publicRuntimeConfig: {
    staticFolder: './static',
  },
}

export default nextConfig
