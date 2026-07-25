export interface AuthUser {
  id: string;
  name: string;
  username: string;
  email: string | null;
  marketId: string | null;
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
