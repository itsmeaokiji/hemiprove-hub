# DESIGN.md — HemiProve Hub Design System

**Aesthetic Paradigm:** Precision Hardware Datasheet & Telemetry Workbench  
**Design References:** Oxide Computer Console, Linear Data Views, Geekbench / Phoronix Pro

HemiProve Hub follows a high-density, low-chrome terminal layout built for protocol engineers, dApp requesters, and GPU operators. Every surface prioritizes numeric legibility, aligned comparisons, and zero-distraction inspection over decorative framing.

---

## 1. Color System & Tokens (Warm Matte Carbon)

| Token | Hex | Usage |
| :--- | :--- | :--- |
| **Canvas Background** | `#0B0B0A` | Root viewport canvas, recessed code and filter wells |
| **Primary Surface / Panel** | `#111110` | Primary workbench panels, headers, inspector rails |
| **Elevated / Active Row Hover** | `#181816` | Active navigation tab fill, selected/hovered table rows |
| **Structural Hairline Border** | `#232320` | `1px solid` exposed structural grid dividers |
| **Primary Ink** | `#EDEDEC` | Headings, primary numeric telemetry, active controls |
| **Secondary Ink** | `#9A9A94` | Body copy, secondary sub-metrics, inactive controls |
| **Muted Technical Labels** | `#63635E` | Indexed micro-headers (`01 // ...`), unit suffixes, column headers |
| **Primary Signal Accent** | `#FF5500` | Surgical use only: active `2px` tab bar, primary CTAs, selected row indicator, `zkOP/s` proportion fills |

### Hardware Vendor Technical Tags (`rounded-[2px]` Monospace Pills)

- **NVIDIA CUDA:** `text-[#10B981] border-[#10B981]/30 bg-[#10B981]/10`
- **AMD ROCm/HIP:** `text-[#F43F5E] border-[#F43F5E]/30 bg-[#F43F5E]/10`
- **Intel SYCL:** `text-[#38BDF8] border-[#38BDF8]/30 bg-[#38BDF8]/10`

### Border Radius Policy (`--radius: 2px`)

- **`0px` (`rounded-none`):** All layout containers, panels, tables, and grid cells.
- **Max `2px` (`rounded-[2px]`):** Inline technical badges, inputs, segmented hardware switches, and action buttons.

---

## 2. Typography & Numeric Discipline

- **UI Labels & Body Copy:** `Inter` (`@fontsource/inter`) with tight `-0.02em` letter-spacing (`cv02`, `cv03`, `cv04`, `cv11`).
- **Technical & Numeric Data:** `JetBrains Mono` (`@fontsource/jetbrains-mono`) with `font-mono tabular-nums` (`.data-num`) on all metrics — including `zkOP/s` scores, cycle counts, HEMI/USD quotes, block heights, contract/wallet addresses, GPU architecture codes (`sm_89`, `sm_120`, `gfx1201`, `gfx1100`, `bmg_g21`, `acm_g10`), and status tags.
- **Section & Cell Micro-Headers (`.micro-header`):** `text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]` paired with numeric index prefixes (`01 // NETWORK THROUGHPUT`, `02 // PROOF DIVERSITY`).

---

## 3. Global Shell & Master-Detail Workbenches

1. **Top Protocol Telemetry Bar:** Live RPC status dot, active chain (`HEMI MAINNET [43111]` / `HEMI SEPOLIA [743111]`), copyable `HemiProve` router address, `zkOP` baseline reference, verifier status indicators (`RISC0`, `SP1`, `OPENVM`), and head block / `/api/marketplace` round-trip latency telemetry (`API <ms>ms`).
2. **Main Workbench Header:** Wordmark `HEMIPROVE // HUB` with subtle `COMMUNITY` badge (`xl+`) and non-affiliation tooltip, flush vertical-divider tabs (`[01] MARKETPLACE`, `[02] GPU BENCHMARKS`, `[03] SIMULATE STUDIO`) with `#FF5500` `2px` bottom active indicator, plus physical-style `SEPOLIA 743111` / `MAINNET 43111` and `DATA: LIVE / DEMO` segmented switches.
3. **Workflow Guide Strip, Field Reference & Persistent Footer:** Dismissible quickstart navigation strip, always-available `GUIDE [?]` toggle revealing a 3-column Field Reference grid, and a global footer carrying the `UNOFFICIAL COMMUNITY WORKBENCH` status tag alongside pinned stack specs (`STACK: ZKMARKET@C8333AA`) and explorer links.
4. **Master-Detail Split Views:**
   - `/`: `4`-cell flush KPI strip + `8 / 4` split auction table & docked Job Telemetry Inspector (auction escalation curve, verification breakdown, settlement duration, explorer links, and `/simulate` deep-link).
   - `/benchmarks`: Hardware vendor filter strip + `8 / 4` split GPU datasheet table (inline `#FF5500` `zkOP/s` proportion bars) & dual-mode control rail (`01 // ROI CALCULATOR` | `02 // SUBMIT CLI OUTPUT`).
   - `/simulate`: `5 / 7` split console (`01 // LOAD PRESET WORKLOAD`, `02 // ELF BINARY & EXECUTION PARAMETERS`) & diagnostic output (`3`-cell cycle/segment/ETH strip, `03 // KECCAK CHARGES & EVIDENCE`, `04 // RISC0-PUBLIC-V3 7-SEGMENT AUDIT MATRIX`, `05 // ARTIFACT & CONTRACT GENERATOR`).

---

## 4. Layout & Styling Constraints (Anti-Patterns)

To preserve datasheet clarity across contributions, avoid the following patterns:

- **Floating Rounded Card Grids:** Avoid `rounded-xl`, `rounded-2xl`, `shadow-lg`, or `gap-6` detached cards. Keep major layout sections inside flush, connected `1px solid #232320` hairline grids (`divide-x`, `divide-y`, `border-[#232320]`, `rounded-none`).
- **Icon Toppers on Metrics:** Do not place decorative Lucide icons inside tinted rounded boxes (`w-10 h-10 rounded-lg bg-orange-500/10`) above KPI values or headings; use numbered monospace micro-headers (`01 // ...`, `02 // ...`) instead.
- **Marketing Hero Banners:** Do not add centered landing heroes, promotional slogans, or glowing hero pills; every route opens directly into its working telemetry workbench.
- **Decorative Visual Effects:** Avoid `backdrop-blur`, glassmorphism, gradient text, radial glow backgrounds, and thick `border-l-4` callout banners.
- **Untinted Blacks or Cool Slate Grays:** Avoid `#000000`, `bg-slate-900`, or `bg-gray-900`; use the Warm Matte Carbon palette tokens exclusively.
- **Modal Popups for Row Inspection:** Use docked master-detail split rails (`border-l border-[#232320]` / `divide-x divide-[#232320]`) rather than centered modal dialogs so engineers can compare rows and inspect telemetry side-by-side.
