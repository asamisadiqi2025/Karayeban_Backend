export interface JwtPayload {
  sub: string;
  username: string;
  marketId: string | null;
  roles: string[];
  permissions: string[];
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
