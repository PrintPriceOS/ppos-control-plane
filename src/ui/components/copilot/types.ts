/**
 * src/ui/components/copilot/types.ts
 *
 * Phase 200 — DOT Copilot Types and Interfaces
 */

import { DotChatState } from '../mascot';

export type CopilotMode = 'ask' | 'act';

export interface PrinthouseEntity {
    id: string;
    type: 'order' | 'machine' | 'paper' | 'pricing';
    label: string;
    detail: string;
    status?: string;
}

export interface KpiSummaryCardPayload {
    type: 'KPI_SUMMARY';
    periodLabel: string;
    revenue: number;
    acceptedQuotes: number;
    pendingOrders: number;
    avgTicket: number;
    currency: string;
}

export interface PreflightAlertIssue {
    type: string;
    desc: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    autoFixable: boolean;
}

export interface PreflightAlertItem {
    orderId: string;
    fileName: string;
    issuesCount: number;
    issues: PreflightAlertIssue[];
}

export interface PreflightAlertsPayload {
    type: 'PREFLIGHT_ALERTS';
    alerts: PreflightAlertItem[];
}

export interface ActionConfirmPayload {
    type: 'ACTION_CONFIRM';
    actionId: string;
    title: string;
    summary: string;
    category?: string;
    deltaPercent?: number;
    proposedChanges?: Record<string, any>;
    status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

export type CopilotCardPayload = KpiSummaryCardPayload | PreflightAlertsPayload | ActionConfirmPayload;

export interface CopilotMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    cards?: CopilotCardPayload[];
    toolExecuted?: string;
    mentions?: string[];
}

export interface CopilotSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: CopilotMessage[];
}

export interface ContextualQuickAction {
    id: string;
    title: string;
    subtitle: string;
    prompt: string;
    icon?: string;
}
