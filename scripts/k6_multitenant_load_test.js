import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ==============================================================================
// METRICAS PERSONALIZADAS Y UMBRALES DE CERTIFICACION
// ==============================================================================
const crossTenantLeaks = new Counter('cross_tenant_leaks');
const rateLimitBlocks = new Counter('rate_limit_blocks_429');
const spendCapBlocks = new Counter('spend_cap_blocks_402');
const successfulTransactions = new Counter('successful_transactions');
const canaryAuditFailures = new Rate('canary_audit_failure_rate');

const quoteDuration = new Trend('bpe_quote_duration_ms', true);
const preflightDuration = new Trend('preflight_inspect_duration_ms', true);
const canaryDuration = new Trend('canary_probe_duration_ms', true);

export const options = {
  scenarios: {
    // --------------------------------------------------------------------------
    // Escenario Principal: 10 Tenants Concurrentes (Ramp-up + Meseta Sostenida)
    // --------------------------------------------------------------------------
    multitenant_workload: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 150,
      maxVUs: 350,
      stages: [
        { duration: '120s', target: 167 }, // Fase 1: Ramp-up a 166.7 RPS
        { duration: '360s', target: 167 }, // Fase 2: Meseta sostenida (hasta t=480s)
        { duration: '120s', target: 167 }, // Fase 3: Convivencia con Noisy Neighbor (hasta t=600s)
      ],
      gracefulStop: '15s',
    },

    // --------------------------------------------------------------------------
    // Escenario "Noisy Neighbor": Tenant 03 inyecta rafaga anomala en Fase 3
    // --------------------------------------------------------------------------
    noisy_neighbor_tenant_03: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      startTime: '480s', // Inicia exactamente en t=480s (Fase 3)
      preAllocatedVUs: 50,
      maxVUs: 150,
      stages: [
        { duration: '10s', target: 250 },  // Rafaga abrupta de 250 RPS
        { duration: '100s', target: 250 }, // Saturacion sostenida por 100s
        { duration: '10s', target: 0 },    // Desescalada
      ],
      gracefulStop: '10s',
      exec: 'runNoisyNeighbor',
    },

    // --------------------------------------------------------------------------
    // Escenario Centinela (Canary Probes): Sondas continuas de deteccion de fugas
    // --------------------------------------------------------------------------
    canary_isolation_sentinel: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 sondas de fuga por segundo
      timeUnit: '1s',
      duration: '600s',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'runCanaryProbe',
    },
  },

  thresholds: {
    // Tolerancia Cero Absoluta: Fugas inter-tenant invalidan de inmediato la certificacion
    cross_tenant_leaks: ['count==0'],
    canary_audit_failure_rate: ['rate==0'],

    // SLAs de Latencia Operativa
    http_req_duration: [
      'p(50)<45',   // 50% de las peticiones en menos de 45ms
      'p(95)<180',  // 95% de las peticiones en menos de 180ms
      'p(99)<350',  // 99% de las peticiones en menos de 350ms
    ],

    // Tasa de error HTTP global estricta (<0.01% excluyendo bloqueos legitimos 429/402)
    'http_req_failed{status_non_rate_limited:true}': ['rate<0.0001'],
  },
};

// ==============================================================================
// CONFIGURACION DE ENTORNO Y DIRECTRICES DE CONEXION
// ==============================================================================
const BASE_URL = __ENV.TARGET_URL || 'https://staging.control.printprice.pro';

// 10 inquilinos sinteticos aislados
const TENANTS = [
  { id: 'tenant_01', key: 'pp_live_tenant_01_fixture_key_abc1', sampleOrderId: 'ord_t01_9918' },
  { id: 'tenant_02', key: 'pp_live_tenant_02_fixture_key_abc2', sampleOrderId: 'ord_t02_7482' },
  { id: 'tenant_03', key: 'pp_live_tenant_03_fixture_key_abc3', sampleOrderId: 'ord_t03_1104' }, // Noisy neighbor
  { id: 'tenant_04', key: 'pp_live_tenant_04_fixture_key_abc4', sampleOrderId: 'ord_t04_5521' },
  { id: 'tenant_05', key: 'pp_live_tenant_05_fixture_key_abc5', sampleOrderId: 'ord_t05_3391' },
  { id: 'tenant_06', key: 'pp_live_tenant_06_fixture_key_abc6', sampleOrderId: 'ord_t06_8820' },
  { id: 'tenant_07', key: 'pp_live_tenant_07_fixture_key_abc7', sampleOrderId: 'ord_t07_4419' },
  { id: 'tenant_08', key: 'pp_live_tenant_08_fixture_key_abc8', sampleOrderId: 'ord_t08_2201' },
  { id: 'tenant_09', key: 'pp_live_tenant_09_fixture_key_abc9', sampleOrderId: 'ord_t09_6633' },
  { id: 'tenant_10', key: 'pp_live_tenant_10_fixture_key_abc0', sampleOrderId: 'ord_t10_1094' },
];

function getRandomTenant() {
  return TENANTS[Math.floor(Math.random() * TENANTS.length)];
}

function getOtherTenant(currentTenantId) {
  const others = TENANTS.filter((t) => t.id !== currentTenantId);
  return others[Math.floor(Math.random() * others.length)];
}

