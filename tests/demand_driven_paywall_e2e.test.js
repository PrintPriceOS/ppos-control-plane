import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('demand-driven printhouse paywall E2E lifecycle', () => {
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
      exports: {
        query: vi.fn(async (sql) => {
          if (sql.includes('COUNT(DISTINCT mo.order_id)')) {
            return [{ cnt: 2, total: 4840.50 }];
          }
          if (sql.includes('SELECT mo.order_id AS id')) {
            return [
              { id: 'ORD-E2E-1', order_code: 'ORD-E2E-1', status: 'OFFER_SELECTED', total_amount_eur: 2420.25, currency: 'EUR', created_at: '2026-11-10T20:00:00Z' },
              { id: 'ORD-E2E-2', order_code: 'ORD-E2E-2', status: 'OFFER_SELECTED', total_amount_eur: 2420.25, currency: 'EUR', created_at: '2026-11-10T20:05:00Z' }
            ];
          }
          if (sql.includes('FROM printhouses')) {
            return [{ id: 'PH1', tenant_id: 'TENANT_PH1', contact_email: 'ops@riga-print.lv', subscription_status: 'INACTIVE', stripe_customer_id: null }];
          }
          return [];
        }),
        getConnection: async () => conn
      }
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
    expect(calls[1].params).toEqual(['PH1', 'PH1']);
  });

  it('computes locked revenue summary (totalRevenueEur) accurately for unlicensed printhouses', async () => {
    const summary = await service.getLockedSummary('TENANT_PH1');
    expect(summary.licenseActive).toBe(false);
    expect(summary.count).toBe(2);
    expect(summary.totalRevenueEur).toBe(4840.50);
    expect(summary.lockedOrders).toHaveLength(2);
    expect(summary.lockedOrders[0]).toMatchObject({
      id: 'ORD-E2E-1',
      orderCode: 'ORD-E2E-1',
      amountEur: 2420.25,
      currency: 'EUR'
    });
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
