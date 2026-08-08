export const jwtConfig = () => ({
  secret: process.env.JWT_SECRET || 'changeme',
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
});
