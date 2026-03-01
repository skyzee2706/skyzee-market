"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import SkyUSDTABI from "@/abis/SkyUSDT.json";

const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as `0x${string}`;
const USDT_DECIMALS = 6;

export function useTokenBalance(address?: `0x${string}`) {
    const { data, refetch } = useReadContract({
        address: TOKEN_ADDRESS,
        abi: SkyUSDTABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: { enabled: !!address },
    });
    return { balance: (data as bigint | undefined) ?? 0n, refetch };
}

export function useCooldown(recipient?: `0x${string}`) {
    const { data, refetch } = useReadContract({
        address: TOKEN_ADDRESS,
        abi: SkyUSDTABI,
        functionName: "cooldownRemaining",
        args: recipient ? [recipient] : undefined,
        query: { enabled: !!recipient },
    });
    return { seconds: (data as bigint | undefined) ?? 0n, refetch };
}

export function useFaucet() {
    const { writeContract, data: txHash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

    function claim(recipient: `0x${string}`) {
        writeContract({
            address: TOKEN_ADDRESS,
            abi: SkyUSDTABI,
            functionName: "faucet",
            args: [recipient],
        });
    }

    return { claim, txHash, isPending, isConfirming, isSuccess, error };
}

export function useApproveUSDT(spender: `0x${string}`) {
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

    function approve(amount: string) {
        const amountWei = parseUnits(amount, USDT_DECIMALS);
        writeContract({
            address: TOKEN_ADDRESS,
            abi: SkyUSDTABI,
            functionName: "approve",
            args: [spender, amountWei],
        });
    }

    return { approve, txHash, isPending, isConfirming, isSuccess };
}

export function useAllowance(owner?: `0x${string}`, spender?: `0x${string}`) {
    const { data, refetch } = useReadContract({
        address: TOKEN_ADDRESS,
        abi: SkyUSDTABI,
        functionName: "allowance",
        args: owner && spender ? [owner, spender] : undefined,
        query: { enabled: !!owner && !!spender },
    });
    return { allowance: (data as bigint | undefined) ?? 0n, refetch };
}

export const USDT_DECIMALS_CONST = USDT_DECIMALS;
export const TOKEN_CONTRACT = TOKEN_ADDRESS;
