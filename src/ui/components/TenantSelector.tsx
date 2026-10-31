import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getTenantsList, TenantDetail } from '../lib/adminApi';
import { useLocale } from '../i18n';
import { ArrowPathIcon, ExclamationCircleIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';

export interface TenantSelectorProps {
  selectedTenantId: string;
  onSelectTenant: (tenantId: string, tenant?: TenantDetail) => void;
  label?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  required?: boolean;
  helperText?: string;
  id?: string;
}

export const TenantSelector: React.FC<TenantSelectorProps> = ({
  selectedTenantId,
  onSelectTenant,
  label,
  disabled = false,
  allowEmpty = false,
  emptyLabel,
  className = '',
  required = false,
  helperText,
  id = 'tenant-selector'
}) => {
  const { t } = useLocale();
  const [tenants, setTenants] = useState<TenantDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stale async response tracking
  const requestSeqRef = useRef(0);

  const fetchTenants = useCallback(async () => {
    const currentSeq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await getTenantsList();
      // Discard stale responses
      if (currentSeq !== requestSeqRef.current) return;

      const safeList = Array.isArray(list) ? list : [];
      setTenants(safeList);

      // Verify if currently selected tenant still exists in list
      if (selectedTenantId && safeList.length > 0) {
        const match = safeList.find(t => t.id === selectedTenantId);
        if (!match && !allowEmpty) {
          // Do NOT auto-select destructively; parent handles clearing
        }
      }
    } catch (err: any) {
      if (currentSeq !== requestSeqRef.current) return;
      setError(err?.message || String(err));
    } finally {
      if (currentSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [selectedTenantId, allowEmpty]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const found = tenants.find(t => t.id === val);
    onSelectTenant(val, found);
  };

  const defaultLabel = label || t('tenant.label') || 'Tenant Autorizado';
  const defaultEmptyText = emptyLabel || t('tenant.selectPrompt') || '-- Seleccionar Tenant --';

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1.5">
          <BuildingOfficeIcon className="w-3.5 h-3.5 text-zinc-400" />
          {defaultLabel} {required && <span className="text-red-500">*</span>}
        </label>
        {loading && (
          <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
            <ArrowPathIcon className="w-3 h-3 animate-spin text-blue-500" />
            {t('tenant.loading') || 'Cargando tenants...'}
          </span>
        )}
      </div>

      <div className="relative">
        <select
          id={id}
          value={selectedTenantId}
          onChange={handleChange}
          disabled={disabled || loading}
          className={`w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono transition-colors ${
            disabled ? 'opacity-60 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800' : ''
          }`}
        >
          {allowEmpty && (
            <option value="">{defaultEmptyText}</option>
          )}
          {!allowEmpty && !selectedTenantId && (
            <option value="" disabled>{defaultEmptyText}</option>
          )}
          {tenants.map(t => {
            const statusDisplay = (t.status || t.commercial_status || 'ACTIVE').toUpperCase();
            return (
              <option key={t.id} value={t.id}>
                {t.name ? `${t.name} [${statusDisplay}] — ${t.id}` : `${t.id} [${statusDisplay}]`}
              </option>
            );
          })}
        </select>
      </div>

      {/* Error state with retry */}
      {error && (
        <div className="flex items-center justify-between text-[11px] text-red-500 bg-red-500/10 p-2 rounded border border-red-500/20">
          <div className="flex items-center gap-1.5 truncate">
            <ExclamationCircleIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">{t('tenant.error') || 'Error al cargar tenants:'} {error}</span>
          </div>
          <button
            type="button"
            onClick={fetchTenants}
            className="text-[10px] font-bold underline uppercase hover:text-red-400 shrink-0 ml-2"
          >
            {t('tenant.retry') || 'Reintentar'}
          </button>
        </div>
      )}

      {/* Empty list notice */}
      {!loading && !error && tenants.length === 0 && (
        <p className="text-[11px] text-zinc-400 italic">
          {t('tenant.noTenants') || 'No se encontraron tenants registrados.'}
        </p>
      )}

      {helperText && (
        <p className="text-[10px] text-zinc-400 leading-tight">
          {helperText}
        </p>
      )}
    </div>
  );
};
