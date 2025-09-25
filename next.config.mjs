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
  // Configuración para webpack
  webpack: (config, { isServer }) => {
    // Configuración para manejar archivos CSS
    if (!isServer) {
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        styles: {
          name: 'styles',
          test: /\.(css|scss)$/,
          chunks: 'all',
          enforce: true,
        },
      };
    }
    return config;
  },
}

export default nextConfig
