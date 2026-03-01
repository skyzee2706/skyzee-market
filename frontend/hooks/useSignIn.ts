"use client";
import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

const SIGN_MESSAGE = `Welcome to Sky Market! 🚀

By signing this message, you confirm that you are the owner of this wallet and agree to use the platform.

This signature does not cost any gas and does not send any transaction.

Wallet: {address}
Nonce: {nonce}`;

function buildMessage(address: string): string {
    const nonce = Math.floor(Math.random() * 1_000_000).toString();
    const msg = SIGN_MESSAGE.replace("{address}", address).replace("{nonce}", nonce);
    return msg;
}

function getStorageKey(address: string) {
    return `sky-market-signed-${address.toLowerCase()}`;
}

export function useSignIn() {
    const { address, isConnected, chainId } = useAccount();
    const { switchChain, isPending: isSwitching } = useSwitchChain();
    const { signMessageAsync, isPending: isSigning } = useSignMessage();

    const [isSigned, setIsSigned] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-switch to Sepolia when wrong chain
    useEffect(() => {
        if (isConnected && chainId !== sepolia.id) {
            switchChain({ chainId: sepolia.id });
        }
    }, [isConnected, chainId, switchChain]);

    // Check if already signed in this session
    useEffect(() => {
        if (!address) {
            setIsSigned(false);
            setShowSignModal(false);
            return;
        }
        const stored = sessionStorage.getItem(getStorageKey(address));
        if (stored === "signed") {
            setIsSigned(true);
        } else {
            // Show sign modal after a tiny delay so wallet connect modal closes first
            const t = setTimeout(() => setShowSignModal(true), 600);
            return () => clearTimeout(t);
        }
    }, [address]);

    const signIn = useCallback(async () => {
        if (!address) return;
        setError(null);
        try {
            const msg = buildMessage(address);
            await signMessageAsync({ message: msg });
            sessionStorage.setItem(getStorageKey(address), "signed");
            setIsSigned(true);
            setShowSignModal(false);
        } catch (e: any) {
            if (e?.code === 4001 || e?.name === "UserRejectedRequestError") {
                setError("You rejected the sign request. Please sign to continue.");
            } else {
                setError(e?.message || "Signing failed. Please try again.");
            }
        }
    }, [address, signMessageAsync]);

    const dismiss = useCallback(() => {
        // Allow dismissing without signing (optional feature gate can be added here)
        setShowSignModal(false);
    }, []);

    return { isSigned, showSignModal, signIn, dismiss, isSigning, isSwitching, error };
}
