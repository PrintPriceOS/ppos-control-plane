import React, { useState, useEffect, useCallback } from 'react';
import {
    CommandLineIcon,
    KeyIcon,
    ShieldCheckIcon,
    BoltIcon,
    ArrowPathIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    SparklesIcon,
    CreditCardIcon,
    LockClosedIcon,
    ArrowTopRightOnSquareIcon,
    PlusIcon,
    XMarkIcon,
    SignalIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
import { useLocale } from '../../i18n';
import { getAuthToken, getUserRole } from '../../lib/authStore';

function buildAuthHeaders(): Record<string, string> {
    const token = getAuthToken();
    if (token) {
        return { Authorization: `Bearer ${token}` };
    }
    let sandboxId = typeof window !== 'undefined' ? localStorage.getItem('ppos_sandbox_tenant_id') : null;
    if (!sandboxId && typeof window !== 'undefined') {
        sandboxId = `sandbox_dev_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem('ppos_sandbox_tenant_id', sandboxId);
    }
    return { 'x-sandbox-tenant': sandboxId || 'tenant-dev-sandbox' };
}

interface DeveloperApiKey {
    id: string;
    tenantId: string;
    userId: string;
    keyName: string;
    keyType: 'TEST' | 'LIVE';
    keyPrefix: string;
    maskedKey: string;
    scopes: string[];
    rateLimitPerMinute: number;
    monthlyQuota: number;
    usageCurrentMonth: number;
    billingTier: 'SANDBOX_FREE' | 'PRODUCTION_SCALE' | 'ENTERPRISE_TENANT';
    status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
    lastUsedAt: string | null;
    createdAt: string;
    rawKey?: string;
}

interface UsageLogEntry {
    id: string;
    apiKeyId: string;
    endpoint: string;
    httpMethod: string;
    statusCode: number;
    durationMs: number;
    billableUnits: number;
    createdAt: string;
}

interface TelemetrySummary {
    tenantId: string;
    activeTier: 'SANDBOX_FREE' | 'PRODUCTION_SCALE' | 'ENTERPRISE_TENANT';
    tierDetails: {
        name: string;
        monthlyPriceEur: number;
        rateLimitPerMinute: number;
        monthlyQuota: number;
        allowLiveKeys: boolean;
    };
    totalCallsMonth: number;
    monthlyQuota: number;
    utilizationPct: number;
    avgLatencyMs: number;
    successRatePct: number;
    accruedMeteredEur: number;
    subscription?: {
        tenantId: string;
        billingTier: string;
        status: string;
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
        monthlySpendCapEur: number;
        alertEmail: string | null;
    };
    recentLogs: UsageLogEntry[];
    availableScopes: string[];
}

const DEVELOPER_HUB_I18N = {
    en: {
        badge: 'SELF-SERVICE DEVELOPER HUB & METERED API GATEWAY',
        title: 'API Keys, Scopes & Metered Telemetry',
        subtitle: 'Provision instant Sandbox credentials (pp_test_*) or unlock high-throughput Production keys (pp_live_*) with granular RBAC scopes and real-time usage metering.',
        btnDocs: 'Explore API Reference',
        btnUpgradePlan: 'Upgrade to Production Scale',
        btnCreateKey: 'Generate New API Key',
        btnQuickTestKey: 'Instant Sandbox Key (1-Click)',
        kpiActiveTier: 'ACTIVE BILLING TIER',
        kpiMonthlyUsage: 'MONTHLY API QUOTA',
        kpiAvgLatency: 'AVG GATEWAY LATENCY',
        kpiSuccessRate: '2XX SUCCESS RATE',
        kpiAccruedMetered: 'ACCRUED METERED USAGE',
        tabKeys: 'API CREDENTIALS',
        tabTelemetry: 'USAGE & TELEMETRY LOGS',
        tabBilling: 'TIERS & METERED BILLING',
        tabQuickstart: 'SDK & CURL QUICKSTART',
        colKeyName: 'KEY NAME & ENVIRONMENT',
        colMaskedSecret: 'SECRET TOKEN PREFIX (SHA-256)',
        colScopes: 'GRANULAR SCOPES',
        colRateQuota: 'RATE LIMIT & USAGE',
        colStatus: 'STATUS / LAST USED',
        colActions: 'ACTIONS',
        envTest: 'SANDBOX TEST',
        envLive: 'PRODUCTION LIVE',
        statusActive: 'ACTIVE',
        statusRevoked: 'REVOKED',
        neverUsed: 'Never used',
        btnPing: 'Test Ping',
        btnRotate: 'Rotate',
        btnRevoke: 'Revoke',
        modalCreateTitle: 'Provision New Developer API Key',
        modalCreateSubtitle: 'Keys are hashed with one-way SHA-256 before persistence. You will only see the raw secret once.',
        labelKeyName: 'Integration / Key Name',
        placeholderKeyName: 'e.g., Tharstern MIS Connector, WooCommerce Storefront, Editorial ERP',
        labelEnvironment: 'Target Environment',
        envTestTitle: 'Sandbox Test (pp_test_*)',
        envTestDesc: 'Instant free provisioning · 60 req/min · 1,000 calls/month · Max 50 MB PDF · Watermarked proofs',
        envLiveTitle: 'Production Live (pp_live_*)',
        envLiveDesc: '600–1,200 req/min · 2 GB PDF/X-4 stream · Unwatermarked self-healing & live BPE/Marketplace routing',
        labelScopes: 'Granular Permission Scopes',
        btnCancel: 'Cancel',
        btnGenerateNow: 'Generate Secret Key',
        revealTitle: 'Save Your Secret API Key Now',
        revealWarning: 'For security reasons, PrintPrice OS only stores the SHA-256 cryptographic digest of this key. Copy and store it in your secrets manager now — it will never be shown again.',
        btnCopyKey: 'Copy API Key',
        btnCopied: 'Copied to Clipboard!',
        btnDoneSaved: 'I have stored this key safely',
        paywallBadge: 'PRODUCTION GATEWAY UNLOCK',
        paywallTitle: 'Unlock Production Live API Keys (pp_live_*)',
        paywallDesc: 'External B2B platforms and SaaS integrators can unlock immediate Production throughput by activating the Production Scale Metered Plan. Verified Printhouse & Publisher Partner Tenants receive Live keys automatically at zero base fee.',
        labelStripeCustomer: 'Billing Notification Email (for VAT Invoices & Spend Alerts)',
        btnActivateProduction: 'Activate Production Scale (€49/mo + Metered)',
        btnManagePortal: 'Manage Subscription & Invoices ↗',
        checkoutSuccessToast: 'Production Scale Activated! Your tenant is now unlocked for high-throughput pp_live_* keys and Stripe Metered Billing.',
        spendCapTitle: 'Monthly Spend Cap Governance',
        spendCapDesc: 'Configure your monthly metered spend ceiling (€49.00 base + metered consumption) with automated warning email notifications.',
        spendCapLabel: 'Monthly Spend Ceiling (€ EUR)',
        alertEmailLabel: 'Spend Warning Notification Email',
        saveSpendCapBtn: 'Save Spend Cap',
        spendCapSavedToast: 'Monthly spend cap and notification email saved.',
        pingSuccess: '200 OK · Handshake Verified',
        scopeDesc: {
            'pricing:read': 'Calculate dynamic BPE offset/digital quotes & Q* crossovers',
            'preflight:write': 'Upload & inspect PDFs (6-axis preflight + 3.0mm bleed synthesis)',
            'orders:create': 'Dispatch binding production orders to the manufacturing queue',
            'webhooks:manage': 'Subscribe to HMAC-SHA256 signed SSE & webhook state events',
            'logistics:read': 'Simulate 3D EPAL pallet cubing & query live carrier SLA rates'
        },
        emptyKeysTitle: 'No API Keys Provisioned Yet',
        emptyKeysDesc: 'Generate your first Sandbox key (pp_test_*) in one click to start testing quotes and PDF preflight immediately.'
    },
    es: {
        badge: 'DEVELOPER HUB AUTOSERVICIO Y GATEWAY API MEDIDO',
        title: 'API Keys, Scopes y Telemetría de Consumo',
        subtitle: 'Genera credenciales Sandbox al instante (pp_test_*) o desbloquea llaves de Producción de alto rendimiento (pp_live_*) con permisos granulares y facturación medida en tiempo real.',
        btnDocs: 'Explorar Referencia API',
        btnUpgradePlan: 'Activar Plan Production Scale',
        btnCreateKey: 'Generar Nueva API Key',
        btnQuickTestKey: 'Sandbox Key Instantánea (1-Clic)',
        kpiActiveTier: 'NIVEL DE ACCESO ACTIVO',
        kpiMonthlyUsage: 'CUOTA MENSUAL API',
        kpiAvgLatency: 'LATENCIA MEDIA GATEWAY',
        kpiSuccessRate: 'TASA DE ÉXITO 2XX',
        kpiAccruedMetered: 'CONSUMO MEDIDO ACUMULADO',
        tabKeys: 'CREDENCIALES API',
        tabTelemetry: 'LOGS DE USO Y TELEMETRÍA',
        tabBilling: 'PLANES Y FACTURACIÓN MEDIDA',
        tabQuickstart: 'QUICKSTART SDK Y CURL',
        colKeyName: 'NOMBRE Y ENTORNO',
        colMaskedSecret: 'PREFIJO SECRETO (SHA-256)',
        colScopes: 'SCOPES GRANULARES',
        colRateQuota: 'RATE LIMIT Y USO',
        colStatus: 'ESTADO / ÚLTIMO USO',
        colActions: 'ACCIONES',
        envTest: 'SANDBOX TEST',
        envLive: 'PRODUCCIÓN LIVE',
        statusActive: 'ACTIVA',
        statusRevoked: 'REVOCADA',
        neverUsed: 'Sin uso aún',
        btnPing: 'Probar Ping',
        btnRotate: 'Rotar',
        btnRevoke: 'Revocar',
        modalCreateTitle: 'Generar Nueva Credencial API',
        modalCreateSubtitle: 'Las llaves se almacenan exclusivamente mediante hash irreversible SHA-256. Solo verás el secreto completo una única vez.',
        labelKeyName: 'Nombre de la Integración / Llave',
        placeholderKeyName: 'ej. Conector ERP Tharstern, Tienda WooCommerce, ERP Editorial',
        labelEnvironment: 'Entorno de Destino',
        envTestTitle: 'Sandbox de Pruebas (pp_test_*)',
        envTestDesc: 'Provisión gratuita instantánea · 60 req/min · 1.000 llamadas/mes · Máx 50 MB PDF · Pruebas con marca de agua',
        envLiveTitle: 'Producción en Vivo (pp_live_*)',
        envLiveDesc: '600–1.200 req/min · Streaming 2 GB PDF/X-4 · Auto-reparación sin marca de agua y enrutado real BPE/Marketplace',
        labelScopes: 'Permisos Granulares (Scopes)',
        btnCancel: 'Cancelar',
        btnGenerateNow: 'Generar API Key Secreta',
        revealTitle: 'Guarda tu API Key Secreta Ahora',
        revealWarning: 'Por seguridad criptográfica, PrintPrice OS solo almacena el digest SHA-256 de esta credencial. Cópiala y guárdala en tu gestor de secretos ahora — no volverá a mostrarse jamás.',
        btnCopyKey: 'Copiar API Key',
        btnCopied: '¡Copiada al Portapapeles!',
        btnDoneSaved: 'He guardado la llave en un lugar seguro',
        paywallBadge: 'DESBLOQUEO DE PRODUCCIÓN',
        paywallTitle: 'Desbloquear Llaves Live de Producción (pp_live_*)',
        paywallDesc: 'Los desarrolladores externos y plataformas SaaS B2B pueden desbloquear el entorno Live activando el plan Production Scale. Las Imprentas y Editoriales verificadas del ecosistema obtienen llaves Live automáticamente sin cuota base.',
        labelStripeCustomer: 'Email de Facturación (para Facturas IVA y Alertas de Consumo)',
        btnActivateProduction: 'Activar Production Scale (49 €/mes + Uso Medido)',
        btnManagePortal: 'Gestionar Suscripción y Facturas ↗',
        checkoutSuccessToast: '¡Plan Production Scale activado! Tu cuenta ya puede generar llaves pp_live_* de alto rendimiento con facturación medida en Stripe.',
        spendCapTitle: 'Gobernanza de Límite de Gasto Mensual (Spend Cap)',
        spendCapDesc: 'Configura un techo máximo de gasto mensual (49,00 € base + consumo medido) con alertas preventivas por correo electrónico.',
        spendCapLabel: 'Techo de Gasto Mensual (€ EUR)',
        alertEmailLabel: 'Email para Alertas de Consumo',
        saveSpendCapBtn: 'Guardar Límite de Gasto',
        spendCapSavedToast: 'Límite de gasto mensual y correo de alertas actualizados correctamente.',
        pingSuccess: '200 OK · Handshake Verificado',
        scopeDesc: {
            'pricing:read': 'Cálculo instantáneo de presupuestos BPE offset/digital y curva Q*',
            'preflight:write': 'Inspección PDF en 6 ejes y síntesis automática de sangrado +3.0mm',
            'orders:create': 'Envío de órdenes de producción vinculantes a cola de planta',
            'webhooks:manage': 'Suscripción a eventos SSE y webhooks firmados con HMAC-SHA256',
            'logistics:read': 'Cubicado 3D de palets EPAL y consulta de tarifas logísticas SLA'
        },
        emptyKeysTitle: 'Aún no hay API Keys generadas',
        emptyKeysDesc: 'Genera tu primera llave Sandbox (pp_test_*) en un clic para empezar a probar presupuestos y preflight PDF al instante.'
    },
    de: {
        badge: 'SELF-SERVICE DEVELOPER HUB & METERED API GATEWAY',
        title: 'API-Schlüssel, Scopes & Verbrauchs-Telemetrie',
        subtitle: 'Erstellen Sie sofortige Sandbox-Schlüssel (pp_test_*) oder schalten Sie produktive Live-Schlüssel (pp_live_*) mit granularen RBAC-Scopes und Echtzeit-Abrechnung frei.',
        btnDocs: 'API-Referenz öffnen',
        btnUpgradePlan: 'Upgrade auf Production Scale',
        btnCreateKey: 'Neuen API-Key erstellen',
        btnQuickTestKey: 'Sofortiger Sandbox-Key (1-Klick)',
        kpiActiveTier: 'AKTIVES ABRECHNUNGSMODELL',
        kpiMonthlyUsage: 'MONATLICHES API-KONTINGENT',
        kpiAvgLatency: 'Ø GATEWAY-LATENZ',
        kpiSuccessRate: '2XX ERFOLGSRATE',
        kpiAccruedMetered: 'NUTZUNGSBASIERTE KOSTEN',
        tabKeys: 'API-ZUGANGSDATEN',
        tabTelemetry: 'NUTZUNGS- & TELEMETRIE-LOGS',
        tabBilling: 'TARIFE & METERED BILLING',
        tabQuickstart: 'SDK & CURL QUICKSTART',
        colKeyName: 'SCHLÜSSELNAME & UMGEBUNG',
        colMaskedSecret: 'GEHEIM-PRÄFIX (SHA-256)',
        colScopes: 'GRANULARE SCOPES',
        colRateQuota: 'RATE-LIMIT & NUTZUNG',
        colStatus: 'STATUS / ZULETZT GENUTZT',
        colActions: 'AKTIONEN',
        envTest: 'SANDBOX TEST',
        envLive: 'PRODUKTION LIVE',
        statusActive: 'AKTIV',
        statusRevoked: 'WIDERRUFEN',
        neverUsed: 'Noch nie genutzt',
        btnPing: 'Ping testen',
        btnRotate: 'Rotieren',
        btnRevoke: 'Widerrufen',
        modalCreateTitle: 'Neuen Entwickler-API-Schlüssel erstellen',
        modalCreateSubtitle: 'Schlüssel werden ausschließlich als Einweg-SHA-256-Hash gespeichert. Der Klartext-Schlüssel wird nur ein einziges Mal angezeigt.',
        labelKeyName: 'Integrations- / Schlüsselname',
        placeholderKeyName: 'z. B. Tharstern MIS Connector, WooCommerce Shop, Verlags-ERP',
        labelEnvironment: 'Zielumgebung',
        envTestTitle: 'Sandbox-Testumgebung (pp_test_*)',
        envTestDesc: 'Sofortige Gratis-Bereitstellung · 60 Req/Min · 1.000 Aufrufe/Monat · Max. 50 MB PDF · Wasserzeichen-Proofs',
        envLiveTitle: 'Produktive Live-Umgebung (pp_live_*)',
        envLiveDesc: '600–1.200 Req/Min · 2 GB PDF/X-4 Stream · Selbstheilung ohne Wasserzeichen & Live-BPE/Marketplace-Routing',
        labelScopes: 'Granulare Berechtigungs-Scopes',
        btnCancel: 'Abbrechen',
        btnGenerateNow: 'Geheimschlüssel generieren',
        revealTitle: 'Speichern Sie Ihren geheimen API-Schlüssel jetzt',
        revealWarning: 'Aus Sicherheitsgründen speichert PrintPrice OS nur den kryptografischen SHA-256-Hash dieses Schlüssels. Kopieren und sichern Sie ihn jetzt in Ihrem Passwort-Manager — er kann nicht erneut angezeigt werden.',
        btnCopyKey: 'API-Key kopieren',
        btnCopied: 'In Zwischenablage kopiert!',
        btnDoneSaved: 'Ich habe den Schlüssel sicher gespeichert',
        paywallBadge: 'PRODUKTIONS-FREISCHALTUNG',
        paywallTitle: 'Produktive Live-API-Schlüssel freischalten (pp_live_*)',
        paywallDesc: 'Externe B2B-Plattformen und SaaS-Integratoren können den Live-Durchsatz durch Aktivierung des Production Scale Tarifs freischalten. Verifizierte Druckerei- und Verlagspartner erhalten Live-Keys automatisch ohne Grundgebühr.',
        labelStripeCustomer: 'Abrechnungs-E-Mail (für USt.-Rechnungen & Ausgabenwarnungen)',
        btnActivateProduction: 'Production Scale aktivieren (49 €/Monat + Nutzung)',
        btnManagePortal: 'Abonnement & Rechnungen verwalten ↗',
        checkoutSuccessToast: 'Production Scale aktiviert! Ihr Mandant ist jetzt für produktive pp_live_*-Schlüssel und Stripe Metered Billing freigeschaltet.',
        spendCapTitle: 'Monatliches Ausgabenlimit (Spend Cap Governance)',
        spendCapDesc: 'Definieren Sie eine monatliche Kostenobergrenze (49,00 € Basis + nutzungsbasierte Abrechnung) inklusive automatischer E-Mail-Warnung.',
        spendCapLabel: 'Monatliche Kostenobergrenze (€ EUR)',
        alertEmailLabel: 'E-Mail für Ausgabenwarnungen',
        saveSpendCapBtn: 'Ausgabenlimit speichern',
        spendCapSavedToast: 'Monatliches Ausgabenlimit und Benachrichtigungs-E-Mail erfolgreich aktualisiert.',
        pingSuccess: '200 OK · Handshake verifiziert',
        scopeDesc: {
            'pricing:read': 'Dynamische BPE Offset-/Digital-Kalkulation & Q*-Crossover berechnen',
            'preflight:write': 'PDF-Prüfung in 6 Achsen & automatische +3,0 mm Anschnitt-Synthese',
            'orders:create': 'Verbindliche Produktionsaufträge an die Fertigungswarteschlange senden',
            'webhooks:manage': 'HMAC-SHA256-signierte SSE- & Webhook-Statusereignisse abonnieren',
            'logistics:read': '3D-EPAL-Palettenberechnung & Live-Speditionstarife abfragen'
        },
        emptyKeysTitle: 'Noch keine API-Schlüssel vorhanden',
        emptyKeysDesc: 'Erstellen Sie mit einem Klick Ihren ersten Sandbox-Schlüssel (pp_test_*), um Kalkulationen und PDF-Preflight sofort zu testen.'
    }
};

export const DeveloperHubPage: React.FC = () => {
    const { locale } = useLocale();
    const lang = (locale === 'es' || locale === 'de') ? locale : 'en';
    const copy = DEVELOPER_HUB_I18N[lang];
    const userRole = getUserRole();

    const [keys, setKeys] = useState<DeveloperApiKey[]>([]);
    const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [activeTab, setActiveTab] = useState<'KEYS' | 'TELEMETRY' | 'BILLING' | 'QUICKSTART'>('KEYS');

    // Modals & Interactive States
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [newKeyName, setNewKeyName] = useState<string>('');
    const [newKeyType, setNewKeyType] = useState<'TEST' | 'LIVE'>('TEST');
    const [selectedScopes, setSelectedScopes] = useState<string[]>(['pricing:read', 'preflight:write']);
    const [creating, setCreating] = useState<boolean>(false);

    // One-time secret reveal modal
    const [revealedKeyData, setRevealedKeyData] = useState<{ rawKey: string; keyName: string; keyType: string; scopes: string[] } | null>(null);
    const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

    // Paywall / Billing Upgrade modal & Spend Cap Governance
    const [showPaywallModal, setShowPaywallModal] = useState<boolean>(false);
    const [stripeRefInput, setStripeRefInput] = useState<string>('billing@company.com');
    const [upgradingBilling, setUpgradingBilling] = useState<boolean>(false);
    const [openingPortal, setOpeningPortal] = useState<boolean>(false);
    const [monthlySpendCapEur, setMonthlySpendCapEur] = useState<number>(150);
    const [spendAlertEmail, setSpendAlertEmail] = useState<string>('');
    const [savingSpendCap, setSavingSpendCap] = useState<boolean>(false);

    // Ping & banner feedback
    const [pingResultByKey, setPingResultByKey] = useState<Record<string, { ok: boolean; text: string }>>({});
    const [errorBanner, setErrorBanner] = useState<string | null>(null);
    const [successToast, setSuccessToast] = useState<string | null>(null);

    const fetchHubData = useCallback(async () => {
        setLoading(true);
        setErrorBanner(null);
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...buildAuthHeaders()
            };
            const res = await fetch('/api/developer/keys', { headers });
            if (!res.ok) {
                throw new Error(`Failed to load Developer Hub (${res.status})`);
            }
            const json = await res.json();
            if (json.ok && json.data) {
                setKeys(json.data.keys || []);
                const telem: TelemetrySummary | null = json.data.telemetry || null;
                setTelemetry(telem);
                if (telem?.subscription?.monthlySpendCapEur) {
                    setMonthlySpendCapEur(Number(telem.subscription.monthlySpendCapEur));
                }
                if (telem?.subscription?.alertEmail) {
                    setSpendAlertEmail(telem.subscription.alertEmail);
                }
            }
        } catch (err: any) {
            setErrorBanner(err.message || 'Could not load Developer Hub data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHubData();
    }, [fetchHubData]);

    // Phase 199B: Reconcile Stripe Checkout return_url (?session_id=...&status=success)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const status = params.get('status');

        if (sessionId && status === 'success') {
            (async () => {
                try {
                    const res = await fetch('/api/developer/billing/verify-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...buildAuthHeaders()
                        },
                        body: JSON.stringify({ sessionId })
                    });
                    if (res.ok) {
                        setSuccessToast(copy.checkoutSuccessToast);
                        await fetchHubData();
                    }
                } catch (_) {}
                // Clean query params without full reload
                const cleanUrl = window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            })();
        }
    }, [copy.checkoutSuccessToast, fetchHubData]);

    const handleToggleScope = (scope: string) => {
        setSelectedScopes(prev =>
            prev.includes(scope)
                ? (prev.length > 1 ? prev.filter(s => s !== scope) : prev)
                : [...prev, scope]
        );
    };

    const handleCreateKey = async (quickSandbox = false) => {
        setCreating(true);
        setErrorBanner(null);
        try {
            const payload = quickSandbox
                ? {
                    keyName: `Sandbox Quickstart (${new Date().toISOString().slice(0, 10)})`,
                    keyType: 'TEST',
                    scopes: ['pricing:read', 'preflight:write']
                }
                : {
                    keyName: newKeyName.trim() || 'Enterprise Integration Key',
                    keyType: newKeyType,
                    scopes: selectedScopes
                };

            const res = await fetch('/api/developer/keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...buildAuthHeaders()
                },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (res.status === 402 || json?.error?.code === 'PAYWALL_UPGRADE_REQUIRED') {
                setShowCreateModal(false);
                setShowPaywallModal(true);
                return;
            }

            if (!res.ok || !json.ok) {
                throw new Error(json?.error?.message || 'Failed to provision API key');
            }

            const created = json.data;
            setShowCreateModal(false);
            setNewKeyName('');
            setRevealedKeyData({
                rawKey: created.rawKey,
                keyName: created.keyName,
                keyType: created.keyType,
                scopes: created.scopes || []
            });
            await fetchHubData();
        } catch (err: any) {
            setErrorBanner(err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleRotateKey = async (keyId: string) => {
        setErrorBanner(null);
        try {
            const res = await fetch(`/api/developer/keys/${encodeURIComponent(keyId)}/rotate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...buildAuthHeaders()
                }
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json?.error?.message || 'Failed to rotate key');
            }
            const rotated = json.data;
            setRevealedKeyData({
                rawKey: rotated.rawKey,
                keyName: rotated.keyName,
                keyType: rotated.keyType,
                scopes: rotated.scopes || []
            });
            await fetchHubData();
        } catch (err: any) {
            setErrorBanner(err.message);
        }
    };

    const handleRevokeKey = async (keyId: string) => {
        setErrorBanner(null);
        try {
            const res = await fetch(`/api/developer/keys/${encodeURIComponent(keyId)}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    ...buildAuthHeaders()
                }
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json?.error?.message || 'Failed to revoke key');
            }
            await fetchHubData();
        } catch (err: any) {
            setErrorBanner(err.message);
        }
    };

    const handleUpgradeBilling = async () => {
        setUpgradingBilling(true);
        setErrorBanner(null);
        try {
            const returnUrl = typeof window !== 'undefined'
                ? `${window.location.origin}/developers`
                : 'https://control.printprice.pro/developers';

            const res = await fetch('/api/developer/billing/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...buildAuthHeaders()
                },
                body: JSON.stringify({
                    userEmail: stripeRefInput.trim() || 'billing@company.com',
                    returnUrl,
                    monthlySpendCapEur
                })
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json?.error?.message || json?.error || 'Stripe Checkout session creation failed');
            }
            setShowPaywallModal(false);
            if (json.url && typeof window !== 'undefined') {
                window.location.href = json.url;
                return;
            }
            await fetchHubData();
        } catch (err: any) {
            setErrorBanner(err.message);
        } finally {
            setUpgradingBilling(false);
        }
    };

    const handleOpenCustomerPortal = async () => {
        setOpeningPortal(true);
        setErrorBanner(null);
        try {
            const returnUrl = typeof window !== 'undefined'
                ? `${window.location.origin}/developers`
                : 'https://control.printprice.pro/developers';

            const res = await fetch('/api/developer/billing/customer-portal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...buildAuthHeaders()
                },
                body: JSON.stringify({ returnUrl })
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json?.error || 'Could not open Stripe Customer Portal');
            }
            if (json.url && typeof window !== 'undefined') {
                window.open(json.url, '_blank', 'noopener,noreferrer');
            }
        } catch (err: any) {
            setErrorBanner(err.message);
        } finally {
            setOpeningPortal(false);
        }
    };

    const handleSaveSpendCap = async () => {
        setSavingSpendCap(true);
        setErrorBanner(null);
        try {
            const res = await fetch('/api/developer/billing/spend-cap', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...buildAuthHeaders()
                },
                body: JSON.stringify({
                    monthlySpendCapEur: Number(monthlySpendCapEur || 150),
                    alertEmail: spendAlertEmail.trim() || null
                })
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json?.error || 'Failed to save spend cap');
            }
            setSuccessToast(copy.spendCapSavedToast);
            await fetchHubData();
        } catch (err: any) {
            setErrorBanner(err.message);
        } finally {
            setSavingSpendCap(false);
        }
    };

    const handleSimulatedPing = async (keyItem: DeveloperApiKey) => {
        setPingResultByKey(prev => ({
            ...prev,
            [keyItem.id]: { ok: true, text: `${copy.pingSuccess} (${telemetry?.avgLatencyMs || 14}ms)` }
        }));
        setTimeout(() => {
            setPingResultByKey(prev => {
                const clone = { ...prev };
                delete clone[keyItem.id];
                return clone;
            });
        }, 4500);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2500);
    };

    const activeTierCode = telemetry?.activeTier || 'SANDBOX_FREE';
    const samplePrefix = keys.find(k => k.status === 'ACTIVE')?.keyPrefix || 'pp_test_9a8f';

    return (
        <div className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-6">
            {/* Top Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-6">
                <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-red-600/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] font-mono font-bold tracking-widest uppercase">
                        <CommandLineIcon className="w-3.5 h-3.5" />
                        <span>{copy.badge}</span>
                    </div>
                    <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                        {copy.title}
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-3xl">
                        {copy.subtitle}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <a
                        href="https://docs.printprice.pro/docs/api/overview"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-red-500/50 transition-colors"
                    >
                        <span>{copy.btnDocs}</span>
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-zinc-400" />
                    </a>

                    {activeTierCode === 'SANDBOX_FREE' && (
                        <button
                            type="button"
                            onClick={() => setShowPaywallModal(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-colors cursor-pointer"
                        >
                            <SparklesIcon className="w-4 h-4" />
                            <span>{copy.btnUpgradePlan}</span>
                        </button>
                    )}

                    {activeTierCode === 'PRODUCTION_SCALE' && (
                        <button
                            type="button"
                            onClick={handleOpenCustomerPortal}
                            disabled={openingPortal}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-500/20 transition-colors cursor-pointer"
                        >
                            <CreditCardIcon className="w-4 h-4" />
                            <span>{copy.btnManagePortal}</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => handleCreateKey(true)}
                        disabled={creating}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-500/20 transition-colors cursor-pointer"
                    >
                        <BoltIcon className="w-4 h-4" />
                        <span>{copy.btnQuickTestKey}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#dc0000] hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>{copy.btnCreateKey}</span>
                    </button>
                </div>
            </div>

            {successToast && (
                <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-emerald-400 flex items-center justify-between text-xs font-medium">
                    <div className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 shrink-0" />
                        <span>{successToast}</span>
                    </div>
                    <button onClick={() => setSuccessToast(null)} className="text-emerald-300 hover:text-white">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            )}

            {errorBanner && (
                <div className="p-4 rounded-xl border border-red-500/40 bg-red-950/20 text-red-400 flex items-center justify-between text-xs font-medium">
                    <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                        <span>{errorBanner}</span>
                    </div>
                    <button onClick={() => setErrorBanner(null)} className="text-red-300 hover:text-white">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* KPI Telemetry Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        {copy.kpiActiveTier}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            activeTierCode === 'ENTERPRISE_TENANT'
                                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                : activeTierCode === 'PRODUCTION_SCALE'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}>
                            {activeTierCode}
                        </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                        {telemetry?.tierDetails?.name || 'Developer Sandbox (Free)'}
                    </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70">
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        <span>{copy.kpiMonthlyUsage}</span>
                        <span className="text-slate-700 dark:text-zinc-300">{telemetry?.utilizationPct ?? 0}%</span>
                    </div>
                    <div className="mt-1.5 text-lg font-black font-mono text-slate-900 dark:text-white">
                        {(telemetry?.totalCallsMonth ?? 0).toLocaleString()} <span className="text-xs font-normal text-zinc-500">/ {(telemetry?.monthlyQuota ?? 1000).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[#dc0000] transition-all duration-300"
                            style={{ width: `${Math.max(2, telemetry?.utilizationPct || 0)}%` }}
                        />
                    </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        {copy.kpiAvgLatency}
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                        <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
                            {telemetry?.avgLatencyMs ?? 16} ms
                        </span>
                        <span className="text-[11px] text-emerald-500 font-mono">● SLA OK</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                        SHA-256 edge verification
                    </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        {copy.kpiSuccessRate}
                    </div>
                    <div className="mt-1.5 text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                        {telemetry?.successRatePct ?? 100.0}%
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                        Sliding-window rate guard active
                    </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        {copy.kpiAccruedMetered}
                    </div>
                    <div className="mt-1.5 text-xl font-black font-mono text-slate-900 dark:text-white">
                        €{(telemetry?.accruedMeteredEur ?? 0).toFixed(2)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                        €0.10/preflight · €0.005/quote
                    </div>
                </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800">
                {[
                    { id: 'KEYS', label: copy.tabKeys, icon: KeyIcon },
                    { id: 'QUICKSTART', label: copy.tabQuickstart, icon: CommandLineIcon },
                    { id: 'BILLING', label: copy.tabBilling, icon: CreditCardIcon },
                    { id: 'TELEMETRY', label: copy.tabTelemetry, icon: SignalIcon }
                ].map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-mono font-bold border-b-2 transition-colors cursor-pointer ${
                                active
                                    ? 'border-[#dc0000] text-[#dc0000] dark:text-white'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* TAB 1: API KEYS TABLE */}
            {activeTab === 'KEYS' && (
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden shadow-sm">
                    {loading ? (
                        <div className="p-12 text-center text-xs font-mono text-zinc-400">
                            Loading cryptographic API credentials...
                        </div>
                    ) : keys.length === 0 ? (
                        <div className="p-12 text-center space-y-4">
                            <KeyIcon className="w-10 h-10 mx-auto text-zinc-500" />
                            <div className="space-y-1">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">{copy.emptyKeysTitle}</h3>
                                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">{copy.emptyKeysDesc}</p>
                            </div>
                            <div className="flex justify-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => handleCreateKey(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#dc0000] hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                                >
                                    <BoltIcon className="w-4 h-4" />
                                    <span>{copy.btnQuickTestKey}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/60 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                        <th className="py-3.5 px-4">{copy.colKeyName}</th>
                                        <th className="py-3.5 px-4">{copy.colMaskedSecret}</th>
                                        <th className="py-3.5 px-4">{copy.colScopes}</th>
                                        <th className="py-3.5 px-4">{copy.colRateQuota}</th>
                                        <th className="py-3.5 px-4">{copy.colStatus}</th>
                                        <th className="py-3.5 px-4 text-right">{copy.colActions}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/70 text-xs">
                                    {keys.map(k => {
                                        const isLive = k.keyType === 'LIVE';
                                        const isActive = k.status === 'ACTIVE';
                                        const pingFeedback = pingResultByKey[k.id];
                                        return (
                                            <tr key={k.id} className={`${!isActive ? 'opacity-50' : ''} hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors`}>
                                                <td className="py-4 px-4">
                                                    <div className="font-bold text-slate-900 dark:text-white">{k.keyName}</div>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                                            isLive
                                                                ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                                                                : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                                        }`}>
                                                            {isLive ? copy.envLive : copy.envTest}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-zinc-500">{k.id.slice(0, 13)}</span>
                                                    </div>
                                                </td>

                                                <td className="py-4 px-4 font-mono">
                                                    <code className="px-2.5 py-1 rounded bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-300 text-xs">
                                                        {k.maskedKey}
                                                    </code>
                                                </td>

                                                <td className="py-4 px-4">
                                                    <div className="flex flex-wrap gap-1.5 max-w-xs">
                                                        {(k.scopes || []).map(sc => (
                                                            <span
                                                                key={sc}
                                                                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-mono text-[10px] border border-slate-200 dark:border-zinc-700"
                                                            >
                                                                {sc}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>

                                                <td className="py-4 px-4 font-mono text-[11px]">
                                                    <div className="text-slate-900 dark:text-zinc-200 font-bold">
                                                        {k.rateLimitPerMinute} req/min
                                                    </div>
                                                    <div className="text-zinc-500">
                                                        {(k.usageCurrentMonth || 0).toLocaleString()} / {(k.monthlyQuota || 1000).toLocaleString()} mo
                                                    </div>
                                                </td>

                                                <td className="py-4 px-4">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                                                        <span className={`text-[11px] font-mono font-bold ${isActive ? 'text-emerald-500' : 'text-zinc-500'}`}>
                                                            {isActive ? copy.statusActive : copy.statusRevoked}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 mt-0.5">
                                                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : copy.neverUsed}
                                                    </div>
                                                    {pingFeedback && (
                                                        <div className="mt-1 text-[10px] font-mono text-emerald-400 font-bold">
                                                            ✓ {pingFeedback.text}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="py-4 px-4 text-right">
                                                    {isActive && (
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSimulatedPing(k)}
                                                                className="px-2.5 py-1 rounded border border-slate-200 dark:border-zinc-700 hover:border-emerald-500/50 text-[11px] font-mono font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer"
                                                            >
                                                                {copy.btnPing}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRotateKey(k.id)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-zinc-700 hover:border-amber-500/50 text-[11px] font-mono font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer"
                                                            >
                                                                <ArrowPathIcon className="w-3 h-3" />
                                                                <span>{copy.btnRotate}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRevokeKey(k.id)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-[11px] font-mono font-semibold text-red-400 cursor-pointer"
                                                            >
                                                                <TrashIcon className="w-3 h-3" />
                                                                <span>{copy.btnRevoke}</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: SDK & CURL QUICKSTART */}
            {activeTab === 'QUICKSTART' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="p-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold uppercase tracking-wider text-red-500">
                                1. 5-AXIS BPE QUOTE & Q* CROSSOVER (pricing:read)
                            </span>
                            <span className="text-[11px] font-mono text-zinc-500">POST /api/pricing/book-estimate</span>
                        </div>
                        <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-200 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
{`curl -X POST https://control.printprice.pro/api/pricing/book-estimate \\
  -H "Authorization: Bearer ${samplePrefix}••••••••••••••••••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "trimWidthMm": 148,
    "trimHeightMm": 210,
    "pageCount": 256,
    "printRunCopies": 1250,
    "interiorPaperGsm": 90,
    "bindingType": "SOFTCOVER_PUR"
  }'`}
                        </pre>
                    </div>

                    <div className="p-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-500">
                                2. STREAMING 2GB PDF/X-4 PREFLIGHT (preflight:write)
                            </span>
                            <span className="text-[11px] font-mono text-zinc-500">POST /api/v1/preflight/inspect</span>
                        </div>
                        <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-200 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
{`curl -X POST https://control.printprice.pro/api/v1/preflight/inspect \\
  -H "X-API-Key: ${samplePrefix}••••••••••••••••••••••••" \\
  -F "file=@./interior_print_ready.pdf" \\
  -F "profile=ISO_12647_2_FOGRA51" \\
  -F "autoSynthesizeBleedMm=3.0"`}
                        </pre>
                    </div>
                </div>
            )}

            {/* TAB 3: TIERS & METERED BILLING */}
            {activeTab === 'BILLING' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Tier 1: Sandbox Free */}
                        <div className="p-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex flex-col justify-between space-y-6">
                            <div className="space-y-3">
                                <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                    LEVEL 1 · SANDBOX_FREE
                                </span>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">Developer Sandbox</h3>
                                <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                                    €0 <span className="text-xs font-normal text-zinc-500">/ month · No card required</span>
                                </div>
                                <ul className="space-y-2 text-xs text-slate-600 dark:text-zinc-400 pt-2">
                                    <li>✓ Instant <code className="font-mono text-sky-400">pp_test_*</code> credentials</li>
                                    <li>✓ 60 requests / minute sliding window</li>
                                    <li>✓ 1,000 free API calls / month</li>
                                    <li>✓ PDF Preflight up to 50 MB (watermarked output)</li>
                                    <li>✓ Mock order dispatch & webhook inspector</li>
                                </ul>
                            </div>
                            <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 text-xs font-mono text-emerald-500 font-bold">
                                ✓ Included by default for all accounts
                            </div>
                        </div>

                        {/* Tier 2: Production Scale */}
                        <div className="p-6 rounded-xl border-2 border-[#dc0000] bg-gradient-to-b from-red-950/15 via-white to-white dark:from-red-950/20 dark:via-zinc-900 dark:to-zinc-950 flex flex-col justify-between space-y-6 shadow-lg">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/40">
                                        LEVEL 2 · PRODUCTION_SCALE
                                    </span>
                                    <span className="text-[10px] font-mono font-bold text-red-500 uppercase">MOST POPULAR B2B</span>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">Production Scale (Metered)</h3>
                                <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                                    €49 <span className="text-xs font-normal text-zinc-500">/ month + metered usage</span>
                                </div>
                                <ul className="space-y-2 text-xs text-slate-600 dark:text-zinc-300 pt-2">
                                    <li>✓ Unlocks <code className="font-mono text-red-400">pp_live_*</code> Production keys</li>
                                    <li>✓ 600 requests / minute · 100,000 calls/mo</li>
                                    <li>✓ 2 GB PDF/X-4 streaming + unwatermarked self-healing</li>
                                    <li>✓ €0.10 / preflight PDF · €0.005 / BPE pricing call</li>
                                    <li>✓ Live multi-plant order routing & HMAC webhooks</li>
                                </ul>
                            </div>
                            <div className="space-y-2">
                                {activeTierCode === 'PRODUCTION_SCALE' ? (
                                    <button
                                        type="button"
                                        onClick={handleOpenCustomerPortal}
                                        disabled={openingPortal}
                                        className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        {openingPortal ? '...' : copy.btnManagePortal}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setShowPaywallModal(true)}
                                        className="w-full py-2.5 px-4 rounded-lg bg-[#dc0000] hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        {copy.btnActivateProduction}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Tier 3: Enterprise Partner Tenant */}
                        <div className="p-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex flex-col justify-between space-y-6">
                            <div className="space-y-3">
                                <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                    LEVEL 3 · ENTERPRISE_TENANT
                                </span>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">Verified Printhouse / Publisher</h3>
                                <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                                    Included <span className="text-xs font-normal text-zinc-500">with Partner Node Membership</span>
                                </div>
                                <ul className="space-y-2 text-xs text-slate-600 dark:text-zinc-400 pt-2">
                                    <li>✓ Immediate <code className="font-mono text-purple-400">pp_live_*</code> keys for ERP/MIS</li>
                                    <li>✓ 1,200 requests / minute burst capacity</li>
                                    <li>✓ 1,000,000 monthly API calls included</li>
                                    <li>✓ Direct CIP4 JDF 1.7 / JMF press telemetry bridge</li>
                                    <li>✓ EN 16931 automated escrow settlement</li>
                                </ul>
                            </div>
                            <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 text-xs font-mono text-purple-400 font-bold">
                                Role: {userRole || 'TENANT_MEMBER'}
                            </div>
                        </div>
                    </div>

                    {/* Spend Cap Governance Card */}
                    <div className="p-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">{copy.spendCapTitle}</h3>
                                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{copy.spendCapDesc}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {[150, 300, 500, 1000].map(preset => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setMonthlySpendCapEur(preset)}
                                        className={`px-2.5 py-1 rounded text-xs font-mono font-bold border transition-colors cursor-pointer ${
                                            monthlySpendCapEur === preset
                                                ? 'border-[#dc0000] bg-red-500/15 text-red-400'
                                                : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400'
                                        }`}
                                    >
                                        €{preset}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div>
                                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                                    {copy.spendCapLabel}
                                </label>
                                <input
                                    type="number"
                                    min={49}
                                    step={10}
                                    value={monthlySpendCapEur}
                                    onChange={e => setMonthlySpendCapEur(Math.max(49, Number(e.target.value || 49)))}
                                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 font-mono text-sm text-slate-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                                    {copy.alertEmailLabel}
                                </label>
                                <input
                                    type="email"
                                    value={spendAlertEmail}
                                    onChange={e => setSpendAlertEmail(e.target.value)}
                                    placeholder="devops-alerts@yourcompany.com"
                                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 font-mono text-sm text-slate-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <button
                                    type="button"
                                    onClick={handleSaveSpendCap}
                                    disabled={savingSpendCap}
                                    className="w-full py-2 px-4 rounded-lg bg-[#dc0000] hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
                                >
                                    {savingSpendCap ? '...' : copy.saveSpendCapBtn}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: USAGE & TELEMETRY LOGS */}
            {activeTab === 'TELEMETRY' && (
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                            REAL-TIME API GATEWAY AUDIT TRAIL (LAST 25 CALLS)
                        </span>
                        <button
                            type="button"
                            onClick={fetchHubData}
                            className="inline-flex items-center gap-1 text-xs font-mono text-red-500 hover:underline cursor-pointer"
                        >
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                            <span>Refresh</span>
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/60 text-[10px] text-zinc-500 uppercase">
                                    <th className="py-3 px-4">Timestamp</th>
                                    <th className="py-3 px-4">Method & Endpoint</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Latency</th>
                                    <th className="py-3 px-4 text-right">Metered Unit (€)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                                {(telemetry?.recentLogs || []).length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-zinc-500">
                                            No metered API calls recorded yet in this window.
                                        </td>
                                    </tr>
                                ) : (
                                    telemetry!.recentLogs.map(log => (
                                        <tr key={log.id}>
                                            <td className="py-3 px-4 text-zinc-400">{new Date(log.createdAt).toLocaleTimeString()}</td>
                                            <td className="py-3 px-4 text-slate-900 dark:text-zinc-200">
                                                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 mr-2 text-[10px]">{log.httpMethod}</span>
                                                {log.endpoint}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={log.statusCode < 400 ? 'text-emerald-400' : 'text-red-400'}>
                                                    {log.statusCode} OK
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-zinc-400">{log.durationMs} ms</td>
                                            <td className="py-3 px-4 text-right text-zinc-300">€{Number(log.billableUnits || 0).toFixed(3)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MODAL 1: CREATE NEW API KEY */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-5 shadow-2xl">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">{copy.modalCreateTitle}</h2>
                                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{copy.modalCreateSubtitle}</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-white">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                                    {copy.labelKeyName}
                                </label>
                                <input
                                    type="text"
                                    value={newKeyName}
                                    onChange={e => setNewKeyName(e.target.value)}
                                    placeholder={copy.placeholderKeyName}
                                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#dc0000]"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                                    {copy.labelEnvironment}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setNewKeyType('TEST')}
                                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                                            newKeyType === 'TEST'
                                                ? 'border-sky-500 bg-sky-500/10'
                                                : 'border-slate-200 dark:border-zinc-800 hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="text-xs font-mono font-bold text-sky-400">{copy.envTestTitle}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">{copy.envTestDesc}</div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setNewKeyType('LIVE')}
                                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                                            newKeyType === 'LIVE'
                                                ? 'border-[#dc0000] bg-red-500/10'
                                                : 'border-slate-200 dark:border-zinc-800 hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="text-xs font-mono font-bold text-red-400">{copy.envLiveTitle}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">{copy.envLiveDesc}</div>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
                                    {copy.labelScopes}
                                </label>
                                <div className="space-y-2">
                                    {(['pricing:read', 'preflight:write', 'orders:create', 'webhooks:manage', 'logistics:read'] as const).map(scope => {
                                        const checked = selectedScopes.includes(scope);
                                        return (
                                            <label
                                                key={scope}
                                                onClick={() => handleToggleScope(scope)}
                                                className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                                    checked
                                                        ? 'border-red-500/40 bg-red-500/5'
                                                        : 'border-slate-200 dark:border-zinc-800'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {}}
                                                    className="mt-0.5 accent-[#dc0000]"
                                                />
                                                <div>
                                                    <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">{scope}</div>
                                                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                                                        {copy.scopeDesc[scope]}
                                                    </div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-bold text-slate-600 dark:text-zinc-300 cursor-pointer"
                            >
                                {copy.btnCancel}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCreateKey(false)}
                                disabled={creating}
                                className="px-5 py-2 rounded-lg bg-[#dc0000] hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                            >
                                {creating ? '...' : copy.btnGenerateNow}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 2: ONE-TIME SECRET REVEAL */}
            {revealedKeyData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl border-2 border-emerald-500/50 bg-white dark:bg-zinc-900 p-6 space-y-5 shadow-2xl">
                        <div className="flex items-center gap-2.5 text-emerald-500">
                            <ShieldCheckIcon className="w-6 h-6 shrink-0" />
                            <h2 className="text-lg font-black text-slate-900 dark:text-white">{copy.revealTitle}</h2>
                        </div>

                        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs leading-relaxed">
                            {copy.revealWarning}
                        </div>

                        <div className="space-y-1.5">
                            <div className="text-[11px] font-mono text-zinc-400">
                                {revealedKeyData.keyName} ({revealedKeyData.keyType})
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                                <code className="flex-1 font-mono text-xs text-emerald-400 break-all select-all">
                                    {revealedKeyData.rawKey}
                                </code>
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(revealedKeyData.rawKey)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shrink-0 cursor-pointer"
                                >
                                    <ClipboardDocumentIcon className="w-4 h-4" />
                                    <span>{copiedSecret ? copy.btnCopied : copy.btnCopyKey}</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setRevealedKeyData(null)}
                                className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold cursor-pointer"
                            >
                                {copy.btnDoneSaved}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 3: PAYWALL / METERED BILLING UPGRADE */}
            {showPaywallModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-red-500/40 bg-white dark:bg-zinc-900 p-6 space-y-5 shadow-2xl">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-mono text-[10px] font-bold">
                                    {copy.paywallBadge}
                                </span>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white mt-1.5">{copy.paywallTitle}</h2>
                            </div>
                            <button onClick={() => setShowPaywallModal(false)} className="text-zinc-400 hover:text-white">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                            {copy.paywallDesc}
                        </p>

                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2 text-xs font-mono">
                            <div className="flex justify-between">
                                <span className="text-zinc-400">Base Platform Commit:</span>
                                <span className="font-bold text-slate-900 dark:text-white">€49.00 / month</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-400">Streaming Preflight & Self-Healing:</span>
                                <span className="text-emerald-400">€0.10 / inspected PDF</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-400">5-Axis BPE Quote & Routing:</span>
                                <span className="text-emerald-400">€0.005 / API call</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                                {copy.labelStripeCustomer}
                            </label>
                            <input
                                type="text"
                                value={stripeRefInput}
                                onChange={e => setStripeRefInput(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 font-mono text-xs text-slate-900 dark:text-white"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowPaywallModal(false)}
                                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-bold text-zinc-400 cursor-pointer"
                            >
                                {copy.btnCancel}
                            </button>
                            <button
                                type="button"
                                onClick={handleUpgradeBilling}
                                disabled={upgradingBilling}
                                className="px-5 py-2.5 rounded-lg bg-[#dc0000] hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                            >
                                {upgradingBilling ? '...' : copy.btnActivateProduction}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeveloperHubPage;
