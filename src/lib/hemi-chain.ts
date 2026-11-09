import { defineChain, type Address, type Hex } from "viem";

export type HemiNetworkKey = "mainnet" | "sepolia";

export const hemiMainnet = defineChain({
  id: 43111,
  name: "Hemi Mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.hemi.network/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "Hemi Explorer",
      url: "https://explorer.hemi.xyz",
      apiUrl: "https://explorer.hemi.xyz/api/v2",
    },
  },
});

export const hemiSepolia = defineChain({
  id: 743111,
  name: "Hemi Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "Sepolia Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://testnet.rpc.hemi.network/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "Hemi Testnet Explorer",
      url: "https://testnet.explorer.hemi.xyz",
      apiUrl: "https://testnet.explorer.hemi.xyz/api/v2",
    },
  },
  testnet: true,
});

export type VerifierStatusLabel = "ACTIVE" | "STAGED" | "743111-ONLY";

export interface HemiProveDeployment {
  networkKey: HemiNetworkKey;
  chainId: 43111 | 743111;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  blockscoutApiUrl: string;
  deployed: boolean;
  deploymentNote: string;
  routerStatusTag: string;
  verifierStatus: {
    risc0: VerifierStatusLabel;
    sp1: VerifierStatusLabel;
    openvm: VerifierStatusLabel;
  };
  router: Address | null;
  staking: Address | null;
  registry: Address | null;
  hemiToken: Address | null;
  programRegistry: Address | null;
  scanFromBlock: bigint;
}

/**
 * Source of truth: hemilabs/zk-miner `crates/zkminer-chain/src/deployment.rs`
 * and `hemiprove-abi/INTERACTION_GUIDE.md` §3 (`OPENVM_HALO2_V1` is 743111-only at launch).
 * Hemi testnet (743111) deployed 2026-10-29 from zkmarket commit c8333aa.
 * Hemi mainnet (43111) router is staged until `NEXT_PUBLIC_MAINNET_HEMIPROVE_ROUTER` is configured.
 */
const mainnetRouterEnv =
  (process.env.NEXT_PUBLIC_MAINNET_HEMIPROVE_ROUTER as Address | undefined) ?? null;

export const HEMIPROVE_DEPLOYMENTS: Record<HemiNetworkKey, HemiProveDeployment> = {
  sepolia: {
    networkKey: "sepolia",
    chainId: 743111,
    name: "Hemi Sepolia Testnet",
    shortName: "Hemi Sepolia (743111)",
    rpcUrl: "https://testnet.rpc.hemi.network/rpc",
    explorerUrl: "https://testnet.explorer.hemi.xyz",
    blockscoutApiUrl: "https://testnet.explorer.hemi.xyz/api/v2",
    deployed: true,
    deploymentNote: "Audited HemiProve v2 Stack (zkmarket@c8333aa)",
    routerStatusTag: "743111-REHEARSAL",
    verifierStatus: {
      risc0: "ACTIVE",
      sp1: "ACTIVE",
      openvm: "ACTIVE",
    },
    router: "0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e",
    staking: "0x44b2DDCfBe37900917E3750A4996BA007F4aA66E",
    registry: "0x77fDb1DCE2224B75BA295f2Cdd87Ba5247d4BBc6",
    hemiToken: "0x46955EdCF61b23a8c0b0d71428A9F1C07Bbf36cc",
    programRegistry: "0xCC761A929747A81e34517e1f4F98247da925cAb4",
    scanFromBlock: BigInt(7_095_745),
  },
  mainnet: {
    networkKey: "mainnet",
    chainId: 43111,
    name: "Hemi Mainnet",
    shortName: "Hemi Mainnet (43111)",
    rpcUrl: "https://rpc.hemi.network/rpc",
    explorerUrl: "https://explorer.hemi.xyz",
    blockscoutApiUrl: "https://explorer.hemi.xyz/api/v2",
    deployed: Boolean(mainnetRouterEnv),
    deploymentNote: mainnetRouterEnv
      ? "Mainnet HemiProve v2 Router Active"
      : "Staged (Pre-Deployment) — Live Rehearsal Active on 743111",
    routerStatusTag: mainnetRouterEnv ? "43111-LIVE" : "STAGED (PRE-DEPLOYMENT)",
    verifierStatus: {
      risc0: mainnetRouterEnv ? "ACTIVE" : "STAGED",
      sp1: mainnetRouterEnv ? "ACTIVE" : "STAGED",
      openvm: "743111-ONLY",
    },
    router: mainnetRouterEnv,
    staking:
      (process.env.NEXT_PUBLIC_MAINNET_HEMIPROVE_STAKING as Address | undefined) ??
      null,
    registry:
      (process.env.NEXT_PUBLIC_MAINNET_HEMIPROVE_REGISTRY as Address | undefined) ??
      null,
    hemiToken:
      (process.env.NEXT_PUBLIC_MAINNET_HEMI_TOKEN as Address | undefined) ??
      "0x99e3dE3817F6081B2568208337ef83295b7f591D",
    programRegistry:
      (process.env.NEXT_PUBLIC_MAINNET_PROGRAM_REGISTRY as Address | undefined) ??
      null,
    scanFromBlock: BigInt(0),
  },
};

