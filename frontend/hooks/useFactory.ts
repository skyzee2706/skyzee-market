import { useReadContract } from "wagmi";
import MarketFactoryABI from "@/abis/MarketFactory.json";

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;

export function useFactory() {
    const { data: markets, isLoading, refetch } = useReadContract({
        address: FACTORY_ADDRESS,
        abi: MarketFactoryABI,
        functionName: "getAllMarkets",
    });

    return {
        markets: (markets as unknown as `0x${string}`[]) ?? [],
        isLoading,
        refetch,
    };
}
