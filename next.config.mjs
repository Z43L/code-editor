/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export', // Deshabilitado para permitir API routes
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
  // Habilitar Fast Refresh para hot reload
  reactStrictMode: true,
  // Configuración de webpack para mejorar el hot reload
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Mejorar el hot reload en desarrollo
      config.watchOptions = {
        poll: 1000, // Polling cada 1 segundo (útil en sistemas de archivos compartidos)
        aggregateTimeout: 300,
        ignored: /node_modules/,
      }
    }
    return config
  },
}

export default nextConfig
