"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import {
  HEMIPROVE_DEPLOYMENTS,
  hemiMainnet,
  hemiSepolia,
  type HemiNetworkKey,
  type HemiProveDeployment,
} from "@/lib/hemi-chain";

export const wagmiConfig = createConfig({
  chains: [hemiSepolia, hemiMainnet],
  transports: {
    [hemiSepolia.id]: http(hemiSepolia.rpcUrls.default.http[0]),
    [hemiMainnet.id]: http(hemiMainnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});

interface HemiNetworkContextValue {
  networkKey: HemiNetworkKey;
  setNetworkKey: (key: HemiNetworkKey) => void;
  deployment: HemiProveDeployment;
  liveStreamEnabled: boolean;
  setLiveStreamEnabled: (enabled: boolean) => void;
  guideDismissed: boolean;
  setGuideDismissed: (dismissed: boolean) => void;
}

const HemiNetworkContext = createContext<HemiNetworkContextValue | undefined>(undefined);

const STORAGE_NETWORK_KEY = "hemiprove-hub:network";
const STORAGE_STREAM_KEY = "hemiprove-hub:live-stream";
const STORAGE_GUIDE_KEY = "hemiprove-hub:guide-dismissed";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [networkKey, setNetworkKeyState] = useState<HemiNetworkKey>("sepolia");
  const [liveStreamEnabled, setLiveStreamState] = useState<boolean>(true);
  const [guideDismissed, setGuideDismissedState] = useState<boolean>(false);

  useEffect(() => {
    try {
      const savedNet = window.localStorage.getItem(STORAGE_NETWORK_KEY);
      if (savedNet === "mainnet" || savedNet === "sepolia") {
        setNetworkKeyState(savedNet);
      }
      const savedStream = window.localStorage.getItem(STORAGE_STREAM_KEY);
      if (savedStream === "false") {
        setLiveStreamState(false);
      }
      const savedGuide = window.localStorage.getItem(STORAGE_GUIDE_KEY);
      if (savedGuide === "true") {
        setGuideDismissedState(true);
      }
    } catch {
      // ignore storage issues in restricted contexts
    }
  }, []);

  const setNetworkKey = (key: HemiNetworkKey) => {
    setNetworkKeyState(key);
    try {
      window.localStorage.setItem(STORAGE_NETWORK_KEY, key);
    } catch {
      // ignore
    }
  };

  const setLiveStreamEnabled = (enabled: boolean) => {
    setLiveStreamState(enabled);
    try {
      window.localStorage.setItem(STORAGE_STREAM_KEY, String(enabled));
    } catch {
      // ignore
    }
  };

  const setGuideDismissed = (dismissed: boolean) => {
    setGuideDismissedState(dismissed);
    try {
      window.localStorage.setItem(STORAGE_GUIDE_KEY, String(dismissed));
    } catch {
      // ignore
    }
  };

  const value = useMemo<HemiNetworkContextValue>(
    () => ({
      networkKey,
      setNetworkKey,
      deployment: HEMIPROVE_DEPLOYMENTS[networkKey],
      liveStreamEnabled,
      setLiveStreamEnabled,
      guideDismissed,
      setGuideDismissed,
    }),
    [networkKey, liveStreamEnabled, guideDismissed]
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <HemiNetworkContext.Provider value={value}>
          {children}
        </HemiNetworkContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function useHemiNetwork() {
  const ctx = useContext(HemiNetworkContext);
  if (!ctx) {
    throw new Error("useHemiNetwork must be used inside <Providers>");
  }
  return ctx;
}
