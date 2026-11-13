# HemiProve Hub

[![Live Demo](https://img.shields.io/badge/Live_Demo-hemiprove--hub.vercel.app-FF5500.svg)](https://hemiprove-hub.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-181816.svg)](./LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.5_(App_Router)-111110.svg)](https://nextjs.org/)
[![TypeScript 5.8](https://img.shields.io/badge/TypeScript-5.8_Strict-111110.svg)](https://www.typescriptlang.org/)
[![Hemi Sepolia 743111](https://img.shields.io/badge/Hemi_Sepolia-743111_Live-10B981.svg)](https://testnet.explorer.hemi.xyz/address/0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e)

**HemiProve Hub** is an **independent, unofficial open-source community workbench** — featuring a telemetry explorer, multi-vendor GPU `zkOP/s` benchmark datasheet, and pre-flight job sizing studio for **hemiProve** (Hemi Network's decentralized, prover-agnostic ZK proving marketplace).

Built directly against the ABIs, deployment pins (`zkmarket@c8333aa`), and Protocol 12 sizing rules in [`hemilabs/zk-miner`](https://github.com/hemilabs/zk-miner), it gives **protocol engineers**, **dApp requesters**, and **GPU miners** a unified workbench to inspect auctions, compare NVIDIA/AMD/Intel hardware efficiency, and model guest ELF workloads before posting or claiming on-chain jobs.

> **Independent Community Tool:** This project is third-party open-source software built for the Hemi ecosystem and is **not** affiliated with, endorsed by, or maintained by Hemi Labs. Official protocol source code, CLI binaries, and prover daemons live at [`hemilabs/zk-miner`](https://github.com/hemilabs/zk-miner).

**[Launch Live Workbench ->](https://hemiprove-hub.vercel.app)** · **[Architecture & Math Spec ->](./ARCHITECTURE.md)** · **[Design System ->](./DESIGN.md)**

---

## Core Workbench Modules

### `[01]` Marketplace & Escalating Auction Explorer (`/`)
- **Dual-Chain Switching (`743111` & `43111`):** Connects out of the box to live **Hemi Sepolia (`743111`)** proxies and keeps **Hemi Mainnet (`43111`)** cleanly isolated as `STAGED` until router deployment.
- **Strict `DATA: LIVE` vs. `DEMO` Isolation:** Defaults to `DEMO` showcase streams on boot (`localStorage`-persisted); toggling `DATA: LIVE` indexes `HemiProveRouter` (`JobSubmitted`, `JobClaimed`, `JobFulfilled`), `ProgramRegistry`, and Blockscout v2 logs (`15s` cache) to compute real-time settlement latency and verified cycles without mixing synthetic rows.
- **Docked Job Telemetry Inspector:** Visualizes Linear/Quadratic Reverse Dutch Auction escalation, EOA vs. Smart Contract callers, ELF storage origins (`Arweave`, `IPFS`, `HTTP`), and deep-links into `/simulate`.

### `[02]` Multi-Vendor GPU `zkOP/s` Leaderboard & ROI Studio (`/benchmarks`)
- **13 Calibrated Hardware Baselines:** Compares NVIDIA (`CUDA` / `NVML`), AMD (`ROCm / HIP` / `ADLX`), and Intel (`oneAPI SYCL` / `IGCL`) GPUs in [`seed-benchmarks.json`](./src/data/seed-benchmarks.json).
- **Protocol 12 Scoring & ROI Calculator:** Ranks `zkOP/s` throughput, `5`-program suite timings, and Groth16 wrap latencies while modeling multi-card `MzkOP/s`, live CoinGecko `HEMI/USD` revenue (`60s` cache), power draw, and break-even days.
- **CLI & JSON Ingestion:** Parses raw `zkminer benchmark` CLI tables (including blended dual-zkVM `MzkOP/s` output) and `--json` reports with deterministic deduplicated IDs.

### `[03]` Pre-Flight Sizing & Codegen Studio (`/simulate`)
- **Transparent Execution Engine:** Clearly labels serverless deterministic sizing (`ENGINE: DETERMINISTIC MODEL (PREVIEW)`) vs. local `ZKMINER_BIN` CLI execution (`zkminer simulate <jobId>`).
- **Cycle Accounting & 7-Segment Matrix:** Breaks down guest cycles, power-of-two segment padding, and Keccak charges, evaluating `po2 = 16..22` determinism against the `po2 = 20` baseline (`sizeCheck`, `SYS_RANDOM`).
- **Starter Contract & SDK Export:** Generates hardened `Solidity ^0.8.24` contracts (`onlyOwner`, `transferFrom` escrow, OpenVM/Mainnet guards) and standalone `viem` submitter scripts. *(See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for all protocol formulas.)*

---

## Network & Contract Matrix

Source of truth: [`hemilabs/zk-miner`](https://github.com/hemilabs/zk-miner) (`crates/zkminer-chain/src/deployment.rs`, `zkmarket@c8333aa`).

### Hemi Sepolia Testnet (`Chain ID: 743111` — Active Rehearsal)

| Component | Address / Endpoint | Notes |
| :--- | :--- | :--- |
| **RPC & Blockscout v2** | `testnet.rpc.hemi.network/rpc` | Public JSON-RPC & `/api/v2` log indexing |
| **`HemiProveRouter`** | [`0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e`](https://testnet.explorer.hemi.xyz/address/0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e) | 5-facet proxy (`scanFromBlock: 7,095,745`) |
| **`HemiProveStaking`** | [`0x44b2DDCfBe37900917E3750A4996BA007F4aA66E`](https://testnet.explorer.hemi.xyz/address/0x44b2DDCfBe37900917E3750A4996BA007F4aA66E) | Prover stake, collateral locks & slashing |
| **`HemiProveRegistry`** | [`0x77fDb1DCE2224B75BA295f2Cdd87Ba5247d4BBc6`](https://testnet.explorer.hemi.xyz/address/0x77fDb1DCE2224B75BA295f2Cdd87Ba5247d4BBc6) | Registered `proofSystemId` verifiers |
| **`ProgramRegistry`** | [`0xCC761A929747A81e34517e1f4F98247da925cAb4`](https://testnet.explorer.hemi.xyz/address/0xCC761A929747A81e34517e1f4F98247da925cAb4) | On-chain ELF URIs (`IPFS`, `Arweave`, `HTTP`) |
| **`tHEMI` ERC-20 Token** | [`0x46955EdCF61b23a8c0b0d71428A9F1C07Bbf36cc`](https://testnet.explorer.hemi.xyz/address/0x46955EdCF61b23a8c0b0d71428A9F1C07Bbf36cc) | 18-decimal escrow & prover payout token |

### Hemi Mainnet (`Chain ID: 43111` — Staged Pre-Deployment)

| Component | Address / Endpoint | Status |
| :--- | :--- | :---: |
| **RPC & Blockscout v2** | `rpc.hemi.network/rpc` · [`explorer.hemi.xyz`](https://explorer.hemi.xyz) | `Live` |
| **`HEMI` ERC-20 Token** | [`0x99e3dE3817F6081B2568208337ef83295b7f591D`](https://explorer.hemi.xyz/address/0x99e3dE3817F6081B2568208337ef83295b7f591D) | `Live` |
| **`HemiProveRouter`** | Set via `NEXT_PUBLIC_MAINNET_HEMIPROVE_ROUTER` | `STAGED` |

<details>
<summary><strong>Registered Proof Systems (<code>proofSystemId = keccak256(label)</code>)</strong></summary>

| Constant | Label | `proofSystemId` (`bytes32`) | Seal | Availability |
| :--- | :--- | :--- | :---: | :--- |
| `RISC_ZERO_GROTH16_V1` | `risczero.groth16.v1` | `0xf8fe527fde36a1f428dcd6b89b775a345a829f12ff8f54ba488149a8dc3960c5` | `260 B` | `743111` Active / `43111` Staged |
| `SP1_GROTH16_V1` | `sp1.groth16.v1` | `0x023973b8ade217f37321f4b8d736956d5d075aee2500f6edd67d63f4ef51429d` | `356 B` | `743111` Active / `43111` Staged |
| `SP1_PLONK_V1` | `sp1.plonk.v1` | `0x1ea5c35f3bde6fda536b672488334cd2e98e3ff554f1835725ba35ce0cf3579f` | `964 B` | `743111` Active / `43111` Staged |
| `OPENVM_HALO2_V1` | `openvm.halo2.v1` | `0xc2f840cd747be40c46b043261812b681bb030ae49b44faf1249979380dca5155` | `1,760 B` | `743111`-Only at Launch |

</details>

---

## Quickstart & Development

**Prerequisites:** **Node.js `>= 20.0.0`** (`>= 22.18` or `24` for `pnpm test`), **pnpm** (lockfile included), and optionally [`zkminer`](https://github.com/hemilabs/zk-miner) (`ZKMINER_BIN`) for local `/api/simulate` subprocess execution. Connects zero-config out of the box; copy [`.env.example`](./.env.example) to `.env.local` only for optional overrides.

```bash
git clone https://github.com/itsmeaokiji/hemiprove-hub.git
cd hemiprove-hub
pnpm install
pnpm dev      # Open http://localhost:3000
```

**Verification & Build Commands:**

```bash
pnpm typecheck # Strict `tsc --noEmit` type verification
pnpm lint      # Next.js ESLint checks
pnpm test      # Unit & offline-mocked API route tests
pnpm build     # Optimized Next.js production build
pnpm start     # Serve production build on port 3000
```

---

## Community GPU Miner Workflow

1. Run [`zk-miner`](https://github.com/hemilabs/zk-miner) on your rig (`zkminer benchmark`, `zkminer benchmark --json > report.json`, or `zkminer benchmark --calibrate` on `12 GiB` GPUs).
2. Open **`/benchmarks` -> `+ SUBMIT ZKMINER BENCHMARK`** and paste your CLI stdout or JSON output.
3. The parser automatically extracts `zkOP/s`, STARK rate, `po2`, wrap latency, and TDP watts into the leaderboard and ROI calculator.

---

## Scope & Serverless Prototype Notes

- **Stateless Community Benchmark Store:** `/benchmarks` validates submissions server-side (up to `100,000` characters per payload with `id`-based deduplication) and keeps new entries in serverless process memory plus browser `localStorage` — there is no external database, authentication, or per-IP rate limiter yet.
- **Serverless Deterministic Preview:** When deployed on serverless hosts without `ZKMINER_BIN` (such as Vercel), `/simulate` runs deterministic Protocol 12 modeling (`ENGINE: DETERMINISTIC MODEL (PREVIEW)`) rather than fetching or executing raw ELF binaries.
- **Read-Only Chain Client & Codegen:** HemiProve Hub never asks for private keys or executes wallet transactions in the browser; exported Solidity and `viem` artifacts are reviewed and run locally by the user. Automated GitHub Actions CI runs `typecheck`, `lint`, `test`, and `build` checks.

---

## Roadmap & Milestones

| Milestone | Summary | Status / Trigger |
| :--- | :--- | :---: |
| **M1: Core Workbench & Sepolia Parity** | Live Hemi Sepolia (`743111`) Explorer, `13`-GPU `zkOP/s` Leaderboard & ROI Studio, pre-flight sizing & hardened contract/SDK export, and unit tests. | `Shipped` |
| **M2: Explorer Depth & CI Hardening** | Real-time settlement duration and verified cycle tracking from on-chain events, expanded router ABI support, ESLint + API route tests, and automated CI checks. | `Shipped` |
| **M3: `zk-miner` Sync & Persistent Benchmarks** | Sync updated SP1 VRAM tiers (`PR #33`) and blended dual-zkVM `MzkOP/s` ranking once merged upstream, plus persistent database storage and rate limits for `/benchmarks`. | `Upstream & DB` |
| **M4: Mainnet (`43111`) & Execution Extensions** | Activate Hemi Mainnet support upon official router launch, plus optional browser wallet job submission and remote `zkminer` worker execution. | `Post-Mainnet` |

---

## Documentation & References

- **[`ARCHITECTURE.md`](./ARCHITECTURE.md):** System topology, on-chain discovery pipeline, AuctionMath, `zkOP/s` normalization, ROI equations, and Protocol 12 (`risc0-public-v3`) math.
- **[`DESIGN.md`](./DESIGN.md):** "Precision Hardware Datasheet & Telemetry Workbench" UI/UX system specification.
- **[`hemilabs/zk-miner`](https://github.com/hemilabs/zk-miner):** Official Hemi Labs prover daemon, CLI, and `hemiprove-abi` source repository.

---

## License

Released under the [MIT License](./LICENSE).
