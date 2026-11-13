# HemiProve Hub

[![License: MIT](https://img.shields.io/badge/License-MIT-FF5500.svg)](./LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.5_(App_Router)-111110.svg)](https://nextjs.org/)
[![TypeScript 5.8](https://img.shields.io/badge/TypeScript-5.8_Strict-111110.svg)](https://www.typescriptlang.org/)
[![Hemi Sepolia 743111](https://img.shields.io/badge/Hemi_Sepolia-743111_Live-10B981.svg)](https://testnet.explorer.hemi.xyz/address/0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e)

**HemiProve Hub** is an open-source ecosystem telemetry explorer, multi-vendor GPU `zkOP/s` benchmark datasheet, and browser-based `zkminer simulate` sizing studio built for **hemiProve** — Hemi Network's decentralized, prover-agnostic ZK proving marketplace.

Built directly against the ground-truth ABIs, deployment pins, and Protocol 12 sizing rules in [`hemilabs/zk-miner`](https://github.com/hemilabs/zk-miner), HemiProve Hub gives **protocol engineers**, **dApp requesters**, and **community GPU miners** a unified workbench to inspect live auctions, compare hardware efficiency across NVIDIA/AMD/Intel stacks, and audit guest ELF workloads before posting or claiming on-chain jobs.

---

## Core Workbench Modules

### `[01]` Marketplace & Escalating Auction Explorer (`/`)
- **Dual-Chain Switching (`743111` & `43111`):** Defaults to the live **Hemi Sepolia (`743111`)** audited rehearsal deployment (`zkmarket@c8333aa`) and supports seamless switching to **Hemi Mainnet (`43111`)** (`STAGED` until router cutover, without leaking testnet addresses).
- **Strict `DATA: LIVE` vs `DEMO` Isolation (Defaults to `DEMO` Showcase Stream):**
  - `DATA: LIVE` queries `HemiProveRouter` (`jobIndex`, `paused`, `totalPaidToProvers`, `getJobStatusView`), scans recent RPC blocks, backfills historical `JobSubmitted` logs from **Blockscout v2** (scanning past cancelled rehearsal jobs), and enriches metadata via `ProgramRegistry` (`getProgram`, `getStorageURIs`) with a 15s server cache — never mixing synthetic rows into live telemetry.
  - `DATA: DEMO` (enabled by default on initial boot and persisted in `localStorage`) streams Reverse Dutch Auction ramps across BTC Tunnel, DeFi TWAP, and 2-of-3 multi-proof bundles with KPIs reconciled to the displayed dataset.
- **Docked Job Telemetry Inspector:** Inspects Reverse Dutch Auction price escalation (`Linear` / `Quadratic`), requester type (`EOA` vs `Smart Contract` via `eth_getCode`), ELF storage origin (`Arweave`, `IPFS`, `GitHub Release`), pre-claim guard status, and links 1:1 into `/simulate` (`AUDIT IN SIMULATE STUDIO ->`).

### `[02]` Multi-Vendor GPU `zkOP/s` Leaderboard & Miner ROI Studio (`/benchmarks`)
- **Cross-Vendor Hardware Datasheet:** Pre-seeded with 13 hardware baselines (`src/data/seed-benchmarks.json`) calibrated against `zk-miner` (`max/windows-gpu` commit `101edae` & `a12ce82`) across:
  - **NVIDIA (`CUDA 12.8 / 12.9` + `NVML`):** RTX 4090 (`sm_89`), RTX 5080 (`sm_120`), RTX 5060 Ti (`sm_120`), RTX 4070 (`sm_89`, `po2=19`, Windows NVML PCIe link).
  - **AMD Radeon (`ROCm 10.1 / Adrenalin HIP + ADLX amdadlx64.dll`):** RX 9070 XT (`gfx1201` on Linux & Windows 11), RX 7900 XTX (`gfx1100`), RX 9060 XT (`gfx1200`, `PCIe Gen5 x8`).
  - **Intel Arc (`oneAPI SYCL 2026.0 + IGCL ControlLib.dll`):** Arc Pro B70 (`bmg_g31` 32GB, `PCIe Gen5 x8`), Arc B580 (`bmg_g21`, `po2=19`), Arc A770 16GB (`acm_g10`).
- **Protocol 12 Self-Scored `zkOP/s` & 5-Program Suite:** Implements `zkminer`'s miner-driven `measure_zkop_mix` scoring (`1 zkOP = 1 SP1 cycle` on the `50,007,139`-cycle `zkop-mix` guest at `3,202` iterations; 1 warm-up at 200 iterations + median of up to 3 runs inside a 60s budget) alongside the 5 canonical suite programs (`sha256-chain` 20%, `ecdsa-verify` 25%, `bigint-mul` 20%, `memory-merkle` 15%, `chacha-mix` 20% — with `fibonacci` dropped so per-proof overhead and SP1 cycle skew never distort cycle-weighted `stark_rate`), Groth16 wrap latencies, and Windows native driver telemetry (`IGCL` / `ADLX` / `NVML` negotiated slot PCIe link).
- **Miner ROI & Power Calculator:** Live CoinGecko `HEMI/USD` spot price integration (`60s` server cache + custom "what-if" override), modeling multi-card rig `MzkOP/s`, network share, `85%` proving duty-cycle power draw + `65W` host overhead, daily/monthly net USD profit, and hardware capex break-even days.
- **Zero-Friction Community Submissions:** Validates and ingests both raw `zkminer benchmark` CLI stdout tables (including `Proving stages` sub-tables and blended dual-zkVM `MzkOP/s` output from `max/splash-progress-bars`) and `zkminer benchmark --json` (`BenchmarkSuite` + `program_stages`) payloads with deterministic deduplicated IDs.

### `[03]` `zkminer simulate` Job Sizing & `risc0-public-v3` Studio (`/simulate`)
- **Serverless Preview vs Local CLI Disclosure:** Explicitly distinguishes serverless deterministic sizing (`ENGINE: DETERMINISTIC MODEL (PREVIEW)`) from local binary execution (`ZKMINER_BIN` + 32-byte `jobId`).
- **Full Cycle Accounting Breakdown:** Separates raw RISC-V guest instructions (`guestCycles`), power-of-two segment padding (`paddingCycles`), and Keccak coprocessor charges (`keccakRequests * 1,048,576` cycles) into `report.cycles` (`TOTAL CHARGED CYCLES`).
- **Protocol 12 (`risc0-public-v3`) 7-Segment Audit Matrix:** Evaluates RISC Zero workloads across all 7 valid segment sizes (`po2 = 16..22`, `65,536` to `4,194,304` cycles/segment) against the default miner `po2 = 20` baseline to catch `sizeCheck: differs` cycle/journal inflation attacks and `SYS_RANDOM` host-entropy reads before a prover stakes collateral.
- **VRAM Tier & Auction Pricing Recommendations:** Maps workloads to 16 GiB consumer vs. 24 GiB+ flagship VRAM tiers (accounting for RISC Zero's `14 GiB` gate / `20 GiB` resident Groth16 SRS rule and SP1's `134M` / `268M` element thresholds on `main`, while tracking pending `PR #33` 12 GiB tiers).
- **1-Click Contract & SDK Codegen:** Generates **Solidity `^0.8.24` (`IHemiProveCallback` + `IHemiProveRouter.submitJob`, `onlyOwner` + `transferFrom` escrow + `withdrawEscrow`)** starter contracts and standalone **TypeScript (`viem`)** submitter scripts using exact `hemiprove-abi` v2 tuples, OpenVM commitment verification, staged Mainnet safeguards, and domain-separated `HemiProve.JournalPredicate.v1` commitments.

---

## Network & Deployed Contract Matrix

Source of truth: [`hemilabs/zk-miner`](https://github.com/hemilabs/zk-miner) (`crates/zkminer-chain/src/deployment.rs` & `hemiprove-abi/INTERACTION_GUIDE.md`, `zkmarket@c8333aa`).

### 1. Hemi Sepolia Testnet (`Chain ID: 743111` — Active Rehearsal)

| Component | Address / Endpoint | Notes |
| :--- | :--- | :--- |
| **RPC Endpoint** | `https://testnet.rpc.hemi.network/rpc` | Public JSON-RPC |
| **Blockscout Explorer & API** | `https://testnet.explorer.hemi.xyz` (`/api/v2`) | Historical log indexing + tx links |
| **`HemiProveRouter` (Proxy)** | [`0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e`](https://testnet.explorer.hemi.xyz/address/0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e) | 5-facet diamond-lite router (`scanFromBlock: 7,095,745`) |
| **`HemiProveStaking` (Proxy)** | [`0x44b2DDCfBe37900917E3750A4996BA007F4aA66E`](https://testnet.explorer.hemi.xyz/address/0x44b2DDCfBe37900917E3750A4996BA007F4aA66E) | Prover stake, collateral locks & slashing |
| **`HemiProveRegistry` (Proxy)** | [`0x77fDb1DCE2224B75BA295f2Cdd87Ba5247d4BBc6`](https://testnet.explorer.hemi.xyz/address/0x77fDb1DCE2224B75BA295f2Cdd87Ba5247d4BBc6) | Registered `proofSystemId` verifier adapters |
| **`ProgramRegistry` (Proxy)** | [`0xCC761A929747A81e34517e1f4F98247da925cAb4`](https://testnet.explorer.hemi.xyz/address/0xCC761A929747A81e34517e1f4F98247da925cAb4) | On-chain ELF storage URIs (`IPFS`, `Arweave`, `HTTP`) |
| **`tHEMI` ERC-20 Token** | [`0x46955EdCF61b23a8c0b0d71428A9F1C07Bbf36cc`](https://testnet.explorer.hemi.xyz/address/0x46955EdCF61b23a8c0b0d71428A9F1C07Bbf36cc) | 18-decimal escrow & prover payout token |

### 2. Hemi Mainnet (`Chain ID: 43111` — Staged Pre-Deployment)

| Component | Address / Endpoint | Status |
| :--- | :--- | :--- |
| **RPC Endpoint** | `https://rpc.hemi.network/rpc` | Live |
| **Blockscout Explorer & API** | `https://explorer.hemi.xyz` (`/api/v2`) | Live |
| **`HEMI` ERC-20 Token** | [`0x99e3dE3817F6081B2568208337ef83295b7f591D`](https://explorer.hemi.xyz/address/0x99e3dE3817F6081B2568208337ef83295b7f591D) | Live |
| **`HemiProveRouter`** | Configurable via `NEXT_PUBLIC_MAINNET_HEMIPROVE_ROUTER` | `STAGED (PRE-DEPLOYMENT)` |

### 3. Registered Proof Systems (`proofSystemId = keccak256(label)`)

| Constant | Label | `proofSystemId` (`bytes32`) | Seal Size | Availability |
| :--- | :--- | :--- | :---: | :--- |
| `RISC_ZERO_GROTH16_V1` | `risczero.groth16.v1` | `0xf8fe527fde36a1f428dcd6b89b775a345a829f12ff8f54ba488149a8dc3960c5` | `260 B` | `743111` Active / `43111` Staged |
| `SP1_GROTH16_V1` | `sp1.groth16.v1` | `0x023973b8ade217f37321f4b8d736956d5d075aee2500f6edd67d63f4ef51429d` | `356 B` | `743111` Active / `43111` Staged |
| `SP1_PLONK_V1` | `sp1.plonk.v1` | `0x1ea5c35f3bde6fda536b672488334cd2e98e3ff554f1835725ba35ce0cf3579f` | `964 B` | `743111` Active / `43111` Staged |
| `OPENVM_HALO2_V1` | `openvm.halo2.v1` | `0xc2f840cd747be40c46b043261812b681bb030ae49b44faf1249979380dca5155` | `1,760 B` | `743111`-Only at Launch |

---

## Local Setup & Development

### Prerequisites
- **Node.js** `>= 20.0.0` (tested on Node `v22` and `v24`)
- **pnpm** (recommended, lockfile included) or **npm**
- *(Optional)* [`zkminer`](https://github.com/hemilabs/zk-miner) binary on `PATH` (or set `ZKMINER_BIN` in `.env.local`) if you wish `/api/simulate` to invoke local `zkminer simulate <jobId>` subprocesses alongside the built-in deterministic analyzer.

### 1. Install Dependencies

```bash
git clone https://github.com/itsmeaokiji/hemiprove-hub.git
cd hemiprove-hub
pnpm install
```

### 2. Environment Configuration *(Optional — Zero-Config Ready)*

HemiProve Hub connects to Hemi Sepolia (`743111`) and Hemi Mainnet (`43111`) out of the box with no API keys required. To configure optional overrides (such as `ZKMINER_BIN` or Mainnet contract cutover addresses):

```bash
cp .env.example .env.local
```

See [`.env.example`](./.env.example) for full documentation of every supported variable.

### 3. Run Development Server

```bash
pnpm dev
# or: npm run dev
```

Open **http://localhost:3000** in your browser.

### 4. Type-Check & Production Build

```bash
pnpm lint     # Runs `tsc --noEmit` strict type verification
pnpm test     # Runs unit tests for math, parser, codegen, and KPIs
pnpm build    # Compiles optimized Next.js production bundle
pnpm start    # Serves production build on port 3000
```

---

## Community GPU Miner Workflow

1. Run the official [`zk-miner`](https://github.com/hemilabs/zk-miner) benchmark suite on your worker:
   ```bash
   # Either human-readable table stdout or structured JSON output works:
   zkminer benchmark
   # or
   zkminer benchmark --json > my-gpu-report.json
   ```
   *(Tip: On 12 GiB VRAM GPUs such as RTX 4070 or Arc B580 that sit below the default 14 GiB gate, run `zkminer benchmark --calibrate` to profile `po2=19`.)*
2. Open **`/benchmarks`** in HemiProve Hub and click **`+ SUBMIT ZKMINER BENCHMARK`** (or switch the right control rail to `02 // SUBMIT CLI OUTPUT`).
3. Paste your raw CLI stdout or JSON output — the parser automatically extracts `zkOP/s`, STARK cycle rate, `po2`, Groth16 wrap latency, TDP wattage, and workload timings, adding your card directly to the datasheet and ROI calculator.

---

## Documentation & References

- **[`ARCHITECTURE.md`](./ARCHITECTURE.md):** Deep-dive engineering reference covering system topology, on-chain discovery pipeline, Reverse Dutch Auction pricing math, `zkOP/s` normalization, Miner ROI equations, and `risc0-public-v3` (Protocol 12) 7-segment simulation math.
- **[`DESIGN.md`](./DESIGN.md):** "Precision Hardware Datasheet & Telemetry Workbench" UI/UX specification (Warm Matte Carbon token palette, `tabular-nums` discipline, structural hairline grids).
- **[`hemilabs/zk-miner`](https://github.com/hemilabs/zk-miner):** Official Hemi Labs Rust prover daemon, CLI, and `hemiprove-abi` reference repository.

---

## License

Released under the [MIT License](./LICENSE).
