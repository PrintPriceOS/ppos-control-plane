import React from 'react';
import { SharedModuleProps } from '../../components/common';
import { ManufacturingQueuePage } from '../manufacturing/ManufacturingQueuePage';

export const ProductionDashboard: React.FC<SharedModuleProps> = (props) => {
    return <ManufacturingQueuePage {...props} />;
};
export default ProductionDashboard;
