"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Wallet, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { useWrapStore } from "../../store/wrapStore";
import { useWalletStore } from "../../store/walletStore";
import { ConnectWalletButton } from "../../components/ConnectWalletButton";
import { invokeSorobanContract } from "@/src/utils/sorobanConverter";
import { getContractNetworkConfig } from "@/config/contracts";
import { stellarToStroops } from "../../utils/walletConnect";

export default function WithdrawPage() {
  const router = useRouter();
  const network = useWrapStore((s) => s.network);
  const { address, provider, isConnected } = useWalletStore();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "withdrawing" | "success" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const withdrawButtonRef = useRef<HTMLButtonElement>(null);
  const withdrawAgainButtonRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const handleWithdraw = useCallback(async () => {
    setError(null);
    setTxHash(null);

    if (!isConnected || !address) {
      setError("Please connect your wallet first.");
      return;
    }

    const stroops = stellarToStroops(amount);
    if (stroops <= 0n) {
      setError("Please enter a valid amount.");
      return;
    }

    setStatus("withdrawing");

    try {
      const { contractAddress, rpcUrl, networkPassphrase } =
        getContractNetworkConfig(network);

      const result = await invokeSorobanContract({
        rpcUrl,
        networkPassphrase,
        sourceAddress: address,
        contractId: contractAddress,
        method: "withdraw",
        args: [stroops.toString()],
        argTypes: ["i128"],
        simulationTimeoutMs: 15_000,
        sendTimeoutMs: 15_000,
      });

      setTxHash(result.transactionHash);
      setStatus("success");
      toast.success("Withdrawal submitted successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Withdrawal failed. Please try again.";
      setError(message);
      setStatus("failed");
    }
  }, [amount, isConnected, address, network]);

  const isWithdrawing = status === "withdrawing";

  // Move focus to the amount input when the wallet connects so keyboard users
  // land on the first actionable control of the flow.
  useEffect(() => {
    if (isConnected) {
      amountInputRef.current?.focus();
    }
  }, [isConnected]);

  // Move focus to the error alert when validation or submission fails so
  // screen reader and keyboard users are notified immediately.
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  // Move focus to the "Withdraw Again" action once the withdrawal succeeds.
  useEffect(() => {
    if (status === "success") {
      withdrawAgainButtonRef.current?.focus();
    }
  }, [status]);

  return (
    <main className="relative w-full min-h-screen h-screen overflow-hidden flex items-center justify-center bg-theme-background">
      <div className="absolute inset-0 bg-linear-to-br from-black via-black to-black opacity-60" />

      <div className="relative z-10 max-w-xl w-full mx-auto px-4 sm:px-6 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-3 tracking-tight">
            Withdraw
          </h1>
          <p className="text-base text-white/60 font-medium">
            Withdraw funds from your Soroban smart contract
          </p>
        </motion.div>

        <div
          className="relative backdrop-blur-xl p-6 sm:p-8 rounded-2xl border"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            borderColor: "rgba(var(--color-theme-primary-rgb), 0.3)",
          }}
        >
          {!isConnected ? (
            <div className="space-y-4">
              <p className="text-sm text-white/60 text-center">
                Connect your wallet to withdraw
              </p>
              <ConnectWalletButton
                walletName={provider ?? "Freighter"}
                icon={<Wallet className="w-5 h-5" />}
                onConnect={() => {}}
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="withdraw-amount"
                  className="block text-sm font-black text-white/70 mb-2 tracking-wider"
                >
                  Amount (XLM)
                </label>
                <input
                  id="withdraw-amount"
                  ref={amountInputRef}
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isWithdrawing && amount.trim()) {
                      e.preventDefault();
                      void handleWithdraw();
                    }
                  }}
                  placeholder="0.0000000"
                  className="w-full px-5 py-4 rounded-xl font-mono text-sm sm:text-base border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-black bg-black/50"
                  style={{
                    borderColor: error
                      ? "rgba(239, 68, 68, 0.5)"
                      : "rgba(255, 255, 255, 0.1)",
                    color: "white",
                  }}
                  disabled={isWithdrawing}
                  aria-invalid={!!error}
                  aria-describedby={error ? "withdraw-error" : undefined}
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  id="withdraw-error"
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  aria-live="assertive"
                  className="p-4 bg-red-500/10 border-2 border-red-500/50 rounded-xl text-red-400 text-sm font-medium flex items-start gap-2 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </motion.div>
              )}

              {status === "success" && txHash && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-emerald-500/10 border-2 border-emerald-500/50 rounded-xl text-emerald-400 text-sm font-medium flex items-start gap-2"
                >
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Withdrawal submitted</p>
                    <p className="text-xs mt-1 break-all font-mono opacity-80">
                      Hash: {txHash}
                    </p>
                  </div>
                </motion.div>
              )}

              <motion.button
                ref={withdrawButtonRef}
                onClick={handleWithdraw}
                disabled={isWithdrawing || !amount.trim()}
                className="w-full px-6 py-4 rounded-xl font-bold text-black bg-theme-primary hover:bg-theme-primary/90 transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={isWithdrawing ? undefined : { scale: 1.02 }}
                whileTap={isWithdrawing ? undefined : { scale: 0.98 }}
              >
                {isWithdrawing && (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                )}
                <span>
                  {isWithdrawing ? "Withdrawing..." : "Withdraw"}
                </span>
              </motion.button>

              {status === "success" && (
                <motion.button
                  ref={withdrawAgainButtonRef}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => {
                    setStatus("idle");
                    setAmount("");
                    setTxHash(null);
                    setError(null);
                    amountInputRef.current?.focus();
                  }}
                  className="w-full px-6 py-3 rounded-xl font-bold text-white/70 border border-white/10 hover:text-white hover:border-white/20 transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-black"
                >
                  Withdraw Again
                </motion.button>
              )}
            </div>
          )}
        </div>

        <motion.button
          onClick={() => router.back()}
          className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-white/60 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-black rounded-lg px-2 py-1"
          aria-label="Go back to previous page"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </motion.button>
      </div>
    </main>
  );
}
