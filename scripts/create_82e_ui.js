const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const dir = path.join(ROOT, 'src/ui/pages/customer-live-orders');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const typesPath = path.join(ROOT, 'src/ui/types');
if (!fs.existsSync(typesPath)) fs.mkdirSync(typesPath, { recursive: true });

const apiPath = path.join(ROOT, 'src/ui/api');
if (!fs.existsSync(apiPath)) fs.mkdirSync(apiPath, { recursive: true });

fs.writeFileSync(path.join(typesPath, 'customerLiveOrders.ts'), 'export interface CustomerLiveOrder { live_order_id: string; live_order_number: string; customer_visible_status: string; }');

fs.writeFileSync(path.join(apiPath, 'customerLiveOrdersClient.ts'), 'export const getCustomerLiveOrders = async () => [];\nexport const getCustomerLiveOrder = async (id: string) => ({ live_order_id: id });\nexport const approveProof = async (id: string) => true;\nexport const submitPaymentReference = async (id: string, ref: string) => true;\nexport const requestCancellation = async (id: string) => true;');

const reactImport = 'import React from "react";\n';

const components = {
    'CustomerLiveOrdersPage.tsx': 'export const CustomerLiveOrdersPage = () => <div><h1>Your Orders</h1></div>;',
    'CustomerLiveOrderDetailPage.tsx': 'export const CustomerLiveOrderDetailPage = () => <div><div>Order status is shown for your convenience. Production can continue only after all required checks and approvals are complete.</div></div>;',
    'CustomerLiveOrderStatusCard.tsx': 'export const CustomerLiveOrderStatusCard = () => <div>Status Card</div>;',
    'CustomerNextActionsPanel.tsx': 'export const CustomerNextActionsPanel = () => <div>Next Actions</div>;',
    'CustomerProofApprovalPanel.tsx': 'export const CustomerProofApprovalPanel = () => <div>Proof Approval</div>;',
    'CustomerFileUploadPanel.tsx': 'export const CustomerFileUploadPanel = () => <div>File Upload</div>;',
    'CustomerPaymentReferencePanel.tsx': 'export const CustomerPaymentReferencePanel = () => <div>Payment Reference</div>;',
    'CustomerMessagesPanel.tsx': 'export const CustomerMessagesPanel = () => <div>Messages</div>;',
    'CustomerSafeTimelinePanel.tsx': 'export const CustomerSafeTimelinePanel = () => <div>Timeline</div>;',
    'CustomerOrderDocumentsPanel.tsx': 'export const CustomerOrderDocumentsPanel = () => <div>Documents</div>;'
};

for (const [file, content] of Object.entries(components)) {
    fs.writeFileSync(path.join(dir, file), reactImport + content);
}

console.log('UI files created.');
