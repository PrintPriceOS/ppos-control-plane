import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('demand-driven printhouse paywall', () => {
  let calls;
  let conn;
  let service;

  beforeEach(() => {
    calls = [];
    conn = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        calls.push({ sql, params });
        return [{ affectedRows: sql.includes('marketplace_orders') ? 3 : 1 }];
      })
    };
    const mysqlPath = require.resolve('../src/api/services/mysqlClient');
    require.cache[mysqlPath] = {
      id: mysqlPath, filename: mysqlPath, loaded: true,
      exports: { query: vi.fn(), getConnection: async () => conn }
    };
    delete require.cache[require.resolve('../src/api/services/printhouseLicenseService')];
    service = require('../src/api/services/printhouseLicenseService');
  });

  it('activates license and unlocks pending orders in one transaction', async () => {
    const r = await service.activateLicense({ printhouseId: 'PH1', stripeCustomerId: 'cus_1' });
    expect(r).toEqual({ printhouseActivated: true, ordersUnlocked: 3 });
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(calls[0].sql).toContain("subscription_status = 'ACTIVE'");
    expect(calls[1].sql).toContain("dispatch_lock_reason = 'NONE'");
    expect(calls[1].params).toEqual(['PH1']);
  });

  it('rolls back when the order unlock fails', async () => {
    conn.query = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(new Error('boom'));
    await expect(service.activateLicense({ printhouseId: 'PH1' })).rejects.toThrow('boom');
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('rejects activation without printhouseId', async () => {
    await expect(service.activateLicense({})).rejects.toThrow('printhouseId required');
  });
});
