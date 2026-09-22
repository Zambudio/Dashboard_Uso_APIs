// Turbopack/Watchpack sobre rutas UNC o unidades de red mapeadas (como Z: en NAS/SMB)
// falla en Windows por ausencia de eventos nativos de sistema de archivos.
// Se activa polling para evitar 'Watchpack Error: UNKNOWN: unknown error, watch'.
process.env.WATCHPACK_POLLING = 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.1.14'],
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  // Electron solo pertenece al proceso principal, nunca al servidor Next.
  outputFileTracingExcludes: {
    '/*': ['node_modules/electron/**', 'node_modules/@electron/**', 'node_modules/electron-store/**'],
  },
  async headers() {
    return [
      {
        source: '/api/usage/sync',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      {
        source: '/bookmarklet.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/((?!api|bookmarklet.js).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
