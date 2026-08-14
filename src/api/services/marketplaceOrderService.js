/**
 * src/api/services/marketplaceOrderService.js
 *
 * Marketplace Order Intake Service for Phase 36.1.
 * Governs marketplace orders, print file slots, audit logs, preflight bindings, and readiness states.
 */

const mysqlClient = require('./mysqlClient');
const logger = require('./logger').child('marketplace-order-service');
const humanReportSnapshotService = require('./preflightHumanReportSnapshotService');
const reviewApprovalService = require('./preflightReviewApprovalService');

/**
 * Robust JSON parsing helper.
 */
function safeParseJson(value, fallback = null) {
    if (typeof value === 'object' && value !== null) return value;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}

/**
 * ID Generator helper.
 */
function generateId(prefix = 'ord') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

class MarketplaceOrderService {
    /**
     * Normalizes a physical order row along with its files, events, and preflight bindings
     * into the canonical Control Plane operational format expected by the frontend and admins.
     */
    normalizeOrder(orderRow, files = [], events = [], bindings = []) {
        if (!orderRow) return null;

        const bookSpec = safeParseJson(orderRow.book_spec_json, {});
        const selectedOffer = safeParseJson(orderRow.selected_offer_json, {});
        const customer = safeParseJson(orderRow.customer_json, {});
        const readinessData = safeParseJson(orderRow.readiness_json, { ready: false, blockers: ['FILES_REQUIRED'] });
        const metadata = safeParseJson(orderRow.metadata_json, {});

        // Normalize files
        const productionFiles = files.map(f => ({
            kind: f.role,
            fileId: f.file_id,
            filename: f.original_name || `${f.role.toLowerCase()}.pdf`,
            mimeType: f.mime_type || 'application/pdf',
            sizeBytes: Number(f.size_bytes || 0),
            status: f.status || 'PENDING',
            checksum: f.checksum_sha256 || null,
            storagePath: f.storage_path || null,
            preflightJobId: f.preflight_job_id || null,
            preflightStatus: f.preflight_status || null,
            preflightOutcomeCategory: f.preflight_outcome_category || null,
            findingsCount: Number(f.findings_count || 0),
            artifactRefs: safeParseJson(f.artifact_refs_json, {}),
            metadata: safeParseJson(f.metadata_json, {}),
            uploadedAt: f.uploaded_at || null,
            createdAt: f.created_at,
            updatedAt: f.updated_at
        }));

        // Format preflight bindings summary
        const bindingsSummary = bindings.reduce((acc, b) => {
            acc[b.role] = {
                preflightJobId: b.preflight_job_id,
                status: b.status,
                findingsCount: b.findings_count,
                outcomeCategory: b.outcome_category,
                analysisIntegrity: safeParseJson(b.analysis_integrity_json, {}),
                analyzerCoverage: safeParseJson(b.analyzer_coverage_json, {}),
                artifactRefs: safeParseJson(b.artifact_refs_json, {})
            };
            return acc;
        }, {});

        // Fetch or default preflight status
        let overallPreflightStatus = 'NOT_STARTED';
        if (bindings.length > 0) {
            const hasBlocking = bindings.some(b => {
                const outcome = b.outcome_category || b.status || '';
                return ['FAILED', 'ERROR', 'FAILED_RUNTIME_ENVIRONMENT', 'ENGINE_ENVIRONMENT_FAILURE'].includes(outcome);
            });
            if (hasBlocking) {
                overallPreflightStatus = 'FAILED';
            } else {
                const specificStatus = bindings.find(b => {
                    const outcome = b.outcome_category || b.status || '';
                    return ['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS', 'COMPLETED_WITH_FINDINGS'].includes(outcome);
                });
                if (specificStatus) {
                    overallPreflightStatus = specificStatus.outcome_category || specificStatus.status;
                } else if (bindings.every(b => ['PASS', 'COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PASSED'].includes(b.status) || ['PASS', 'COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PASSED'].includes(b.outcome_category))) {
                    overallPreflightStatus = 'PASSED';
                } else {
                    overallPreflightStatus = 'PENDING';
                }
            }
        }

        // Calculate preflight issues and risk level
        const diagnosticAvailable = bindings.length > 0;
        let riskLevel = 'UNKNOWN';
        const issues = [];

        if (diagnosticAvailable) {
            let hasBlocking = false;
            let hasWarnings = false;

            for (const b of bindings) {
                const integrity = safeParseJson(b.analysis_integrity_json, {});
                const outcome = b.outcome_category || b.status || '';
                const findingsCount = Number(b.findings_count || 0);

                if (integrity.certifiable === false) {
                    hasBlocking = true;
                    issues.push({
                        role: b.role,
                        type: 'NON_CERTIFIABLE',
                        message: `File is not Fogra/PDF-X compliant or fails geometry rules.`
                    });
                }

                if (['FAILED', 'ERROR', 'FAILED_RUNTIME_ENVIRONMENT', 'ENGINE_ENVIRONMENT_FAILURE'].includes(outcome)) {
                    hasBlocking = true;
                    issues.push({
                        role: b.role,
                        type: 'PREFLIGHT_FAILURE',
                        message: `Preflight analysis failed or errored: ${outcome}`
                    });
                } else if (['COMPLETED_WITH_FINDINGS', 'DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(outcome) || findingsCount > 0) {
                    hasWarnings = true;
                    if (findingsCount > 0) {
                        issues.push({
                            role: b.role,
                            type: 'PREFLIGHT_WARNINGS',
                            message: `Preflight finished with ${findingsCount} warnings/findings.`
                        });
                    }
                }
            }

            if (hasBlocking) {
                riskLevel = 'HIGH';
            } else if (hasWarnings) {
                riskLevel = 'MEDIUM';
            } else {
                riskLevel = 'LOW';
            }
        }

        const preflight = {
            status: overallPreflightStatus,
            lastChecked: orderRow.updated_at,
            results: bindingsSummary,
            simulated: false,
            diagnosticAvailable,
            required: true,
            issues,
            riskLevel
        };

        const payment = metadata.payment || {
            status: orderRow.status === 'PAID' ? 'PAID' : 'NOT_STARTED',
            method: 'MANUAL',
            transactionId: metadata.transactionId || null,
            paidAt: metadata.paidAt || null,
            blockedReason: metadata.paymentBlockedReason || null
        };

        const controlPlane = metadata.controlPlane || {
            acknowledged: orderRow.status === 'ACKNOWLEDGED' || !!metadata.acknowledged,
            acknowledgedBy: metadata.acknowledgedBy || null,
            acknowledgedAt: metadata.acknowledgedAt || null,
            notes: metadata.notes || [],
            operationalStatus: orderRow.status
        };

        const printhouse = {
            assignedPrinthouseId: orderRow.printhouse_id,
            assignedAt: orderRow.updated_at,
            handoffStatus: metadata.handoffStatus || 'NOT_READY',
            preparedBy: metadata.handoffPreparedBy || null,
            preparedAt: metadata.handoffPreparedAt || null,
            productionFiles: productionFiles
        };

        const order = {
            orderIntentId: orderRow.order_id,
            orderId: orderRow.order_id,
            publicRef: orderRow.order_id,
            pricingSessionId: orderRow.pricing_session_id,
            selectedOfferId: orderRow.selected_offer_id,
            customerId: orderRow.customer_id,
            tenantId: orderRow.tenant_id,
            printhouseId: orderRow.printhouse_id,
            status: orderRow.status,
            lifecycle: orderRow.status,
            createdAt: orderRow.created_at,
            updatedAt: orderRow.updated_at,

            customer: {
                name: customer.name || customer.fullName || 'Anonymous',
                email: customer.email || 'N/A',
                phone: customer.phone || 'N/A',
                shippingAddress: customer.shippingAddress || customer.address || {},
                billingAddress: customer.billingAddress || customer.address || {}
            },
            offer: {
                id: selectedOffer.offerId || selectedOffer.id || orderRow.selected_offer_id,
                printerId: selectedOffer.printhouseId || selectedOffer.printerId || orderRow.printhouse_id,
                printerName: selectedOffer.printerName || selectedOffer.printhouseName || 'Assigned Printhouse',
                totalPrice: Number(selectedOffer.totalPrice || selectedOffer.total_price || orderRow.estimated_price || 0),
                currency: orderRow.currency || 'EUR',
                leadTimeDays: selectedOffer.leadTimeDays || 0
            },
            specs: bookSpec,
            totals: {
                subtotal: Number(orderRow.estimated_price || 0),
                tax: 0,
                shipping: 0,
                total: Number(orderRow.estimated_price || 0),
                currency: orderRow.currency || 'EUR'
            },
            productionFiles,
            preflight,
            payment,
            controlPlane,
            printhouse,
            readiness: readinessData.ready ? 'READY' : 'BLOCKED',
            blockers: readinessData.blockers || [],
            readinessFull: readinessData,

            // Phase 38.8 additions
            productionCompletedAt: orderRow.production_completed_at || null,
            productionCompletedBy: orderRow.production_completed_by || null,
            productionCompletionStatus: orderRow.production_completion_status || null,
            deliveryHandoffStatus: orderRow.delivery_handoff_status || null,
            deliveryHandoffReadyAt: orderRow.delivery_handoff_ready_at || null,
            deliveryHandoffReadyBy: orderRow.delivery_handoff_ready_by || null,
            finalProductionAudit: safeParseJson(orderRow.final_production_audit_json, null)
        };

        order.estimatedPrice = Number(orderRow.estimated_price || order.totals?.total || order.offer?.totalPrice || 0);

        return order;
    }

    /**
     * 1. createOrder(input)
     * Creates a new Marketplace Order.
     */
    async createOrder(input) {
        logger.info({
            event: 'MARKETPLACE_ORDER_CREATE_REQUEST',
            pricingSessionId: input.pricingSessionId || null,
            selectedOfferId: input.selectedOfferId || null,
            tenantId: input.tenantId || null,
            printhouseId: input.printhouseId || null,
            hasCustomerId: !!input.customerId,
            hasSessionId: !!input.sessionId
        });

        const orderId = input.orderId || generateId('ord');
        const status = input.selectedOffer ? 'OFFER_SELECTED' : 'DRAFT';
        const currency = input.currency || 'EUR';
        const estimatedPrice = input.estimatedPrice || null;

        const customerId = input.customerId || null;
        const sessionId = input.sessionId || null;
        const tenantId = input.tenantId || null;
        const printhouseId = input.printhouseId || null;
        const pricingSessionId = input.pricingSessionId || null;
        const selectedOfferId = input.selectedOfferId || null;

        // Prevent client manipulation of legacy or snapshot fields using strict allowlisting
        const allowedInput = {
            orderId: input.orderId,
            pricingSessionId: input.pricingSessionId,
            sessionId: input.sessionId,
            tenantId: input.tenantId,
            printhouseId: input.printhouseId,
            customerId: input.customerId,
            selectedOfferId: input.selectedOfferId,
            selectedOffer: input.selectedOffer,
            currency: input.currency,
            estimatedPrice: input.estimatedPrice,
            bookSpec: input.bookSpec,
            customer: input.customer,
            metadata: input.metadata ? { ...input.metadata } : {}
        };

        // Ensure legacy flags are not inside metadata either
        if (allowedInput.metadata) {
            delete allowedInput.metadata.source_type;
            delete allowedInput.metadata.legacyInvoiceSource;
            delete allowedInput.metadata.created_at;
            delete allowedInput.metadata.pricingSnapshotCutover;
            delete allowedInput.metadata.LEGACY_INVOICE_SOURCE;
        }

        const bookSpecJson = allowedInput.bookSpec ? JSON.stringify(allowedInput.bookSpec) : null;
        const selectedOfferJson = allowedInput.selectedOffer ? JSON.stringify(allowedInput.selectedOffer) : null;
        const customerJson = allowedInput.customer ? JSON.stringify(allowedInput.customer) : null;

        const readinessJson = JSON.stringify({ ready: false, blockers: ['FILES_REQUIRED'] });
        const metadataJson = JSON.stringify(allowedInput.metadata || {});

        try {
            await mysqlClient.query(`
                INSERT INTO marketplace_orders (
                    order_id, pricing_session_id, session_id, selected_offer_id, customer_id, tenant_id,
                    printhouse_id, status, currency, estimated_price, book_spec_json,
                    selected_offer_json, customer_json, readiness_json, metadata_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                orderId, pricingSessionId, sessionId, selectedOfferId, customerId, tenantId,
                printhouseId, status, currency, estimatedPrice, bookSpecJson,
                selectedOfferJson, customerJson, readinessJson, metadataJson
            ]);

            // Append Event log
            await this.appendOrderEvent(orderId, {
                type: 'ORDER_CREATED',
                actorType: 'CUSTOMER',
                actorId: customerId || sessionId || 'ANONYMOUS',
                payload: { pricingSessionId, selectedOfferId, status }
            });

            // Auto-create slot files
            await this.createRequiredFileSlots(orderId);

            // Fetch final order
            return await this.getOrder(orderId);
        } catch (err) {
            logger.error({ event: 'create_order_failed', error: err.message });
            throw err;
        }
    }

    /**
     * 2. getOrder(orderId)
     * Retrieves detail fields from marketplace orders and its sub-tables.
     */
    async getOrder(orderId) {
        try {
            const orders = await mysqlClient.query(`
                SELECT * FROM marketplace_orders WHERE order_id = ?
            `, [orderId]);

            if (orders.length === 0) return null;

            const files = await mysqlClient.query(`
                SELECT * FROM marketplace_order_files WHERE order_id = ?
            `, [orderId]);

            const events = await mysqlClient.query(`
                SELECT * FROM marketplace_order_events WHERE order_id = ? ORDER BY created_at DESC
            `, [orderId]);

            const bindings = await mysqlClient.query(`
                SELECT * FROM marketplace_order_preflight_bindings WHERE order_id = ?
            `, [orderId]);

            return this.normalizeOrder(orders[0], files, events, bindings);
        } catch (err) {
            logger.error({ event: 'get_order_failed', orderId, error: err.message });
            throw err;
        }
    }

    /**
     * getOrderDetail(id) - Backward compatibility alias
     */
    async getOrderDetail(id) {
        const order = await this.getOrder(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        // Populate audit format for admin tab
        const events = await mysqlClient.query(`
            SELECT * FROM marketplace_order_events WHERE order_id = ? ORDER BY created_at DESC
        `, [order.orderId]);

        order.audit = events.map(e => ({
            id: e.id,
            eventType: e.type,
            actorId: e.actor_id,
            payload: safeParseJson(e.payload_json, {}),
            createdAt: e.created_at
        }));

        // Populate productionFileMetadata format
        order.productionFileMetadata = order.productionFiles;

        return { ok: true, order };
    }

    /**
     * 3. updateSelectedOffer(orderId, selectedOffer)
     * Updates selected offer context.
     */
    async updateSelectedOffer(orderId, selectedOffer) {
        logger.info({ event: 'MARKETPLACE_ORDER_UPDATE_OFFER', orderId, selectedOffer });

        const order = await this.getOrder(orderId);
        if (!order) throw new Error('ORDER_NOT_FOUND');

        const selectedOfferId = selectedOffer.offerId || selectedOffer.id || null;
        const printhouseId = selectedOffer.printhouseId || selectedOffer.printerId || null;
        const estimatedPrice = selectedOffer.totalPrice || selectedOffer.total_price || null;

        let status = order.status;
        if (status === 'DRAFT') {
            status = 'OFFER_SELECTED';
        }

        try {
            await mysqlClient.query(`
                UPDATE marketplace_orders
                SET selected_offer_id = ?, printhouse_id = ?, estimated_price = ?,
                    selected_offer_json = ?, status = ?, updated_at = NOW()
                WHERE order_id = ?
            `, [
                selectedOfferId, printhouseId, estimatedPrice,
                JSON.stringify(selectedOffer), status, orderId
            ]);

            await this.appendOrderEvent(orderId, {
                type: 'OFFER_UPDATED',
                actorType: 'SYSTEM',
                actorId: 'SYSTEM',
                payload: { selectedOfferId, printhouseId, status }
            });

            await this.computeReadiness(orderId);
            return await this.getOrder(orderId);
        } catch (err) {
            logger.error({ event: 'update_offer_failed', orderId, error: err.message });
            throw err;
        }
    }

    /**
     * 4. listOrders(filters)
     * Lists orders by criteria.
     */
    async listOrders(filters = {}) {
        const {
            status,
            tenantId,
            printhouseId,
            allowedPrinthouseIds,
            search,
            limit = 50,
            offset = 0
        } = filters;

        let sql = `SELECT * FROM marketplace_orders WHERE 1=1`;
        const params = [];

        // Phase 192 RC20.2: Enforce strict Printhouse Assignment isolation
        if (allowedPrinthouseIds !== undefined) {
            if (Array.isArray(allowedPrinthouseIds) && allowedPrinthouseIds.length > 0) {
                const placeholders = allowedPrinthouseIds.map(() => '?').join(', ');
                sql += ` AND printhouse_id IN (${placeholders})`;
                params.push(...allowedPrinthouseIds);
            } else {
                // If a printhouse user has 0 printer nodes or empty list, they must see 0 orders (fail-closed)
                sql += ` AND 1=0`;
            }
        } else if (printhouseId) {
            sql += ` AND printhouse_id = ?`;
            params.push(printhouseId);
        } else if (tenantId && !filters.isSuperAdmin) {
            // General Tenant isolation for non-printhouse actors (e.g. buyer tenant)
            sql += ` AND tenant_id = ?`;
            params.push(tenantId);
        }

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        // Phase 192 RC20.2: Server-side search filtering within authorized boundary
        if (search && typeof search === 'string' && search.trim().length > 0) {
            const searchPattern = `%${search.trim()}%`;
            sql += ` AND (
                order_id LIKE ? 
                OR pricing_session_id LIKE ? 
                OR selected_offer_id LIKE ? 
                OR customer_id LIKE ? 
                OR JSON_UNQUOTE(JSON_EXTRACT(customer_json, '$.name')) LIKE ? 
                OR JSON_UNQUOTE(JSON_EXTRACT(customer_json, '$.email')) LIKE ?
            )`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));

        try {
            const rows = await mysqlClient.query(sql, params);

            const orders = [];
            for (const row of rows) {
                const order = await this.getOrder(row.order_id);
                if (order) {
                    try {
                        const auditRows = await mysqlClient.query(`
                            SELECT event_type, status, created_at, metadata_json
                            FROM api_audit_logs
                            WHERE JSON_EXTRACT(metadata_json, '$.order_id') = ?
                               OR JSON_EXTRACT(metadata_json, '$.marketplace_order_id') = ?
                            ORDER BY created_at DESC LIMIT 1
                        `, [row.order_id, row.order_id]);
                        if (auditRows && auditRows.length > 0) {
                            order.lastAuditEvent = auditRows[0];
                        }
                    } catch (e) {
                        // ignore audit fetch errors
                    }
                    orders.push(order);
                }
            }

            const counts = {
                total: orders.length,
                filesUploaded: orders.filter(o => o.productionFiles.every(f => f.status === 'UPLOADED' || f.status === 'COMPLETED')).length,
                preflightRequired: orders.filter(o => o.preflight.status === 'REQUIRED').length,
                preflightPending: orders.filter(o => o.preflight.status === 'PENDING' || o.preflight.status === 'NOT_STARTED').length,
                paymentPending: orders.filter(o => o.payment.status !== 'PAID').length,
                readyForHandoff: orders.filter(o => o.readiness === 'READY').length,
                blocked: orders.filter(o => o.readiness === 'BLOCKED').length
            };

            return { ok: true, orders, counts };
        } catch (err) {
            logger.error({ event: 'list_orders_failed', error: err.message });
            throw err;
        }
    }

    /**
     * 5. appendOrderEvent(orderId, event)
     * Logs operational events.
     */
    async appendOrderEvent(orderId, event) {
        const eventId = generateId('evt');
        const fileId = event.fileId || null;
        const type = event.type;
        const actorType = event.actorType || 'SYSTEM';
        const actorId = event.actorId || 'SYSTEM';
        const payloadJson = event.payload ? JSON.stringify(event.payload) : null;

        try {
            await mysqlClient.query(`
                INSERT INTO marketplace_order_events (
                    event_id, order_id, file_id, type, actor_type, actor_id, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `, [eventId, orderId, fileId, type, actorType, actorId, payloadJson]);
            return { ok: true, eventId };
        } catch (err) {
            logger.error({ event: 'append_event_failed', orderId, error: err.message });
            throw err;
        }
    }

    /**
     * 6. registerFileMetadata(orderId, input)
     * Registers upload file metadata and transitions slot.
     */
    async registerFileMetadata(orderId, input) {
        logger.info({
            event: 'MARKETPLACE_ORDER_REGISTER_FILE',
            orderId,
            role: input?.role,
            originalName: input?.originalName,
            sizeBytes: input?.sizeBytes
        });
        const order = await this.getOrder(orderId);
        if (!order) throw new Error('ORDER_NOT_FOUND');

        const { role, originalName, mimeType, sizeBytes, checksumSha256, storagePath, metadata } = input;
        if (!role || !originalName) {
            throw new Error('MISSING_REQUIRED_FIELDS');
        }

        // Check if role slot already exists
        const existing = await mysqlClient.query(`
            SELECT * FROM marketplace_order_files WHERE order_id = ? AND role = ?
        `, [orderId, role]);

        let fileId;
        if (existing.length > 0) {
            // Find the active (non-superseded) file
            const activeFile = existing.find(f => f.status !== 'SUPERSEDED') || existing[0];

            if (activeFile.status === 'PENDING' || activeFile.status === 'REQUIRED') {
                // If it is just a pending/required slot, we update it in place
                fileId = activeFile.file_id;
                await mysqlClient.query(`
                    UPDATE marketplace_order_files
                    SET original_name = ?, mime_type = ?, size_bytes = ?, checksum_sha256 = ?, storage_path = ?, status = 'UPLOADED', uploaded_at = NOW(), updated_at = NOW()
                    WHERE file_id = ?
                `, [originalName, mimeType || 'application/pdf', sizeBytes || 0, checksumSha256 || null, storagePath || null, fileId]);
            } else {
                // If old file exists and is already uploaded/completed, mark it SUPERSEDED and create/increment version
                fileId = activeFile.file_id;
                await mysqlClient.query(`
                    UPDATE marketplace_order_files
                    SET status = 'SUPERSEDED', updated_at = NOW()
                    WHERE file_id = ?
                `, [fileId]);

                // Create new version row
                const newFileId = generateId('fil');
                const newVersion = (activeFile.version || 1) + 1;
                await mysqlClient.query(`
                    INSERT INTO marketplace_order_files (
                        file_id, order_id, role, version, original_name, mime_type, size_bytes, checksum_sha256, storage_path, status, uploaded_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED', NOW(), NOW(), NOW())
                `, [newFileId, orderId, role, newVersion, originalName, mimeType || 'application/pdf', sizeBytes || 0, checksumSha256 || null, storagePath || null]);

                fileId = newFileId;

                await this.appendOrderEvent(orderId, {
                    fileId: activeFile.file_id,
                    type: 'FILE_SUPERSEDED',
                    payload: { role, supersededBy: newFileId, version: activeFile.version }
                });
            }
        } else {
            // Slot doesn't exist, create it
            fileId = generateId('fil');
            await mysqlClient.query(`
                INSERT INTO marketplace_order_files (
                    file_id, order_id, role, version, original_name, mime_type, size_bytes, checksum_sha256, storage_path, status, uploaded_at, created_at, updated_at
                ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 'UPLOADED', NOW(), NOW(), NOW())
            `, [fileId, orderId, role, originalName, mimeType || 'application/pdf', sizeBytes || 0, checksumSha256 || null, storagePath || null]);
        }

        // Audit Event
        await this.appendOrderEvent(orderId, {
            fileId,
            type: 'FILE_REGISTERED',
            actorType: 'CUSTOMER',
            actorId: order.customerId || 'CUSTOMER',
            payload: { role, originalName, sizeBytes, version: 1 }
        });

        // Recompute readiness
        await this.computeReadiness(orderId);

        return {
            ok: true,
            fileId,
            orderId,
            status: 'UPLOADED'
        };
    }

    /**
     * 7. bindPreflightJob(orderId, fileId, preflightJobId)
     * Connects diagnostic result directly to file record.
     */
    async bindPreflightJob(orderId, fileId, preflightJobId) {
        logger.info({ event: 'MARKETPLACE_ORDER_BIND_PREFLIGHT', orderId, fileId, preflightJobId });

        const order = await this.getOrder(orderId);
        if (!order) throw new Error('ORDER_NOT_FOUND');

        // Ensure the file slot exists and belongs to the order
        const files = await mysqlClient.query(`
            SELECT * FROM marketplace_order_files WHERE file_id = ? AND order_id = ?
        `, [fileId, orderId]);
        if (files.length === 0) {
            throw new Error('FILE_SLOT_NOT_FOUND');
        }

        const fileSlot = files[0];
        const role = fileSlot.role;

        // 1. Look up preflight_job_registry first
        let job = null;
        let isRegistry = false;
        try {
            const registryRows = await mysqlClient.query(
                'SELECT * FROM preflight_job_registry WHERE job_id = ?',
                [preflightJobId]
            );
            if (registryRows && registryRows.length > 0) {
                job = registryRows[0];
                isRegistry = true;
            }
        } catch (registryErr) {
            logger.warn({ event: 'REGISTRY_QUERY_FAILED', message: registryErr.message });
        }

        // 2. Only use preflight_jobs as legacy fallback if registry is unavailable / not found
        if (!job) {
            try {
                const legacyRows = await mysqlClient.query(
                    'SELECT * FROM preflight_jobs WHERE id = ?',
                    [preflightJobId]
                );
                if (legacyRows && legacyRows.length > 0) {
                    job = legacyRows[0];
                    isRegistry = false;
                }
            } catch (legacyErr) {
                logger.warn({ event: 'LEGACY_QUERY_FAILED', message: legacyErr.message });
            }
        }

        // If no real preflight job is found in either table, do not create a fake/pending binding
        if (!job) {
            throw new Error('PREFLIGHT_JOB_NOT_FOUND');
        }

        let status = 'PENDING';
        let outcomeCategory = 'UNRESOLVED';
        let findingsCount = 0;
        let analysisIntegrity = {};
        let analyzerCoverage = {};
        let artifactRefs = {};
        let degradedReasons = [];

        if (isRegistry) {
            const canonicalPayload = safeParseJson(job.canonical_payload_json, null) || {};
            const result = canonicalPayload.result || canonicalPayload || {};

            status = canonicalPayload.status || job.status || 'COMPLETED';
            outcomeCategory = result.outcome_category || result.outcomeCategory || job.risk_level || 'COMPLETED';
            analysisIntegrity = result.analysisIntegrity || result.analysis_integrity || {};
            analyzerCoverage = result.analyzerCoverage || result.analyzer_coverage || {};

            artifactRefs =
                result.artifacts ||
                result.artifactRefs ||
                result.artifact_refs ||
                canonicalPayload.artifacts ||
                {};

            const findings = result.findings || result.issues || [];
            findingsCount = Number(result.issue_count || result.issueCount || job.issue_count || (Array.isArray(findings) ? findings.length : 0));

            degradedReasons = result.degraded_reasons || result.degradedReasons || [];
            if (typeof degradedReasons === 'string') {
                degradedReasons = safeParseJson(degradedReasons, []);
            }
        } else {
            // Legacy preflight_jobs fallback
            status = job.status || 'PENDING';
            const resultData = safeParseJson(job.result, null) || safeParseJson(job.metadata_json, {});

            outcomeCategory = resultData.outcomeCategory || resultData.outcome_category || resultData.outcome || (status === 'COMPLETED' ? 'COMPLETED' : 'FAILED');
            findingsCount = Number(resultData.findingsCount || resultData.findings_count || (resultData.findings && resultData.findings.length) || 0);
            analysisIntegrity = resultData.analysisIntegrity || resultData.analysis_integrity || {};
            analyzerCoverage = resultData.analyzerCoverage || resultData.analyzer_coverage || {};
            artifactRefs = resultData.artifactRefs || resultData.artifact_refs || {};
        }

        // Upsert preflight binding
        const existing = await mysqlClient.query(`
            SELECT * FROM marketplace_order_preflight_bindings WHERE preflight_job_id = ?
        `, [preflightJobId]);

        if (existing.length > 0) {
            await mysqlClient.query(`
                UPDATE marketplace_order_preflight_bindings
                SET order_id = ?, file_id = ?, role = ?, status = ?, outcome_category = ?, findings_count = ?,
                    analysis_integrity_json = ?, analyzer_coverage_json = ?, artifact_refs_json = ?, updated_at = NOW()
                WHERE preflight_job_id = ?
            `, [
                orderId, fileId, role, status, outcomeCategory, findingsCount,
                JSON.stringify(analysisIntegrity), JSON.stringify(analyzerCoverage), JSON.stringify(artifactRefs),
                preflightJobId
            ]);
        } else {
            await mysqlClient.query(`
                INSERT INTO marketplace_order_preflight_bindings (
                    order_id, file_id, preflight_job_id, role, status, outcome_category,
                    analysis_integrity_json, analyzer_coverage_json, artifact_refs_json, findings_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                orderId, fileId, preflightJobId, role, status, outcomeCategory,
                JSON.stringify(analysisIntegrity), JSON.stringify(analyzerCoverage), JSON.stringify(artifactRefs),
                findingsCount
            ]);
        }

        // Compute file status:
        // - ACCEPTED if preflight passed cleanly
        // - ACCEPTED_WITH_WARNINGS if COMPLETED_WITH_FINDINGS, DEGRADED, PARTIAL, PARTIAL_ARTIFACTS and not blocked
        // - REQUIRES_FIX if findings indicate fixable blocking issues
        // - REJECTED if FAILED_RUNTIME_ENVIRONMENT or hard failure
        let fileStatus = 'VALIDATING';
        const acceptableStatuses = ['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PASS', 'PASS_WITH_WARNINGS'];
        const warningStatuses = ['COMPLETED_WITH_FINDINGS', 'DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'];
        const blockingStatuses = ['FAILED', 'ERROR', 'FAILED_RUNTIME_ENVIRONMENT', 'ENGINE_ENVIRONMENT_FAILURE'];

        if (acceptableStatuses.includes(status)) {
            fileStatus = 'ACCEPTED';
        } else if (warningStatuses.includes(status) || warningStatuses.includes(outcomeCategory)) {
            fileStatus = 'ACCEPTED_WITH_WARNINGS';
        } else if (blockingStatuses.includes(status) || blockingStatuses.includes(outcomeCategory)) {
            fileStatus = status === 'FAILED_RUNTIME_ENVIRONMENT' || outcomeCategory === 'FAILED_RUNTIME_ENVIRONMENT' ? 'REJECTED' : 'REQUIRES_FIX';
        }

        // Update file preflight status
        await mysqlClient.query(`
            UPDATE marketplace_order_files
            SET preflight_job_id = ?, preflight_status = ?, preflight_outcome_category = ?, findings_count = ?, status = ?, updated_at = NOW()
            WHERE file_id = ?
        `, [preflightJobId, status, outcomeCategory, findingsCount, fileStatus, fileId]);

        // Log Event
        await this.appendOrderEvent(orderId, {
            fileId,
            type: 'PREFLIGHT_BOUND',
            payload: { preflightJobId, status, outcomeCategory, findingsCount, fileStatus }
        });

        // Recompute order readiness
        const readiness = await this.computeReadiness(orderId);

        return {
            ok: true,
            binding: {
                orderId,
                fileId,
                preflightJobId,
                role,
                status,
                outcomeCategory,
                findingsCount,
                fileStatus
            },
            readiness
        };
    }

    /**
     * 8. computeReadiness(orderId)
     * Asserts Phase 36.1 readiness rules.
     */
    async computeReadiness(orderId) {
        const order = await this.getOrder(orderId);
        if (!order) throw new Error('ORDER_NOT_FOUND');

        const blockers = [];
        const warnings = [];
        const humanReportGates = [];

        // 1. Selected offer required
        if (!order.selectedOfferId) {
            blockers.push('MISSING_OFFER');
        }

        // 2. Customer details required
        if (!order.customerId && !order.pricingSessionId) {
            blockers.push('MISSING_CUSTOMER');
        }

        // 3. Required files INTERIOR_PDF and COVER_PDF required and must be uploaded
        const requiredRoles = ['INTERIOR_PDF', 'COVER_PDF'];
        const activeFiles = order.productionFiles.filter(f => f.status !== 'SUPERSEDED');

        const interiorFile = activeFiles.find(f => f.kind === 'INTERIOR_PDF');
        const coverFile = activeFiles.find(f => f.kind === 'COVER_PDF');

        if (!interiorFile) {
            blockers.push('MISSING_INTERIOR_SLOT');
        } else if (interiorFile.status === 'PENDING' || interiorFile.status === 'REQUIRED') {
            blockers.push('INTERIOR_FILE_PENDING');
        }

        if (!coverFile) {
            blockers.push('MISSING_COVER_SLOT');
        } else if (coverFile.status === 'PENDING' || coverFile.status === 'REQUIRED') {
            blockers.push('COVER_FILE_PENDING');
        }

        // 4. Preflight binding required for required files before READY_TO_INVOICE
        const acceptableStatuses = [
            'COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PASS', 'PASS_WITH_WARNINGS',
            'COMPLETED_WITH_FINDINGS', 'DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'
        ];
        const blockingStatuses = [
            'FAILED', 'ERROR', 'FAILED_RUNTIME_ENVIRONMENT', 'ENGINE_ENVIRONMENT_FAILURE'
        ];

        let aggregateStatus = 'PENDING';
        let findingsCount = 0;
        let degraded = false;
        let blocked = false;

        const filesToCheck = [interiorFile, coverFile].filter(Boolean);
        const preflightStatuses = [];

        for (const file of filesToCheck) {
            if (file.status === 'PENDING' || file.status === 'REQUIRED') {
                preflightStatuses.push('PENDING');
                continue;
            }

            if (!file.preflightJobId) {
                blockers.push(`PREFLIGHT_MISSING_${file.kind}`);
                preflightStatuses.push('NOT_BOUND');
                continue;
            }

            preflightStatuses.push(file.preflightStatus);
            findingsCount += Number(file.findingsCount || 0);

            // Fetch the binding details to check for compliant rules (certifiable)
            const bindingInfo = order.preflight.results[file.kind];
            const integrity = bindingInfo?.analysisIntegrity || {};
            const isCertifiable = integrity.certifiable !== false;

            if (blockingStatuses.includes(file.preflightStatus)) {
                blocked = true;
                blockers.push(`PREFLIGHT_FAILED_${file.kind}`);
            } else if (file.preflightStatus === 'DEGRADED' || file.preflightStatus === 'PARTIAL') {
                // If it is DEGRADED but certifiable is false, it blocks!
                if (!isCertifiable) {
                    blocked = true;
                    blockers.push(`PREFLIGHT_NON_CERTIFIABLE_${file.kind}`);
                } else {
                    degraded = true;
                    warnings.push(`PREFLIGHT_DEGRADED_${file.kind}`);
                }
            } else if (!isCertifiable) {
                blocked = true;
                blockers.push(`PREFLIGHT_NON_CERTIFIABLE_${file.kind}`);
            } else if (!acceptableStatuses.includes(file.preflightStatus)) {
                blockers.push(`PREFLIGHT_UNACCEPTABLE_${file.kind}`);
            }

            // --- Phase 47 Human Report Readiness Checks ---
            try {
                const snapshotRes = await humanReportSnapshotService.getLatestSnapshot(file.preflightJobId, { tenantId: order.tenantId });

                let gateObj = {
                    file_kind: file.kind,
                    job_id: file.preflightJobId,
                    evaluated_snapshot_id: null,
                    decision_snapshot_id: null,
                    snapshot_mismatch: false,
                    outcome: 'UNKNOWN',
                    decision_report_outcome: null,
                    active_decision: null,
                    gate_code: null,
                    ready: false,
                    warning: null,
                    decision_id: null,
                    approved_artifact_type: null,
                    approved_artifact_filename: null
                };

                if (!snapshotRes.ok || !snapshotRes.snapshot_id) {
                    blocked = true;
                    gateObj.gate_code = `PREFLIGHT_HUMAN_REPORT_REQUIRED`;
                    blockers.push(`PREFLIGHT_HUMAN_REPORT_REQUIRED_${file.kind}`);
                } else {
                    gateObj.evaluated_snapshot_id = snapshotRes.snapshot_id;
                    const report = typeof snapshotRes.report_json === 'string'
                        ? JSON.parse(snapshotRes.report_json)
                        : (snapshotRes.report_json || snapshotRes.report || {});

                    const innerReport = report.report || report;
                    const outcome = innerReport.outcome || 'UNKNOWN';
                    gateObj.outcome = outcome;
                    gateObj.severity = innerReport.severity;

                    // Fetch active decision early to support trace mismatches on all outcomes
                    const approvalRes = await reviewApprovalService.getLatestDecision(file.preflightJobId, { tenantId: order.tenantId });
                    let decision = null;
                    if (approvalRes.ok && approvalRes.decision) {
                        decision = approvalRes.decision;
                        gateObj.active_decision = decision.decision;
                        gateObj.decision_id = decision.id;
                        gateObj.decision_snapshot_id = decision.snapshot_id;
                        gateObj.decision_report_outcome = decision.report_outcome;
                        gateObj.approved_artifact_type = decision.approved_artifact_type;
                        gateObj.approved_artifact_filename = decision.approved_artifact_filename;

                        if (gateObj.decision_snapshot_id && gateObj.evaluated_snapshot_id && gateObj.decision_snapshot_id !== gateObj.evaluated_snapshot_id) {
                            gateObj.snapshot_mismatch = true;
                        }
                    }

                    if (gateObj.snapshot_mismatch && gateObj.decision_report_outcome && gateObj.decision_report_outcome !== outcome) {
                        // Conflict overrides normal logic
                        blocked = true;
                        gateObj.gate_code = `PREFLIGHT_REVIEW_DECISION_SNAPSHOT_CONFLICT`;
                        blockers.push(`PREFLIGHT_REVIEW_DECISION_SNAPSHOT_CONFLICT_${file.kind}`);
                    } else {
                        // If there's a mismatch but no conflict, just add a warning
                        if (gateObj.snapshot_mismatch) {
                            warnings.push(`PREFLIGHT_REVIEW_DECISION_SNAPSHOT_MISMATCH_${file.kind}`);
                        }

                        if (outcome === 'PROCESSING') {
                        blocked = true;
                        gateObj.gate_code = `PREFLIGHT_PROCESSING`;
                        blockers.push(`PREFLIGHT_PROCESSING_${file.kind}`);
                    } else if (outcome === 'BLOCKED') {
                        blocked = true;
                        gateObj.gate_code = `PREFLIGHT_BLOCKED_BY_HUMAN_REPORT`;
                        blockers.push(`PREFLIGHT_BLOCKED_BY_HUMAN_REPORT_${file.kind}`);
                    } else if (outcome === 'UNKNOWN') {
                        blocked = true;
                        gateObj.gate_code = `PREFLIGHT_HUMAN_REPORT_UNKNOWN`;
                        blockers.push(`PREFLIGHT_HUMAN_REPORT_UNKNOWN_${file.kind}`);
                    } else if (outcome === 'FIXED_REVIEW_REQUIRED' || outcome === 'REVIEW_REQUIRED') {
                        // Check for review approval
                        if (!decision || decision.decision === 'NO_DECISION') {
                            blocked = true;
                            gateObj.gate_code = `PREFLIGHT_REVIEW_DECISION_REQUIRED`;
                            blockers.push(`PREFLIGHT_REVIEW_DECISION_REQUIRED_${file.kind}`);
                        } else {
                            if (decision.decision === 'REJECTED_REQUIRES_REUPLOAD' || decision.decision === 'REQUEST_CUSTOMER_REUPLOAD') {
                                blocked = true;
                                gateObj.gate_code = `PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED`;
                                blockers.push(`PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED_${file.kind}`);
                            } else if (decision.decision === 'APPROVED_WITH_WARNINGS') {
                                gateObj.ready = true;
                                gateObj.gate_code = `PREFLIGHT_APPROVED_WITH_WARNINGS`;
                                gateObj.warning = `PREFLIGHT_APPROVED_WITH_WARNINGS_${file.kind}`;
                                warnings.push(`PREFLIGHT_APPROVED_WITH_WARNINGS_${file.kind}`);
                            } else if (decision.decision === 'NEEDS_MORE_INFORMATION') {
                                blocked = true;
                                gateObj.gate_code = `PREFLIGHT_REVIEW_DECISION_REQUIRED`;
                                blockers.push(`PREFLIGHT_REVIEW_DECISION_REQUIRED_${file.kind}`);
                            } else if (decision.decision === 'APPROVED_FOR_PRODUCTION') {
                                gateObj.ready = true;
                                gateObj.gate_code = `PREFLIGHT_APPROVED_FOR_PRODUCTION`;
                            }
                        }
                    } else if (outcome === 'CERTIFIED_READY') {
                        gateObj.ready = true;
                        gateObj.gate_code = `PREFLIGHT_CERTIFIED_READY`;
                    } else {
                        blocked = true;
                        gateObj.gate_code = `PREFLIGHT_HUMAN_REPORT_UNKNOWN`;
                        blockers.push(`PREFLIGHT_HUMAN_REPORT_UNKNOWN_${file.kind}`);
                    }
                }
                }

                humanReportGates.push(gateObj);
            } catch (err) {
                logger.warn({ event: 'HUMAN_REPORT_READINESS_CHECK_FAILED', jobId: file.preflightJobId, error: err.message });
                blocked = true;
                blockers.push(`PREFLIGHT_HUMAN_REPORT_ERROR_${file.kind}`);
            }
        }

        // Determine aggregate status
        if (preflightStatuses.length === 0) {
            aggregateStatus = 'NOT_STARTED';
        } else if (blocked) {
            aggregateStatus = 'FAILED';
        } else if (preflightStatuses.some(s => s === 'PENDING' || s === 'NOT_BOUND')) {
            aggregateStatus = 'PENDING';
        } else if (degraded) {
            aggregateStatus = 'DEGRADED';
        } else {
            aggregateStatus = 'PASSED';
        }

        const readyToInvoice = blockers.length === 0;
        let statusSuggestion = order.status;

        if (readyToInvoice) {
            statusSuggestion = 'READY_TO_INVOICE';
        } else {
            if (blockers.includes('MISSING_OFFER')) {
                statusSuggestion = 'DRAFT';
            } else if (blockers.includes('INTERIOR_FILE_PENDING') || blockers.includes('COVER_FILE_PENDING')) {
                statusSuggestion = 'FILES_REQUIRED';
            } else if (blockers.some(b => b.startsWith('PREFLIGHT_FAILED') || b.startsWith('PREFLIGHT_NON_CERTIFIABLE'))) {
                statusSuggestion = 'PREFLIGHT_BLOCKED';
            } else if (blockers.some(b => b.startsWith('PREFLIGHT_MISSING'))) {
                statusSuggestion = 'FILES_UPLOADED';
            }
        }

        const requiredFilesObj = {
            interior: interiorFile ? {
                fileId: interiorFile.fileId,
                status: interiorFile.status,
                originalName: interiorFile.filename,
                preflightJobId: interiorFile.preflightJobId,
                preflightStatus: interiorFile.preflightStatus
            } : null,
            cover: coverFile ? {
                fileId: coverFile.fileId,
                status: coverFile.status,
                originalName: coverFile.filename,
                preflightJobId: coverFile.preflightJobId,
                preflightStatus: coverFile.preflightStatus
            } : null
        };

        const readinessObj = {
            ready: readyToInvoice,
            readyToInvoice,
            statusSuggestion,
            blockers,
            warnings,
            humanReportGates,
            requiredFiles: requiredFilesObj,
            preflight: {
                aggregateStatus,
                findingsCount,
                degraded,
                blocked
            }
        };

        try {
            let newStatus = order.status;
            if (readyToInvoice) {
                newStatus = 'READY_TO_INVOICE';
            } else if (statusSuggestion !== order.status) {
                newStatus = statusSuggestion;
            }

            await mysqlClient.query(`
                UPDATE marketplace_orders
                SET readiness_json = ?, status = ?, updated_at = NOW()
                WHERE order_id = ?
            `, [JSON.stringify(readinessObj), newStatus, orderId]);

            // Append event if state changed
            if (order.status !== newStatus) {
                await this.appendOrderEvent(orderId, {
                    type: 'STATUS_CHANGED',
                    payload: { oldStatus: order.status, newStatus }
                });
            }

            return readinessObj;
        } catch (err) {
            logger.error({ event: 'compute_readiness_failed', orderId, error: err.message });
            throw err;
        }
    }

    /**
     * 9. createRequiredFileSlots(orderId)
     * Creates required PDF slots and updates status to FILES_REQUIRED.
     */
    async createRequiredFileSlots(orderId) {
        logger.info({ event: 'MARKETPLACE_ORDER_CREATE_SLOTS', orderId });

        const order = await this.getOrder(orderId);
        if (!order) throw new Error('ORDER_NOT_FOUND');

        const requiredRoles = ['INTERIOR_PDF', 'COVER_PDF'];
        const existingRoles = order.productionFiles.map(f => f.kind);

        const createdSlots = [];
        for (const role of requiredRoles) {
            if (!existingRoles.includes(role)) {
                const fileId = generateId('fil');
                await mysqlClient.query(`
                    INSERT INTO marketplace_order_files (
                        file_id, order_id, role, version, original_name, mime_type, size_bytes,
                        status, findings_count, created_at, updated_at
                    ) VALUES (?, ?, ?, 1, ?, 'application/pdf', 0, 'REQUIRED', 0, NOW(), NOW())
                `, [fileId, orderId, role, `${role.toLowerCase()}.pdf`]);

                createdSlots.push({ role, fileId });
            }
        }

        if (createdSlots.length > 0) {
            await this.appendOrderEvent(orderId, {
                type: 'FILE_SLOTS_CREATED',
                payload: { slots: createdSlots }
            });

            // Update status to FILES_REQUIRED if currently in draft/offer_selected state
            if (['DRAFT', 'OFFER_SELECTED'].includes(order.status)) {
                await mysqlClient.query(`
                    UPDATE marketplace_orders SET status = 'FILES_REQUIRED', updated_at = NOW() WHERE order_id = ?
                `, [orderId]);
            }
        }

        await this.computeReadiness(orderId);
        return createdSlots;
    }

    // ==========================================
    // BACKWARD COMPATIBLE ADMINISTRATIVE METHODS
    // ==========================================

    async addAuditEvent(orderId, eventType, payload = {}, actorId = 'SYSTEM') {
        return this.appendOrderEvent(orderId, {
            type: eventType,
            actorType: 'ADMIN',
            actorId,
            payload
        });
    }

    async listAuditEvents(filters = {}) {
        const { orderIntentId, limit = 100, offset = 0 } = filters;
        let sql = `SELECT * FROM marketplace_order_events WHERE 1=1`;
        const params = [];
        if (orderIntentId) {
            sql += ` AND order_id = ?`;
            params.push(orderIntentId);
        }
        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(Number(limit), Number(offset));

        const rows = await mysqlClient.query(sql, params);
        return {
            ok: true,
            events: rows.map(r => ({
                id: r.id,
                entityType: 'MARKETPLACE_ORDER_INTENT',
                entityId: r.order_id,
                eventType: r.type,
                actorId: r.actor_id,
                payload: safeParseJson(r.payload_json, {}),
                createdAt: r.created_at
            }))
        };
    }

    async acknowledgeOrder(id, actorId) {
        await mysqlClient.query(`
            UPDATE marketplace_orders SET status = 'ACKNOWLEDGED', updated_at = NOW() WHERE order_id = ?
        `, [id]);
        await this.addAuditEvent(id, 'ORDER_ACKNOWLEDGED', { actorId }, actorId);
        return { ok: true };
    }

    async assignPrinthouse(id, printhouseId, actorId) {
        await mysqlClient.query(`
            UPDATE marketplace_orders SET printhouse_id = ?, updated_at = NOW() WHERE order_id = ?
        `, [printhouseId, id]);
        await this.addAuditEvent(id, 'PRINTHOUSE_ASSIGNED', { printhouseId, actorId }, actorId);
        return { ok: true };
    }

    async addNote(id, noteText, actorId) {
        const order = await this.getOrder(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const metadata = order.metadata || {};
        metadata.notes = metadata.notes || [];
        metadata.notes.push({
            text: noteText,
            authorId: actorId,
            createdAt: new Date().toISOString()
        });

        await mysqlClient.query(`
            UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?
        `, [JSON.stringify(metadata), id]);

        await this.addAuditEvent(id, 'NOTE_ADDED', { noteText, actorId }, actorId);
        return { ok: true };
    }

    async markPreflightRequired(id, actorId) {
        const order = await this.getOrder(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        for (const file of order.productionFiles) {
            await mysqlClient.query(`
                UPDATE marketplace_order_files SET status = 'PREFLIGHT_REQUIRED', updated_at = NOW() WHERE file_id = ?
            `, [file.fileId]);
        }

        await this.addAuditEvent(id, 'PREFLIGHT_REQUIRED', { actorId }, actorId);
        return { ok: true };
    }

    async requestCustomerAction(id, actionType, message, actorId) {
        const order = await this.getOrder(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const metadata = order.metadata || {};
        metadata.customerActionRequested = true;
        metadata.lastRequestedAction = {
            type: actionType,
            message,
            requestedAt: new Date().toISOString(),
            requestedBy: actorId
        };

        await mysqlClient.query(`
            UPDATE marketplace_orders
            SET metadata_json = ?, status = 'CUSTOMER_ACTION_PENDING', updated_at = NOW()
            WHERE order_id = ?
        `, [JSON.stringify(metadata), id]);

        await this.addAuditEvent(id, 'CUSTOMER_ACTION_REQUESTED', { actionType, message, actorId }, actorId);
        return { ok: true };
    }

    async manualReviewOverride(id, actorId) {
        const order = await this.getOrder(id);
        if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };

        const metadata = order.metadata || {};
        metadata.manualReviewOverride = true;
        metadata.manualReviewOverrideBy = actorId;
        metadata.manualReviewOverrideAt = new Date().toISOString();

        await mysqlClient.query(`
            UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?
        `, [JSON.stringify(metadata), id]);

        await this.addAuditEvent(id, 'MANUAL_REVIEW_OVERRIDE', { actorId }, actorId);
        await this.computeReadiness(id);
        return { ok: true };
    }

    async runPreflight(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_RUN_PREFLIGHT_DISABLED', id, actorId });
        return { ok: false, error: 'NOT_IMPLEMENTED', message: 'Simulated preflight is disabled in Phase 36.1. Please upload real files and bind real preflight jobs.' };
    }

    async markPreflightPassed(id, result = {}, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_MARK_PASSED_DISABLED', id, actorId });
        return { ok: false, error: 'NOT_IMPLEMENTED', message: 'Simulated preflight is disabled in Phase 36.1.' };
    }

    async markPreflightFailed(id, result = {}, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_MARK_FAILED_DISABLED', id, actorId });
        return { ok: false, error: 'NOT_IMPLEMENTED', message: 'Simulated preflight is disabled in Phase 36.1.' };
    }

    async markPaymentReady(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_MARK_PAYMENT_READY_DISABLED', id, actorId });
        return { ok: false, error: 'NOT_IMPLEMENTED', message: 'Payment operations are disabled in Phase 36.1.' };
    }

    async markPaymentBlocked(id, reason, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_MARK_PAYMENT_BLOCKED_DISABLED', id, actorId });
        return { ok: false, error: 'NOT_IMPLEMENTED', message: 'Payment operations are disabled in Phase 36.1.' };
    }

    async prepareHandoff(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_PREPARE_HANDOFF_DISABLED', id, actorId });
        return { ok: false, error: 'NOT_IMPLEMENTED', message: 'MES Dispatch & Handoff operations are disabled in Phase 36.1.' };
    }

    async markHandoffReady(id, actorId) {
        logger.info({ event: 'MARKETPLACE_ORDER_MARK_HANDOFF_READY_DISABLED', id, actorId });
        return { ok: false, error: 'NOT_IMPLEMENTED', message: 'MES Dispatch & Handoff operations are disabled in Phase 36.1.' };
    }

    /**
     * Asserts that an order is ready for financial/operational progression.
     * Force-refreshes readiness to ensure no stale approvals bypass the Human Report gate.
     */
    async assertOrderReadyForFinancialProgression(orderId, context = {}, options = {}) {
        // 1. Force refresh readiness
        const readiness = await this.computeReadiness(orderId);

        // 2. Check strict readiness
        if (readiness.ready !== true) {
            // Include Human Report blocker explicitly
            const humanReportBlockers = readiness.blockers?.filter(b => b.startsWith('PREFLIGHT_REVIEW_')) || [];

            // 3. Emit structured audit
            await this.addAuditEvent(orderId, 'FINANCIAL_PROGRESSION_BLOCKED_BY_READINESS', {
                context,
                readiness_ready: readiness.ready,
                blockers: readiness.blockers,
                humanReportBlockers,
                warnings: readiness.warnings,
                humanReportGates: readiness.humanReportGates
            });

            const error = new Error('Order is not ready for invoice/payment progression.');
            error.code = 'MARKETPLACE_READINESS_REQUIRED';
            error.statusCode = 409;
            error.readiness = {
                ready: false,
                blockers: readiness.blockers,
                warnings: readiness.warnings,
                humanReportGates: readiness.humanReportGates
            };
            error.blockers = readiness.blockers;
            error.warnings = readiness.warnings;
            error.humanReportGates = readiness.humanReportGates;
            throw error;
        }

        // Emit progression allowed with potential warnings
        await this.addAuditEvent(orderId, 'FINANCIAL_PROGRESSION_ALLOWED', {
            context,
            warnings: readiness.warnings,
            humanReportGates: readiness.humanReportGates
        });

        return {
            ok: true,
            orderId,
            ready: true,
            warnings: readiness.warnings || [],
            humanReportGates: readiness.humanReportGates || [],
            readiness
        };
    }
}

module.exports = new MarketplaceOrderService();
