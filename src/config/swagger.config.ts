export const swaggerConfig = () => ({
  enabled: process.env.SWAGGER_ENABLED === 'true',
  path: process.env.SWAGGER_PATH || '/api',
});
