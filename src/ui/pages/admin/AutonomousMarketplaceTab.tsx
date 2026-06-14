import React, { useState, useEffect } from "react";
import { 
    getMarketplaceAuctions, 
    placeMarketplaceBid, 
    getMarketplaceLedger, 
    MarketplaceAuction, 
    LedgerEntry 
} from "../../lib/adminApi";
import { 
    GlobeAltIcon, 
    ArrowPathIcon, 
    ExclamationTriangleIcon, 
    ShieldCheckIcon,
    CircleStackIcon,
    CurrencyDollarIcon,
    ClockIcon
} from "@heroicons/react/24/outline";

export const AutonomousMarketplaceTab: React.FC = () => {
    const [auctions, setAuctions] = useState<MarketplaceAuction[]>([]);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({});
    const [actioning, setActioning] = useState<Record<string, boolean>>({});
    const [actionStatus, setActionStatus] = useState<Record<string, { success?: boolean; error?: string }>>({});

    const fetchData = async () => {
        try {
            const [auctionData, ledgerData] = await Promise.all([
                getMarketplaceAuctions(),
                getMarketplaceLedger()
            ]);
            setAuctions(auctionData || []);
            setLedger(ledgerData || []);
            setError(null);
        } catch (err: any) {
            setError(err.message || "Failed to retrieve marketplace data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const timer = setInterval(() => {
            fetchData();
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    const handleBid = async (auctionId: string, reservePrice: number) => {
        const amtStr = bidAmounts[auctionId];
        const amount = parseFloat(amtStr);
        if (isNaN(amount) || amount < reservePrice) {
            setActionStatus(prev => ({
                ...prev,
                [auctionId]: { error: `Bid must meet the reserve price threshold of $${reservePrice.toFixed(2)}.` }
            }));
            return;
        }

        setActioning(prev => ({ ...prev, [auctionId]: true }));
        setActionStatus(prev => ({ ...prev, [auctionId]: {} }));

        try {
            const res = await placeMarketplaceBid(auctionId, amount);
            if (res && res.ok) {
                setActionStatus(prev => ({
                    ...prev,
                    [auctionId]: { success: true }
                }));
                setBidAmounts(prev => ({ ...prev, [auctionId]: "" }));
                fetchData();
            } else {
                setActionStatus(prev => ({
                    ...prev,
                    [auctionId]: { error: res?.message || "Bid placement operation failed." }
                }));
            }
        } catch (err: any) {
            setActionStatus(prev => ({
                ...prev,
                [auctionId]: { error: err.message || "Failed to submit bid." }
            }));
        } finally {
            setActioning(prev => ({ ...prev, [auctionId]: false }));
        }
    };

    // Aggregate Ledger Balances
    const safeLedger = Array.isArray(ledger) ? ledger : [];
    const safeAuctions = Array.isArray(auctions) ? auctions : [];

    const nodeBalances: Record<string, { currency: number; capacity: number }> = {};
    safeLedger.forEach((entry) => {
        const acc = entry.account_id;
        const matches = acc.match(/^(node_[a-zA-Z0-9_]+)_(currency|capacity)$/);
        if (matches) {
            const node = matches[1];
            const type = matches[2];
            if (!nodeBalances[node]) {
                nodeBalances[node] = { currency: 0, capacity: 0 };
            }
            const val = parseFloat(String(entry.amount));
            const modifier = entry.entry_type === "CREDIT" ? 1 : -1;
            if (type === "currency") {
                nodeBalances[node].currency += val * modifier;
            } else if (type === "capacity") {
                nodeBalances[node].capacity += val * modifier;
            }
        }
    });

    if (loading && safeAuctions.length === 0 && safeLedger.length === 0) {
        return (
            <div className="bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border border-slate-200 dark:border-zinc-800 p-12 flex flex-col items-center justify-center gap-3">
                <ArrowPathIcon className="w-8 h-8 text-slate-400 animate-spin" />
                <p className="text-xs font-mono text-slate-550 dark:text-zinc-400">Syncing with capacity clearing mesh...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 font-mono text-xs text-slate-900 dark:text-white">
            {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Panel A: Active Capacity Board */}
                <div className="lg:col-span-2 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border border-slate-200 dark:border-zinc-800 p-5 flex flex-col">
                    <h3 className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-zinc-850/60 pb-2">
                        <GlobeAltIcon className="w-4 h-4 text-emerald-400 animate-pulse" />
                        Active Capacity Pools (Auction Board)
                    </h3>
                    
                    {safeAuctions.length === 0 ? (
                        <p className="text-slate-500 dark:text-zinc-400 italic text-center py-10">No active capacity slots in negotiation</p>
                    ) : (
                        <div className="space-y-4">
                            {safeAuctions.map((auction) => {
                                const isExpired = auction.status === "EXPIRED";
                                const isMatched = auction.status === "MATCHED";
                                const isOpen = auction.status === "OPEN";

                                // Formatted timestamps
                                const start = new Date(auction.slot_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const end = new Date(auction.slot_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const close = new Date(auction.close_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                return (
                                    <div key={auction.id} className="p-4 border border-slate-100 dark:border-zinc-850/60 bg-slate-50/50 dark:bg-zinc-900/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-xs font-black uppercase tracking-wider ${
                                                    isOpen ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse" :
                                                    isMatched ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                                                    "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-zinc-400 border border-slate-100 dark:border-zinc-850/60"
                                                }`}>
                                                    {auction.status}
                                                </span>
                                                <span className="font-bold text-slate-900 dark:text-white text-sm">{auction.machine_category}</span>
                                            </div>
                                            <div className="text-slate-500 dark:text-zinc-400 text-[10px] space-y-0.5">
                                                <p>AUCTION ID: <span className="text-slate-900 dark:text-white font-bold">{auction.id}</span></p>
                                                <p>OWNER NODE: <span className="text-slate-900 dark:text-white">{auction.owner_node_id}</span></p>
                                                <p>SHIFT TIME: <span className="text-slate-900 dark:text-white">{start} - {end}</span></p>
                                                <p>CLOSE WINDOW: <span className="text-slate-900 dark:text-white font-bold">{close}</span></p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-start md:items-end justify-center gap-2">
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase">Reserve Price / Capacity</p>
                                                <p className="text-sm font-bold text-emerald-400">
                                                    ${Number(auction.reserve_price).toFixed(2)} <span className="text-slate-500 dark:text-zinc-400 text-[10px] font-normal">/ {auction.capacity_quantity} units</span>
                                                </p>
                                            </div>

                                            {isOpen && (
                                                <div className="space-y-1">
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="number"
                                                            step="0.01"
                                                            className="bg-slate-50/50 dark:bg-black/40 border border-slate-200 dark:border-zinc-800 px-2 py-1 text-slate-900 dark:text-white text-xs w-24 outline-none focus:border-emerald-500"
                                                            placeholder={`min $${Number(auction.reserve_price).toFixed(0)}`}
                                                            value={bidAmounts[auction.id] || ""}
                                                            onChange={(e) => setBidAmounts(prev => ({ ...prev, [auction.id]: e.target.value }))}
                                                        />
                                                        <button
                                                            onClick={() => handleBid(auction.id, auction.reserve_price)}
                                                            disabled={actioning[auction.id]}
                                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 uppercase text-[10px] tracking-wider transition-colors disabled:opacity-50"
                                                        >
                                                            Bid
                                                        </button>
                                                    </div>
                                                    {actionStatus[auction.id]?.error && (
                                                        <p className="text-[9px] text-rose-400">{actionStatus[auction.id].error}</p>
                                                    )}
                                                    {actionStatus[auction.id]?.success && (
                                                        <p className="text-[9px] text-emerald-400">Bid Placed Successfully!</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Panel C: Federation Asset Allocation */}
                <div className="bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border border-slate-200 dark:border-zinc-800 p-5">
                    <h3 className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-zinc-850/60 pb-2">
                        <CurrencyDollarIcon className="w-4 h-4 text-emerald-400" />
                        Federation Asset Allocation
                    </h3>

                    {Object.keys(nodeBalances).length === 0 ? (
                        <p className="text-slate-500 dark:text-zinc-400 italic text-center py-10">No node balance updates recorded</p>
                    ) : (
                        <div className="space-y-3">
                            {Object.entries(nodeBalances).map(([node, bal]) => (
                                <div key={node} className="p-3 border border-slate-100 dark:border-zinc-850/60 bg-slate-50/50 dark:bg-zinc-900/20 flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white">{node}</p>
                                        <p className="text-[9px] text-slate-500 dark:text-zinc-400">FEDERATION NODE PARTICIPANT</p>
                                    </div>
                                    <div className="text-right font-bold space-y-0.5">
                                        <p className="text-emerald-400">${bal.currency.toFixed(2)}</p>
                                        <p className="text-indigo-400">{bal.capacity} Units</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            {/* Panel B: Cryptographic Audit Chain */}
            <div className="bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border border-slate-200 dark:border-zinc-800 p-5">
                <h3 className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-zinc-850/60 pb-2">
                    <CircleStackIcon className="w-4 h-4 text-emerald-400" />
                    Cryptographic Audit Chain (Ledger Ledger)
                </h3>

                {safeLedger.length === 0 ? (
                    <p className="text-slate-500 dark:text-zinc-400 italic text-center py-10">No transactions recorded in the ledger chain</p>
                ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                        {safeLedger.map((entry, idx) => {
                            // Verify parents logic
                            const prevEntry = idx > 0 ? safeLedger[idx - 1] : null;
                            const isChained = prevEntry ? entry.parent_hash === prevEntry.cryptographic_hash : true;

                            return (
                                <div key={entry.entry_id} className="p-3 border border-slate-100 dark:border-zinc-850/60 bg-slate-50/50 dark:bg-zinc-900/20 font-mono text-[10px] space-y-1 relative">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-zinc-400 px-1 border border-slate-200 dark:border-zinc-800">#{entry.entry_id}</span>
                                            <span className="font-bold text-slate-900 dark:text-white">{entry.transaction_id}</span>
                                        </div>
                                        <span className={`text-[8px] px-1.5 py-0.2 font-black uppercase ${
                                            isChained ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse"
                                        }`}>
                                            {isChained ? "[CHAINED_OK]" : "[CHAIN_BROKEN]"}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1.5 border-t border-slate-100 dark:border-zinc-850/60 text-slate-500 dark:text-zinc-400">
                                        <div>
                                            <span className="text-slate-500 dark:text-zinc-400">ACCOUNT: </span>
                                            <span className="text-slate-900 dark:text-white">{entry.account_id}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 dark:text-zinc-400">TYPE / ASSET: </span>
                                            <span className={entry.entry_type === "CREDIT" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                                {entry.entry_type} ({entry.asset_type})
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 dark:text-zinc-400">AMOUNT: </span>
                                            <span className="text-slate-900 dark:text-white font-bold">{entry.amount}</span>
                                        </div>
                                    </div>

                                    <div className="text-[9px] text-slate-500 dark:text-zinc-400 space-y-0.5 pt-1">
                                        <p className="truncate">HASH: <span className="text-slate-500 dark:text-zinc-400 font-mono">{entry.cryptographic_hash}</span></p>
                                        <p className="truncate">PARENT: <span className="text-slate-500 dark:text-zinc-400 font-mono">{entry.parent_hash}</span></p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
