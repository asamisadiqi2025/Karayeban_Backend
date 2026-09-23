import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  let service: UploadsService;
  let storage: { delete: jest.Mock; save: jest.Mock };
  let auditLog: { record: jest.Mock };

  beforeEach(() => {
    storage = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(),
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    service = new UploadsService(storage as any, auditLog as any);
  });

  it('deletes the previous upload when a valid upload URL is provided', async () => {
    const url = '/uploads/market-logos/123e4567-e89b-12d3-a456-426614174000.png';

    await service.deleteByUrl(url);

    expect(storage.delete).toHaveBeenCalledWith(
      'market-logos/123e4567-e89b-12d3-a456-426614174000.png',
    );
  });

  it('ignores invalid or non-upload URLs', async () => {
    await service.deleteByUrl('https://example.com/logo.png');
    await service.deleteByUrl('/other/path.png');

    expect(storage.delete).not.toHaveBeenCalled();
  });
});