/**
 * Exact Audited Runtime Code Pins from `crates/zkminer-chain/src/deployment.rs`
 */
export const AUDITED_CODE_PINS = {
  erc1967Proxy: "0x46a010df31eb642b47284650e80051e8f6239a0c995003d230b437810bc4b9b4",
  routerImpl: "0xfe19d149183c16c2c5917745002d824fb94dc5f1766d8ecf2f1e2ab4c5f6d2aa",
  stakingImpl: "0x8f2769b1ac7e443981de10adba5962fd42552bd14f10006b5f30921eb70aea94",
  registryImpl: "0xf6ea9179aa36f691770372da03089f89bd0f6b0e52a7976ad749167f9b4388b2",
  programRegistryImpl: "0x2b4b0456f6994a01cf2adf63ad65a2b1073cbfe3d1000cc8417beb0a9c7d5203",
  risc0Selector: "0x73c457ba",
  sp1V6_1_0Groth16VerifierHash:
    "0x4388a21c687fdd5f218d7e3d13190cac4c5355818d3605fd5fb811df468ee696",
} as const;

export type ZkVmBackend = "risc0" | "sp1" | "openvm";

export interface ProofSystemSpec {
  id: Hex;
  label: string;
  displayName: string;
  backend: ZkVmBackend;
  wrapper: "Groth16" | "PLONK" | "Halo2";
  sdkRequirement: string;
  sealBytes: number;
}

/**
 * Exact `proofSystemId` constants (`keccak256(label)`) from `crates/zkminer-chain/src/auction.rs`
 * and `hemiprove-abi/INTERACTION_GUIDE.md` §3.
 */
export const PROOF_SYSTEMS: Record<string, ProofSystemSpec> = {
  RISC_ZERO_GROTH16_V1: {
    id: "0xf8fe527fde36a1f428dcd6b89b775a345a829f12ff8f54ba488149a8dc3960c5",
    label: "risczero.groth16.v1",
    displayName: "RISC Zero Groth16",
    backend: "risc0",
    wrapper: "Groth16",
    sdkRequirement: "risc0-zkvm 3.0.x (seal selector 0x73c457ba)",
    sealBytes: 260,
  },
  SP1_GROTH16_V1: {
    id: "0x023973b8ade217f37321f4b8d736956d5d075aee2500f6edd67d63f4ef51429d",
    label: "sp1.groth16.v1",
    displayName: "Succinct SP1 Groth16",
    backend: "sp1",
    wrapper: "Groth16",
    sdkRequirement: "SP1 SDK 6.1.0–6.10.0 (circuit v6.1.0)",
    sealBytes: 356,
  },
  SP1_PLONK_V1: {
    id: "0x1ea5c35f3bde6fda536b672488334cd2e98e3ff554f1835725ba35ce0cf3579f",
    label: "sp1.plonk.v1",
    displayName: "Succinct SP1 PLONK",
    backend: "sp1",
    wrapper: "PLONK",
    sdkRequirement: "SP1 SDK 6.1.0–6.10.0 (circuit v6.1.0)",
    sealBytes: 964,
  },
  OPENVM_HALO2_V1: {
    id: "0xc2f840cd747be40c46b043261812b681bb030ae49b44faf1249979380dca5155",
    label: "openvm.halo2.v1",
    displayName: "OpenVM Halo2",
    backend: "openvm",
    wrapper: "Halo2",
    sdkRequirement: "OpenVM v2.0.0–v2.0.2 (v2.0-base)",
    sealBytes: 1760,
  },
};

export function resolveProofSystemById(psId: string): ProofSystemSpec | null {
  const normalized = psId.toLowerCase();
  return (
    Object.values(PROOF_SYSTEMS).find((p) => p.id.toLowerCase() === normalized) ??
    null
  );
}

export function getDefaultProofSystemForBackend(backend: ZkVmBackend): ProofSystemSpec {
  switch (backend) {
    case "risc0":
      return PROOF_SYSTEMS.RISC_ZERO_GROTH16_V1;
    case "sp1":
      return PROOF_SYSTEMS.SP1_GROTH16_V1;
    case "openvm":
      return PROOF_SYSTEMS.OPENVM_HALO2_V1;
  }
}

/**
 * Exact Reverse Dutch Auction price calculation mirrored from
 * `crates/zkminer-chain/src/auction.rs` (`AuctionMath.computePrice`).
 * curveType: 0 = Linear, 1 = Quadratic
 */
export function computeEscalatingOffer(
  minPriceHemi: number,
  maxPriceHemi: number,
  rampUpPeriodSecs: number,
  elapsedSecs: number,
  curveType: 0 | 1 = 0
): number {
  if (minPriceHemi >= maxPriceHemi || rampUpPeriodSecs <= 0) {
    return maxPriceHemi;
  }
  if (elapsedSecs <= 0) return minPriceHemi;
  if (elapsedSecs >= rampUpPeriodSecs) return maxPriceHemi;

  const range = maxPriceHemi - minPriceHemi;
  const ratio = elapsedSecs / rampUpPeriodSecs;
  if (curveType === 1) {
    return minPriceHemi + range * ratio * ratio;
  }
  return minPriceHemi + range * ratio;
}
