"use client";

import { useWrapStore } from "../store/wrapStore";
import { getNetworkDisplayName } from "../../src/utils/networkUtils";
import {
  isPlaceholderContractAddress,
  resolveContractAddress,
} from "../../config/contractAddress";

/** Shows which contract deployment the app is using on the active network. */
export function ActiveContractAddress() {
  const network = useWrapStore((state) => state.network);
  const address = resolveContractAddress(network);
  const configured = !isPlaceholderContractAddress(address);

  return (
    <p className="mt-1 text-xs text-white/60" data-testid="active-contract-address">
      {getNetworkDisplayName(network)} contract:{" "}
      {configured ? (
        <code className="break-all font-mono text-white/80" title={address}>
          {address}
        </code>
      ) : (
        <span>not configured</span>
      )}
    </p>
  );
}
