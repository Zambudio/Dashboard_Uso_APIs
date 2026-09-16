// Turbopack/Watchpack sobre rutas UNC o unidades de red mapeadas (como Z: en NAS/SMB)
// falla en Windows por ausencia de eventos nativos de sistema de archivos.
// Se activa polling para evitar 'Watchpack Error: UNKNOWN: unknown error, watch'.
process.env.WATCHPACK_POLLING = 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  // Electron solo pertenece al proceso principal, nunca al servidor Next.
  outputFileTracingExcludes: {
    '/*': ['node_modules/electron/**', 'node_modules/@electron/**', 'node_modules/electron-store/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
