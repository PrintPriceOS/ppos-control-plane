// hooks/useAdminData.ts
import useSWR from 'swr';

type Status = "idle" | "loading" | "success" | "error" | "refetching";

export function useAdminQuery<T>(key: string, fetcher: () => Promise<T>, refetchIntervalMs?: number) {
    const safeInterval = refetchIntervalMs && refetchIntervalMs < 1000 ? 5000 : refetchIntervalMs || 0;

    const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
        key,
        fetcher,
        {
            refreshInterval: safeInterval,
            revalidateOnFocus: true,
            errorRetryCount: 3
        }
    );

    let status: Status = "idle";
    if (isLoading && !data) status = "loading";
    else if (error) status = "error";
    else if (isValidating && data) status = "refetching";
    else if (data) status = "success";

    return {
        status,
        data: data || null,
        error: error?.message || error || null,
        refetch: mutate
    };
}
