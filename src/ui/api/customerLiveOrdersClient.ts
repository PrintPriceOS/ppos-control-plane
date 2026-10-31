export const getCustomerLiveOrders = async () => [];
export const getCustomerLiveOrder = async (id: string) => ({ live_order_id: id });
export const approveProof = async (id: string) => true;
export const submitPaymentReference = async (id: string, ref: string) => true;
export const requestCancellation = async (id: string) => true;