export const swaggerConfig = () => ({
  // Swagger is enabled by default outside production; set SWAGGER_ENABLED
  // explicitly to force it on/off.
  enabled: process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === 'true'
    : process.env.NODE_ENV !== 'production',
  // Path is relative to the global prefix, e.g. final URL is /api/docs
  path: process.env.SWAGGER_PATH || 'docs',
  title: process.env.SWAGGER_TITLE || 'Karayeban Backend API',
  description:
    process.env.SWAGGER_DESCRIPTION || 'REST API documentation for Karayeban Backend',
  version: process.env.SWAGGER_VERSION || '1.0',
  // When both are set, the docs UI + spec are gated behind HTTP Basic Auth.
  user: process.env.SWAGGER_USER || '',
  password: process.env.SWAGGER_PASSWORD || '',
});
