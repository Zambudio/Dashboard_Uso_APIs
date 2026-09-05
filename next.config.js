// Turbopack/Watchpack sobre rutas UNC (NAS/SMB) falla por latencia y ausencia
// de junctions. Se activa el polling de forma genérica cuando el cwd es una
// ruta UNC (\\servidor\recurso).
if (/^\\\\/.test(process.cwd())) {
  process.env.WATCHPACK_POLLING = 'true';
}

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
