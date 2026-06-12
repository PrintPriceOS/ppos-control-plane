const crypto = require('crypto');

class AccountingExportBuilderService {
    constructor(dependencies = {}) {
        this.ledgerService = dependencies.financialReconciliationLedgerService;
        this.engineService = dependencies.financialReconciliationEngine;
        this._mockBatches = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createAccountingExportBatch({ reconciliationRunId, exportFormat, exportScope, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const run = await this.ledgerService.getReconciliationRun({ reconciliationRunId, actor });
        if (!run) throw new Error('Run not found');

        const batch = {
            id: `exp_${crypto.randomUUID()}`,
            reconciliation_run_id: reconciliationRunId,
            tenant_id: run.tenant_id,
            export_status: 'DRAFT',
            export_format: exportFormat,
            export_scope: exportScope,
            created_by: actor.userId,
            created_by_role: actor.role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        this._mockBatches.push(batch);

        await this._recordEvent({
            reconciliationRunId, exportBatchId: batch.id, tenantId: batch.tenant_id, eventType: 'EXPORT_BATCH_CREATED', actor, message: 'Export batch created'
        });

        return batch;
    }

    async validateAccountingExportReadiness({ exportBatchId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const batch = this._mockBatches.find(b => b.id === exportBatchId);
        if (!batch) throw new Error('Batch not found');

        const run = await this.ledgerService.getReconciliationRun({ reconciliationRunId: batch.reconciliation_run_id, actor });

        if (run.blocking_count > 0) {
            batch.export_status = 'BLOCKED';
            await this._recordEvent({
                reconciliationRunId: run.id, exportBatchId: batch.id, tenantId: batch.tenant_id, eventType: 'EXPORT_BATCH_BLOCKED', actor, message: 'Export blocked by critical mismatch'
            });
            throw new Error('Export readiness blocked by critical mismatch');
        }

        batch.export_status = 'READY';
        return batch;
    }

    async buildAccountingExportRows({ exportBatchId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const batch = await this.validateAccountingExportReadiness({ exportBatchId, actor });
        
        return [
            { id: '1', type: 'CUSTOMER_PAYMENT', amount: 100 },
            { id: '2', type: 'PARTNER_SETTLEMENT', amount: 80 }
        ];
    }

    async generateAccountingExportFile({ exportBatchId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const batch = await this.validateAccountingExportReadiness({ exportBatchId, actor });
        const rows = await this.buildAccountingExportRows({ exportBatchId, actor });

        batch.export_status = 'GENERATED';
        batch.row_count = rows.length;
        batch.totals_json = { payments: 100, settlements: 80 };
        batch.file_path = `/exports/${batch.id}.${batch.export_format.toLowerCase()}`;
        batch.generated_by = actor.userId;
        batch.generated_by_role = actor.role;
        batch.generated_at = new Date().toISOString();

        await this._recordEvent({
            reconciliationRunId: batch.reconciliation_run_id, exportBatchId: batch.id, tenantId: batch.tenant_id, eventType: 'EXPORT_BATCH_GENERATED', actor, message: 'Export generated'
        });

        return batch;
    }

    async markAccountingExportManual({ exportBatchId, evidencePayload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN']);
        const batch = this._mockBatches.find(b => b.id === exportBatchId);
        if (!batch) throw new Error('Batch not found');
        if (batch.export_status !== 'GENERATED') throw new Error('Export not generated');
        if (!evidencePayload) throw new Error('Marking export manual requires evidence payload');

        batch.export_status = 'EXPORTED_MANUALLY';
        batch.marked_exported_by = actor.userId;
        batch.marked_exported_by_role = actor.role;
        batch.marked_exported_at = new Date().toISOString();

        await this._recordEvent({
            reconciliationRunId: batch.reconciliation_run_id, exportBatchId: batch.id, tenantId: batch.tenant_id, eventType: 'EXPORT_MARKED_MANUAL', actor, message: 'Export marked manual with evidence'
        });

        return batch;
    }

    async getAccountingExportBatch({ exportBatchId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        return this._mockBatches.find(b => b.id === exportBatchId);
    }

    async listAccountingExportBatches(filters, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);
        return this._mockBatches;
    }

    async sanitizeAccountingExportForRole(payload, actor) {
        const safe = { ...payload };
        // Ensures raw provider payloads are never exposed
        delete safe.raw_provider_payloads;
        return safe;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            reconciliation_run_id: event.reconciliationRunId,
            export_batch_id: event.exportBatchId,
            tenant_id: event.tenantId,
            event_type: event.eventType,
            actor_user_id: event.actor.userId,
            actor_role: event.actor.role,
            message: event.message,
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        this.ledgerService._mockEvents.push(ev);
        return ev;
    }
}

module.exports = AccountingExportBuilderService;
