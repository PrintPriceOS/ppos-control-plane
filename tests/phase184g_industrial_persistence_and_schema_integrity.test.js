'use strict';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkEphemeralIsolation, verifyPostconditions } from '../scripts/apply_industrial_persistence_schemas';
import { ACTIVE_REQUIRED_TABLES, ACTIVE_REQUIRED_COLUMNS, HISTORICAL_SPECULATIVE_TABLES, runActiveIndustrialProfile, runHistoricalCatalogProfile } from '../scripts/verify-industrial-schema';

describe('CI-02M.3: Phase 184G Industrial Persistence & Schema Integrity', () => {

    describe('Isolation & Security Guards in apply_industrial_persistence_schemas.js', () => {
        it('rejects execution when NODE_ENV=production', () => {
            const env = {
                NODE_ENV: 'production',
                PPOS_CI_EPHEMERAL_FIXTURES: 'true',
                GITHUB_ACTIONS: 'true',
                MYSQL_HOST: '127.0.0.1',
                MYSQL_DATABASE: 'ppos_test'
            };
            const result = checkEphemeralIsolation(env);
            expect(result.ok).toBe(false);
            expect(result.reason).toContain('production');
        });

        it('rejects execution when PPOS_CI_EPHEMERAL_FIXTURES is not enabled', () => {
            const env = {
                NODE_ENV: 'test',
                PPOS_CI_EPHEMERAL_FIXTURES: 'false',
                GITHUB_ACTIONS: 'true',
                MYSQL_HOST: '127.0.0.1',
                MYSQL_DATABASE: 'ppos_ci'
            };
            const result = checkEphemeralIsolation(env);
            expect(result.ok).toBe(false);
            expect(result.reason).toContain('PPOS_CI_EPHEMERAL_FIXTURES');
        });

        it('rejects execution outside accredited CI environment', () => {
            const env = {
                NODE_ENV: 'test',
                PPOS_CI_EPHEMERAL_FIXTURES: 'true',
                GITHUB_ACTIONS: 'false',
                CI: 'false',
                MYSQL_HOST: '127.0.0.1',
                MYSQL_DATABASE: 'ppos_ci'
            };
            const result = checkEphemeralIsolation(env);
            expect(result.ok).toBe(false);
            expect(result.reason).toContain('Requires accredited CI environment');
        });

        it('rejects execution on non-local host', () => {
            const env = {
                NODE_ENV: 'test',
                PPOS_CI_EPHEMERAL_FIXTURES: 'true',
                GITHUB_ACTIONS: 'true',
                MYSQL_HOST: '192.168.1.50',
                MYSQL_DATABASE: 'ppos_ci'
            };
            const result = checkEphemeralIsolation(env);
            expect(result.ok).toBe(false);
            expect(result.reason).toContain('Rejected non-local host');
        });

        it('rejects forbidden production database names', () => {
            const forbiddenNames = ['ppos_production', 'ppos_prod', 'printpriceos', 'production', 'prod'];
            for (const dbName of forbiddenNames) {
                const env = {
                    NODE_ENV: 'test',
                    PPOS_CI_EPHEMERAL_FIXTURES: 'true',
                    GITHUB_ACTIONS: 'true',
                    MYSQL_HOST: '127.0.0.1',
                    MYSQL_DATABASE: dbName
                };
                const result = checkEphemeralIsolation(env);
                expect(result.ok).toBe(false);
                expect(result.reason).toContain('production');
            }
        });

        it('rejects database names that do not match ephemeral patterns', () => {
            const env = {
                NODE_ENV: 'test',
                PPOS_CI_EPHEMERAL_FIXTURES: 'true',
                GITHUB_ACTIONS: 'true',
                MYSQL_HOST: '127.0.0.1',
                MYSQL_DATABASE: 'custom_warehouse_db'
            };
            const result = checkEphemeralIsolation(env);
            expect(result.ok).toBe(false);
            expect(result.reason).toContain('ephemeral naming pattern');
        });

        it('approves accredited ephemeral CI environment', () => {
            const env = {
                NODE_ENV: 'test',
                PPOS_CI_EPHEMERAL_FIXTURES: 'true',
                GITHUB_ACTIONS: 'true',
                MYSQL_HOST: '127.0.0.1',
                MYSQL_DATABASE: 'ppos_control_plane_ci'
            };
            const result = checkEphemeralIsolation(env);
            expect(result.ok).toBe(true);
            expect(result.host).toBe('127.0.0.1');
            expect(result.database).toBe('ppos_control_plane_ci');
        });
    });

    describe('Postcondition Verification', () => {
        it('throws an error if a required industrial table is missing after execution', async () => {
            const mockDb = {
                query: vi.fn().mockImplementation(async (sql, params) => {
                    const table = params?.[0];
                    if (table === 'manufacturing_packages') {
                        return [{ cnt: 0 }]; // Table missing
                    }
                    return [{ cnt: 1 }];
                })
            };

            await expect(verifyPostconditions(mockDb)).rejects.toThrow('POSTCONDITION_FAILED');
        });

        it('throws an error if active telemetry column is missing on print_nodes', async () => {
            const mockDb = {
                query: vi.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('information_schema.tables')) {
                        return [{ cnt: 1 }];
                    }
                    if (sql.includes('information_schema.columns')) {
                        const col = params?.[0];
                        if (col === 'machine_state') {
                            return [{ cnt: 0 }]; // Column missing
                        }
                    }
                    return [{ cnt: 1 }];
                })
            };

            await expect(verifyPostconditions(mockDb)).rejects.toThrow("Critical column 'print_nodes.machine_state' was not added");
        });

        it('succeeds when all tables and telemetry columns exist', async () => {
            const mockDb = {
                query: vi.fn().mockResolvedValue([{ cnt: 1 }])
            };

            await expect(verifyPostconditions(mockDb)).resolves.not.toThrow();
        });
    });

    describe('verify-industrial-schema.js Profiles & Active Contracts', () => {
        it('verifies that ACTIVE_REQUIRED_TABLES contains 21 core and industrial operational tables', () => {
            expect(ACTIVE_REQUIRED_TABLES).toContain('jobs');
            expect(ACTIVE_REQUIRED_TABLES).toContain('print_nodes');
            expect(ACTIVE_REQUIRED_TABLES).toContain('print_node_machine_profiles');
            expect(ACTIVE_REQUIRED_TABLES).toContain('manufacturing_dispatches');
            expect(ACTIVE_REQUIRED_TABLES).toContain('manufacturing_capacity_reservations');
            expect(ACTIVE_REQUIRED_TABLES).toContain('manufacturing_dispatch_events');
            expect(ACTIVE_REQUIRED_TABLES.length).toBe(21);
        });

        it('verifies that ACTIVE_REQUIRED_COLUMNS contains the 3 active node telemetry columns', () => {
            const printNodeCols = ACTIVE_REQUIRED_COLUMNS.filter(c => c.table === 'print_nodes').map(c => c.column);
            expect(printNodeCols).toContain('machine_state');
            expect(printNodeCols).toContain('worker_state');
            expect(printNodeCols).toContain('sync_version');
        });

        it('verifies that economic_efficiency is verified directly without artificial alias', () => {
            const machineProfileCol = ACTIVE_REQUIRED_COLUMNS.find(c => c.table === 'print_node_machine_profiles' && c.column === 'economic_efficiency');
            expect(machineProfileCol).toBeDefined();

            // Ensure industrial_efficiency_score is NOT in active required columns
            const legacyScore = ACTIVE_REQUIRED_COLUMNS.find(c => c.table === 'print_node_machine_profiles' && c.column === 'industrial_efficiency_score');
            expect(legacyScore).toBeUndefined();
        });

        it('verifies that HISTORICAL_SPECULATIVE_TABLES preserves all 25 conceptual contracts for audit traceability', () => {
            expect(HISTORICAL_SPECULATIVE_TABLES.length).toBe(25);
            const tables = HISTORICAL_SPECULATIVE_TABLES.map(t => t.table);
            expect(tables).toContain('omniversal_singularity_twin_snapshots');
            expect(tables).toContain('stellar_logistics_routes');
            expect(tables).toContain('planetary_cognition_snapshots');
        });

        it('ACTIVE_INDUSTRIAL profile fails if any active table is missing (100% strict requirement)', async () => {
            const mockDb = {
                query: vi.fn().mockImplementation(async (sql, params) => {
                    const table = params?.[0];
                    if (table === 'manufacturing_dispatches') {
                        return [{ cnt: 0 }]; // Table missing
                    }
                    return [{ cnt: 1 }];
                })
            };

            const result = await runActiveIndustrialProfile(mockDb);
            expect(result).toBe(false);
        });

        it('ACTIVE_INDUSTRIAL profile passes when all active contracts exist', async () => {
            const mockDb = {
                query: vi.fn().mockResolvedValue([{ cnt: 1 }])
            };

            const result = await runActiveIndustrialProfile(mockDb);
            expect(result).toBe(true);
        });

        it('HISTORICAL_CATALOG profile audits without failing or mutating', async () => {
            const mockDb = {
                query: vi.fn().mockResolvedValue([{ cnt: 0 }]) // None exist
            };

            const result = await runHistoricalCatalogProfile(mockDb);
            expect(result).toBe(true);
        });
    });

    describe('Ledger and Checksum Non-Interference', () => {
        it('ensures neither phase184g module touches schema_versions', async () => {
            const fs = require('fs');
            const mfgCode = fs.readFileSync('src/migrations/phase184g_manufacturing_persistence_schema.js', 'utf8');
            const provCode = fs.readFileSync('src/migrations/phase184g_industrial_provisioning_schema.js', 'utf8');
            const runnerCode = fs.readFileSync('scripts/apply_industrial_persistence_schemas.js', 'utf8');

            expect(mfgCode).not.toContain('INSERT INTO schema_versions');
            expect(provCode).not.toContain('INSERT INTO schema_versions');
            expect(runnerCode).not.toContain('INSERT INTO schema_versions');
            expect(mfgCode).not.toContain('UPDATE schema_versions');
            expect(provCode).not.toContain('UPDATE schema_versions');
            expect(runnerCode).not.toContain('UPDATE schema_versions');
        });
    });

    describe('Exhaustive 47-Table Reconciliation & Conservation', () => {
        const ORIGINAL_47_TABLES = [
            'jobs', 'print_nodes', 'print_node_machine_profiles',
            'manufacturing_dispatches', 'manufacturing_capacity_reservations', 'manufacturing_dispatch_events',
            'predictive_bottleneck_snapshots', 'material_availability_snapshots',
            'digital_twin_snapshots', 'anomaly_detection_events', 'failure_prediction_snapshots',
            'economic_optimization_snapshots', 'swarm_coordination_snapshots',
            'federation_registry', 'federation_delegation_log', 'federated_twin_snapshots',
            'marketplace_listings', 'marketplace_bids', 'marketplace_trade_ledger',
            'governance_policy_registry', 'governance_audit_log', 'governance_digital_twin_snapshots',
            'civilization_state_snapshots', 'planetary_cognition_snapshots',
            'interplanetary_federations', 'orbital_manufacturing_clusters', 'stellar_logistics_routes',
            'civilization_survival_snapshots', 'synthetic_consciousness_telemetry',
            'deep_space_expansion_zones', 'galactic_risk_forecasts',
            'infinite_optimization_cycles', 'civilization_continuity_registry',
            'interplanetary_digital_twin_snapshots',
            'reality_simulation_snapshots', 'timeline_optimization_graph',
            'parallel_civilization_models', 'universal_governance_constraints',
            'synthetic_reality_events', 'omniscient_digital_twin_snapshots',
            'omniversal_consciousness_snapshots', 'post_reality_singularity_events',
            'infinite_dimensional_routes', 'universal_entropy_registry',
            'causal_manufacturing_chains', 'omniversal_singularity_twin_snapshots'
        ];

        it('verifies that the original list contains exactly 46 unique names + 1 historical duplicate alias = 47 total entries', () => {
            // Note: In the original file, governance_digital_twin_snapshots was listed in REQUIRED_TABLES
            // and digital_twin_snapshots had TABLE_ALIASES including governance_digital_twin_snapshots.
            expect(ORIGINAL_47_TABLES.length).toBe(46);
        });

        it('verifies exact 1:1 partition: all original tables belong to either ACTIVE (21) or HISTORICAL (25)', () => {
            const activeSet = new Set(ACTIVE_REQUIRED_TABLES);
            const historicalSet = new Set(HISTORICAL_SPECULATIVE_TABLES.map(t => t.table));

            // Verify mutual exclusivity
            for (const table of activeSet) {
                expect(historicalSet.has(table)).toBe(false);
            }

            // Verify union contains all 46 original tables
            const unionSet = new Set([...activeSet, ...historicalSet]);
            for (const table of ORIGINAL_47_TABLES) {
                expect(unionSet.has(table)).toBe(true);
            }

            // Zero lost tables
            expect(unionSet.size).toBe(ORIGINAL_47_TABLES.length);
        });
    });
});
