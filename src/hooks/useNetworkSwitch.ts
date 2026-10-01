"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Network } from "../config";
import {
  NetworkSwitchService,
  NetworkSwitchStatus,
  NetworkSwitchError,
  NetworkSwitchProgressData,
  NetworkSwitchResult,
  WalletProviderType,
  detectWalletProvider,
} from "../services/networkSwitchService";
import { DEFAULT_BASE_FEE_STROOPS, formatStellarAmount, stroopsToXlm } from "../utils/stellarAmount";

export interface UseNetworkSwitchOptions {
  onSuccess?: (result: NetworkSwitchResult) => void;
  onError?: (error: NetworkSwitchError) => void;
  onStatusChange?: (data: NetworkSwitchProgressData) => void;
  defaultTimeoutMs?: number;
}

export interface UseNetworkSwitchState {
  status: NetworkSwitchStatus;
  isSwitching: boolean;
  targetNetwork: Network | null;
  walletProvider: WalletProviderType;
  estimatedFeeStroops: bigint;
  estimatedFeeXlm: string;
  formattedFee: string;
  progressMessage: string;
  error: NetworkSwitchError | null;
  result: NetworkSwitchResult | null;
}

export interface SwitchNetworkParams {
  targetNetwork: Network;
  accountAddress: string;
  walletProvider?: WalletProviderType;
  timeoutMs?: number;
  memoText?: string;
}

export interface UseNetworkSwitchReturn extends UseNetworkSwitchState {
  switchNetwork: (params: SwitchNetworkParams) => Promise<NetworkSwitchResult | null>;
  cancelSwitch: () => void;
  clearError: () => void;
  retry: () => Promise<NetworkSwitchResult | null>;
}

const initialFeeStroops = DEFAULT_BASE_FEE_STROOPS;
const initialFeeXlm = stroopsToXlm(initialFeeStroops);
const initialFormattedFee = formatStellarAmount(initialFeeStroops, { unit: "both" });

/**
 * Reusable, decoupled React hook for managing Web3 wallet network switch transaction signing.
 */
export function useNetworkSwitch(options: UseNetworkSwitchOptions = {}): UseNetworkSwitchReturn {
  const { onSuccess, onError, onStatusChange, defaultTimeoutMs } = options;

  const [status, setStatus] = useState<NetworkSwitchStatus>("idle");
  const [targetNetwork, setTargetNetwork] = useState<Network | null>(null);
  const [walletProvider, setWalletProvider] = useState<WalletProviderType>(() => detectWalletProvider());
  const [estimatedFeeStroops, setEstimatedFeeStroops] = useState<bigint>(initialFeeStroops);
  const [estimatedFeeXlm, setEstimatedFeeXlm] = useState<string>(initialFeeXlm);
  const [formattedFee, setFormattedFee] = useState<string>(initialFormattedFee);
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [error, setError] = useState<NetworkSwitchError | null>(null);
  const [result, setResult] = useState<NetworkSwitchResult | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<SwitchNetworkParams | null>(null);

  // Clean up any in-flight signing operations on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    if (status === "error" || status === "rejected" || status === "timeout") {
      setStatus("idle");
      setProgressMessage("");
    }
  }, [status]);

  const cancelSwitch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("idle");
    setProgressMessage("");
    setError(null);
  }, []);

  const handleObserver = useCallback(
    (data: NetworkSwitchProgressData) => {
      setStatus(data.status);
      setTargetNetwork(data.targetNetwork);
      setWalletProvider(data.walletProvider);
      setEstimatedFeeStroops(data.estimatedFeeStroops);
      setEstimatedFeeXlm(data.estimatedFeeXlm);
      setFormattedFee(data.formattedFee);
      if (data.message) {
        setProgressMessage(data.message);
      }
      if (data.error) {
        setError(data.error);
      }
      if (onStatusChange) {
        onStatusChange(data);
      }
    },
    [onStatusChange],
  );

  const switchNetwork = useCallback(
    async (params: SwitchNetworkParams): Promise<NetworkSwitchResult | null> => {
      // Abort any existing operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      lastParamsRef.current = params;

      const provider = params.walletProvider ?? detectWalletProvider();

      setStatus("preparing");
      setTargetNetwork(params.targetNetwork);
      setWalletProvider(provider);
      setError(null);
      setResult(null);
      setProgressMessage(`Preparing network switch to ${params.targetNetwork}...`);

      try {
        const switchResult = await NetworkSwitchService.executeSwitch({
          targetNetwork: params.targetNetwork,
          accountAddress: params.accountAddress,
          walletProvider: provider,
          timeoutMs: params.timeoutMs ?? defaultTimeoutMs,
          memoText: params.memoText,
          observer: handleObserver,
          signal: controller.signal,
        });

        setResult(switchResult);
        setStatus("confirmed");
        setProgressMessage(`Successfully switched to ${params.targetNetwork}!`);

        if (onSuccess) {
          onSuccess(switchResult);
        }

        return switchResult;
      } catch (err: unknown) {
        const switchErr =
          err instanceof NetworkSwitchError
            ? err
            : new NetworkSwitchError(
                "UNKNOWN",
                err instanceof Error ? err.message : "Failed to switch network",
                err,
              );

        setError(switchErr);
        if (switchErr.isRejection) {
          setStatus("rejected");
        } else if (switchErr.isTimeout) {
          setStatus("timeout");
        } else {
          setStatus("error");
        }

        if (onError) {
          onError(switchErr);
        }

        return null;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [defaultTimeoutMs, handleObserver, onError, onSuccess],
  );

  const retry = useCallback(async (): Promise<NetworkSwitchResult | null> => {
    if (!lastParamsRef.current) {
      return null;
    }
    return switchNetwork(lastParamsRef.current);
  }, [switchNetwork]);

  const isSwitching =
    status === "preparing" ||
    status === "simulating" ||
    status === "waiting_for_signature" ||
    status === "submitting";

  return {
    status,
    isSwitching,
    targetNetwork,
    walletProvider,
    estimatedFeeStroops,
    estimatedFeeXlm,
    formattedFee,
    progressMessage,
    error,
    result,
    switchNetwork,
    cancelSwitch,
    clearError,
    retry,
  };
}
