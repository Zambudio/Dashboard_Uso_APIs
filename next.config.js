const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingRoot: __dirname,
  },
  output: 'standalone',
};

module.exports = nextConfig;
