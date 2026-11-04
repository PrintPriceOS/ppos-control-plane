import React, { useEffect, useState } from 'react';
import { ExclamationTriangleIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { adminFetch } from '../../lib/adminApi';
import { useLocale } from '../../i18n';

interface LockedSummary { ok: boolean; licenseActive: boolean; count: number; totalRevenueEur: number; }

/** Urgency banner: blocked portfolio = Σ amount_eur of orders AWAITING_PRINTHOUSE_LICENSE. */
export const UnlicensedRevenueBanner: React.FC = () => {
  const { t } = useLocale();
  const [summary, setSummary] = useState<LockedSummary | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<LockedSummary>('/api/billing/printhouse/locked-orders')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  if (!summary || summary.licenseActive || summary.count === 0) return null;

  const total = summary.totalRevenueEur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const unlock = async () => {
    setPaying(true);
    setError(null);
    try {
      const res = await adminFetch<{ ok: boolean; url?: string; error?: string }>(
        '/api/billing/printhouse/create-checkout-session',
        { method: 'POST', body: JSON.stringify({ returnUrl: `${window.location.origin}/jobs` }) }
      );
      if (res?.url) window.location.assign(res.url);
      else setError(res?.error || t('license.checkoutError'));
    } catch (e: any) {
      setError(e?.message || t('license.checkoutError'));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div role="alert" className="p-4 border border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 rounded-2xl flex flex-col md:flex-row md:items-center gap-3 justify-between">
      <div className="flex gap-3">
        <ExclamationTriangleIcon className="w-6 h-6 text-amber-600 shrink-0" />
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-800 dark:text-amber-300">
            {t('license.bannerTitle').replace('{count}', String(summary.count))}
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-200 mt-1">
            {t('license.bannerBody').replace('{count}', String(summary.count)).replace('{total}', total)}
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      </div>
      <button
        onClick={unlock}
        disabled={paying}
        className="flex items-center gap-2 px-4 py-2 bg-[#dc0000] text-white text-xs font-black uppercase tracking-wide rounded-xl disabled:opacity-50 cursor-pointer shrink-0"
      >
        <LockClosedIcon className="w-4 h-4" />
        {t('license.unlockCta')}
      </button>
    </div>
  );
};

