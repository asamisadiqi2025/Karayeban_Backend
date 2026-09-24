import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function makeContext(user: any) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('PermissionsGuard', () => {
  let reflector: { get: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    prisma = { user: { findUnique: jest.fn() } };
    guard = new PermissionsGuard(reflector as any, prisma as any);
  });

  it('allows the request when the route has no @RequirePermissions', async () => {
    reflector.get.mockReturnValue(undefined);
    const allowed = await guard.canActivate(makeContext({ id: 'u1', role: 'STAFF' }));
    expect(allowed).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('never restricts SUPER_ADMIN/ADMIN/ACCOUNTANT, even without a matching permission', async () => {
    reflector.get.mockReturnValue(['expenses.create']);
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']) {
      const allowed = await guard.canActivate(makeContext({ id: 'u1', role }));
      expect(allowed).toBe(true);
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('blocks STAFF without the required permission in their custom role', async () => {
    reflector.get.mockReturnValue(['expenses.create']);
    prisma.user.findUnique.mockResolvedValue({
      customRole: { permissions: ['expenses.read'] },
      extraPermissions: null,
      deniedPermissions: null,
    });

    await expect(
      guard.canActivate(makeContext({ id: 'u1', role: 'STAFF' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows STAFF whose custom role grants the required permission', async () => {
    reflector.get.mockReturnValue(['expenses.create']);
    prisma.user.findUnique.mockResolvedValue({
      customRole: { permissions: ['expenses.create'] },
      extraPermissions: null,
      deniedPermissions: null,
    });

    const allowed = await guard.canActivate(makeContext({ id: 'u1', role: 'STAFF' }));
    expect(allowed).toBe(true);
  });

  it('lets extraPermissions grant access beyond the custom role', async () => {
    reflector.get.mockReturnValue(['expenses.create']);
    prisma.user.findUnique.mockResolvedValue({
      customRole: null,
      extraPermissions: ['expenses.create'],
      deniedPermissions: null,
    });

    const allowed = await guard.canActivate(makeContext({ id: 'u1', role: 'STAFF' }));
    expect(allowed).toBe(true);
  });

  it('lets deniedPermissions override a permission the custom role grants', async () => {
    reflector.get.mockReturnValue(['expenses.create']);
    prisma.user.findUnique.mockResolvedValue({
      customRole: { permissions: ['expenses.create'] },
      extraPermissions: null,
      deniedPermissions: ['expenses.create'],
    });

    await expect(
      guard.canActivate(makeContext({ id: 'u1', role: 'STAFF' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
