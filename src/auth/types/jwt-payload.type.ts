export interface JwtPayload {
  sub: string; // شناسه کاربر (user id)
  username: string;
  marketId: string | null;
}

// این چیزی است که بعد از احراز هویت به request.user می‌چسبد
export interface AuthUser {
  id: string;
  name: string;
  username: string;
  marketId: string | null;
  roles: string[];
  permissions: string[];
}