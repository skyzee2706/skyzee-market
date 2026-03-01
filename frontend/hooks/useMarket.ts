import { useReadContract, useReadContracts } from "wagmi";
import PredictionMarketABI from "@/abis/PredictionMarket.json";

export interface MarketInfo {
    question: string;
    strikePrice: bigint;
    endTime: bigint;
    bettingEndTime: bigint;
    resolved: boolean;
    result: boolean;
    yesPool: bigint;
    noPool: bigint;
    yesPrice: bigint;  // scaled 1e18
    settlementPrice: bigint;
}

export function useMarket(address: `0x${string}` | undefined) {
    const fields = [
        "question", "strikePrice", "endTime", "bettingEndTime",
        "resolved", "result", "yesPool", "noPool", "yesPrice", "settlementPrice"
    ] as const;

    const { data, isLoading, refetch } = useReadContracts({
        contracts: fields.map((fn) => ({
            address,
            abi: PredictionMarketABI as any,
            functionName: fn,
        })),
        query: { enabled: !!address, refetchInterval: 5000 },
    });

    let marketInfo: MarketInfo | undefined;
    if (data && data.every((d) => d.result !== undefined)) {
        const [question, strikePrice, endTime, bettingEndTime, resolved, result, yesPool, noPool, yesPrice, settlementPrice] =
            data.map((d) => d.result) as [string, bigint, bigint, bigint, boolean, boolean, bigint, bigint, bigint, bigint];
        marketInfo = { question, strikePrice, endTime, bettingEndTime, resolved, result, yesPool, noPool, yesPrice, settlementPrice };
    }

    return { marketInfo, isLoading, refetch };
}

export function useUserPosition(
    address: `0x${string}` | undefined,
    user: `0x${string}` | undefined
) {
    const { data, refetch } = useReadContract({
        address,
        abi: PredictionMarketABI,
        functionName: "getUserPosition",
        args: [user!],
        query: { enabled: !!address && !!user },
    });

    if (!data) return { yesBet: 0n, noBet: 0n, claimed: false, refetch };
    const [yesBet, noBet, claimed] = data as [bigint, bigint, boolean];
    return { yesBet, noBet, claimed, refetch };
}

export function useAllMarketsStatus(addresses: `0x${string}`[]) {
    const contracts = addresses.map((addr) => ({
        address: addr,
        abi: PredictionMarketABI as any,
        functionName: "resolved",
    }));

    const { data, isLoading } = useReadContracts({
        contracts,
        query: { enabled: addresses.length > 0, refetchInterval: 5000 },
    });

    // Extract statuses: return map of address -> boolean
    const statuses: Record<string, boolean> = {};
    if (data) {
        data.forEach((res, i) => {
            statuses[addresses[i]] = res.result === true;
        });
    }

    return { statuses, isLoading };
}

// Fetches user betting positions across an array of markets
export function useUserHistory(
    addresses: `0x${string}`[],
    user: `0x${string}` | undefined
) {
    const contracts = addresses.map((addr) => ({
        address: addr,
        abi: PredictionMarketABI as any,
        functionName: "getUserPosition",
        args: [user!],
    }));

    const { data, isLoading, refetch } = useReadContracts({
        contracts,
        query: { enabled: addresses.length > 0 && !!user },
    });

    const positions: Record<string, { yesBet: bigint; noBet: bigint; claimed: boolean }> = {};

    if (data) {
        data.forEach((res, i) => {
            if (res.result) {
                const [yesBet, noBet, claimed] = res.result as [bigint, bigint, boolean];
                positions[addresses[i]] = { yesBet, noBet, claimed };
            }
        });
    }

    return { positions, isLoading, refetch };
}
