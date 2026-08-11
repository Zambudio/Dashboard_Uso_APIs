const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingRoot: __dirname,
    // El servidor Next.js nunca importa 'electron'/'electron-store' (solo
    // los usa electron/main.js, fuera del árbol app/api que Next traza),
    // pero el tracer los arrastraba igualmente al standalone (~350MB).
    outputFileTracingExcludes: {
      '*': ['node_modules/electron/**', 'node_modules/@electron/**', 'node_modules/electron-store/**'],
    },
  },
  output: 'standalone',
};

module.exports = nextConfig;
