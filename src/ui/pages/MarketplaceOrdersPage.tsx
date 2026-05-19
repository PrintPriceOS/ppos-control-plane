import React from "react";
import { Navigate } from "react-router-dom";

export const MarketplaceOrdersPage: React.FC = () => {
    return <Navigate to="/ops/marketplace" replace />;
};