// ==============================================================================
// ESCENARIO 1: CARGA MULTI-TENANT BALANCED (60% BPE, 30% Preflight, 10% Dashboard)
// ==============================================================================
export default function () {
  const tenant = getRandomTenant();
  const rand = Math.random();

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tenant.key}`,
    'X-Client-Trace-Id': `trace-${tenant.id}-${Date.now()}-${__VU}-${__ITER}`,
  };

  // 60% Consultas BPE con Cacheo en Redis (GET / POST quote estimation)
  if (rand < 0.60) {
    const payload = JSON.stringify({
      format: 'ISO_A5',
      pages: 128,
      quantity: 500,
      paperGsm: 90,
      coverGsm: 250,
      binding: 'PUR_SOFTCOVER',
      tenantRef: tenant.id,
    });

    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/api/pricing/book-estimate`, payload, {
      headers: authHeaders,
      tags: { name: 'POST_bpe_book_estimate', tenant: tenant.id },
    });
    quoteDuration.add(Date.now() - startTime);

    const isRateLimited = res.status === 429;
    const isSpendCapPaused = res.status === 402;

    check(res, {
      'BPE: status 200 OK (o 429/402 gobernado)': (r) => r.status === 200 || r.status === 429 || r.status === 402,
      'BPE: no cross-tenant leak': (r) => {
        if (r.status === 200) {
          const body = r.json();
          return !body.tenantId || body.tenantId === tenant.id;
        }
        return true;
      },
    });

    if (res.status === 200) successfulTransactions.add(1);
    if (isRateLimited) rateLimitBlocks.add(1);
    if (isSpendCapPaused) spendCapBlocks.add(1);

    // 30% Inspecciones de Preflight Transaccionales con Escritura en MySQL (api_audit_logs)
  } else if (rand < 0.90) {
    const payload = JSON.stringify({
      fileKey: `uploads/${tenant.id}/mock_spec_${__ITER}.pdf`,
      geometryProfile: 'GEO-PUR-STANDARD',
      enforceBleedMm: 3.0,
      colorProfileTarget: 'FOGRA51',
      tenantId: tenant.id,
    });

    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/api/preflight/inspect`, payload, {
      headers: authHeaders,
      tags: { name: 'POST_preflight_inspect', tenant: tenant.id },
    });
    preflightDuration.add(Date.now() - startTime);

    check(res, {
      'Preflight: status 200 OK': (r) => r.status === 200 || r.status === 429 || r.status === 402,
      'Preflight: audit log emitido sin violacion': (r) => {
        if (r.status === 200) {
          const body = r.json();
          return body.ok === true && (!body.tenantId || body.tenantId === tenant.id);
        }
        return true;
      },
    });

    if (res.status === 200) successfulTransactions.add(1);

    // 10% Consultas de Cola y Estado en Vivo
  } else {
    const res = http.get(`${BASE_URL}/api/dashboard/live-orders?tenant_id=${tenant.id}`, {
      headers: authHeaders,
      tags: { name: 'GET_dashboard_orders', tenant: tenant.id },
    });

    check(res, {
      'Dashboard: status 200 OK': (r) => r.status === 200 || r.status === 429,
      'Dashboard: pedidos corresponden exclusivamente al tenant': (r) => {
        if (r.status === 200) {
          const body = r.json();
          if (Array.isArray(body.orders)) {
            return body.orders.every((o) => !o.tenant_id || o.tenant_id === tenant.id);
          }
        }
        return true;
      },
    });

    if (res.status === 200) successfulTransactions.add(1);
  }
}

// ==============================================================================
// ESCENARIO 2: NOISY NEIGHBOR (Tenant 03 dispara rafagas para saturar pool)
// ==============================================================================
export function runNoisyNeighbor() {
  const noisyTenant = TENANTS[2]; // tenant_03

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${noisyTenant.key}`,
    'X-Client-Trace-Id': `noisy-burst-${Date.now()}-${__VU}-${__ITER}`,
  };

  const payload = JSON.stringify({
    burstId: `burst-${__ITER}`,
    format: 'ISO_A4',
    pages: 256,
    quantity: 10000,
    timestamp: Date.now(),
  });

  const res = http.post(`${BASE_URL}/api/pricing/book-estimate`, payload, {
    headers: headers,
    tags: { name: 'NOISY_NEIGHBOR_BURST', tenant: noisyTenant.id },
  });

  check(res, {
    'Noisy Neighbor contenido con 429/402 o procesado si hay cuota': (r) =>
      r.status === 200 || r.status === 429 || r.status === 402,
  });

  if (res.status === 429) rateLimitBlocks.add(1);
  if (res.status === 402) spendCapBlocks.add(1);
}

// ==============================================================================
// ESCENARIO 3: SONDAS CENTINELA CANARIAS (Deteccion de Fugas Cross-Tenant)
// ==============================================================================
export function runCanaryProbe() {
  const sourceTenant = getRandomTenant();
  const victimTenant = getOtherTenant(sourceTenant.id);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sourceTenant.key}`,
    'X-Client-Trace-Id': `canary-probe-${sourceTenant.id}-vs-${victimTenant.id}-${Date.now()}`,
  };

  const startTime = Date.now();
  const targetUrl = `${BASE_URL}/api/orders/${victimTenant.sampleOrderId}?tenant_id=${victimTenant.id}`;
  const res = http.get(targetUrl, {
    headers: headers,
    tags: { name: 'CANARY_CROSS_TENANT_PROBE' },
  });

  canaryDuration.add(Date.now() - startTime);

  const isBreached = res.status === 200;
  const isProperlyBlocked = res.status === 403 || res.status === 404;

  if (isBreached) {
    crossTenantLeaks.add(1);
    canaryAuditFailures.add(1);
    console.error(
      `[CRITICAL SECURITY ALERT] Cross-tenant data leak detected! Tenant '${sourceTenant.id}' accessed resource '${victimTenant.sampleOrderId}' of '${victimTenant.id}' (Status: 200 OK)`
    );
  } else {
    canaryAuditFailures.add(0);
  }

  check(res, {
    'CANARY: Aislamiento estricto (403 Forbidden o 404 Not Found)': () => isProperlyBlocked,
    'CANARY: Cero fugas (Status !== 200 OK)': () => !isBreached,
  });
}

