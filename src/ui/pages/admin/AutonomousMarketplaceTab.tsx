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
    const nodeBalances: Record<string, { currency: number; capacity: number }> = {};
    ledger.forEach((entry) => {
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

    if (loading && auctions.length === 0 && ledger.length === 0) {
        return (
            <div className="bg-[#131314] border border-white/10 p-12 flex flex-col items-center justify-center gap-3">
                <ArrowPathIcon className="w-8 h-8 text-slate-400 animate-spin" />
                <p className="text-xs font-mono text-slate-400">Syncing with capacity clearing mesh...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 font-mono text-xs text-slate-300">
            {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Panel A: Active Capacity Board */}
                <div className="lg:col-span-2 bg-[#18181b] border border-white/10 p-5 flex flex-col">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                        <GlobeAltIcon className="w-4 h-4 text-emerald-400 animate-pulse" />
                        Active Capacity Pools (Auction Board)
                    </h3>
                    
                    {auctions.length === 0 ? (
                        <p className="text-slate-500 italic text-center py-10">No active capacity slots in negotiation</p>
                    ) : (
                        <div className="space-y-4">
                            {auctions.map((auction) => {
                                const isExpired = auction.status === "EXPIRED";
                                const isMatched = auction.status === "MATCHED";
                                const isOpen = auction.status === "OPEN";

                                // Formatted timestamps
                                const start = new Date(auction.slot_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const end = new Date(auction.slot_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const close = new Date(auction.close_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                return (
                                    <div key={auction.id} className="p-4 border border-white/5 bg-[#121214] flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-xs font-black uppercase tracking-wider ${
                                                    isOpen ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse" :
                                                    isMatched ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                                                    "bg-slate-800 text-slate-500 border border-white/5"
                                                }`}>
                                                    {auction.status}
                                                </span>
                                                <span className="font-bold text-white text-sm">{auction.machine_category}</span>
                                            </div>
                                            <div className="text-slate-500 text-[10px] space-y-0.5">
                                                <p>AUCTION ID: <span className="text-slate-300 font-bold">{auction.id}</span></p>
                                                <p>OWNER NODE: <span className="text-slate-300">{auction.owner_node_id}</span></p>
                                                <p>SHIFT TIME: <span className="text-slate-300">{start} - {end}</span></p>
                                                <p>CLOSE WINDOW: <span className="text-slate-300 font-bold">{close}</span></p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-start md:items-end justify-center gap-2">
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-500 uppercase">Reserve Price / Capacity</p>
                                                <p className="text-sm font-bold text-emerald-400">
                                                    ${Number(auction.reserve_price).toFixed(2)} <span className="text-slate-500 text-[10px] font-normal">/ {auction.capacity_quantity} units</span>
                                                </p>
                                            </div>

                                            {isOpen && (
                                                <div className="space-y-1">
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="number"
                                                            step="0.01"
                                                            className="bg-black/40 border border-white/10 px-2 py-1 text-white text-xs w-24 outline-none focus:border-emerald-500"
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
                <div className="bg-[#18181b] border border-white/10 p-5">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                        <CurrencyDollarIcon className="w-4 h-4 text-emerald-400" />
                        Federation Asset Allocation
                    </h3>

                    {Object.keys(nodeBalances).length === 0 ? (
                        <p className="text-slate-500 italic text-center py-10">No node balance updates recorded</p>
                    ) : (
                        <div className="space-y-3">
                            {Object.entries(nodeBalances).map(([node, bal]) => (
                                <div key={node} className="p-3 border border-white/5 bg-[#121214] flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-white">{node}</p>
                                        <p className="text-[9px] text-slate-500">FEDERATION NODE PARTICIPANT</p>
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
            <div className="bg-[#18181b] border border-white/10 p-5">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                    <CircleStackIcon className="w-4 h-4 text-emerald-400" />
                    Cryptographic Audit Chain (Ledger Ledger)
                </h3>

                {ledger.length === 0 ? (
                    <p className="text-slate-500 italic text-center py-10">No transactions recorded in the ledger chain</p>
                ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {ledger.map((entry, idx) => {
                            // Verify parents logic
                            const prevEntry = idx > 0 ? ledger[idx - 1] : null;
                            const isChained = prevEntry ? entry.parent_hash === prevEntry.cryptographic_hash : true;

                            return (
                                <div key={entry.entry_id} className="p-3 border border-white/5 bg-black/40 font-mono text-[10px] space-y-1 relative">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] bg-slate-800 text-slate-400 px-1 border border-white/5">#{entry.entry_id}</span>
                                            <span className="font-bold text-white">{entry.transaction_id}</span>
                                        </div>
                                        <span className={`text-[8px] px-1.5 py-0.2 font-black uppercase ${
                                            isChained ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse"
                                        }`}>
                                            {isChained ? "[CHAINED_OK]" : "[CHAIN_BROKEN]"}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1.5 border-t border-white/5 text-slate-400">
                                        <div>
                                            <span className="text-slate-500">ACCOUNT: </span>
                                            <span className="text-white">{entry.account_id}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">TYPE / ASSET: </span>
                                            <span className={entry.entry_type === "CREDIT" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                                {entry.entry_type} ({entry.asset_type})
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">AMOUNT: </span>
                                            <span className="text-white font-bold">{entry.amount}</span>
                                        </div>
                                    </div>

                                    <div className="text-[9px] text-slate-500 space-y-0.5 pt-1">
                                        <p className="truncate">HASH: <span className="text-slate-400 font-mono">{entry.cryptographic_hash}</span></p>
                                        <p className="truncate">PARENT: <span className="text-slate-400 font-mono">{entry.parent_hash}</span></p>
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
