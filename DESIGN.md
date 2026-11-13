# DESIGN.md — HemiProve Hub Design System

**Aesthetic Paradigm:** Precision Hardware Datasheet & Telemetry Workbench  
**Design References:** Oxide Computer Console, Linear Data Views, Geekbench / Phoronix Pro  

---

## 1. Strictly Banned Patterns ("NEVER DO THIS")

1. **NO Floating Rounded Cards:** Never use `rounded-xl`, `rounded-2xl`, `shadow-lg`, or `gap-6` card grids. All major layout sections MUST sit inside a flush, connected `1px solid #232320` structural hairline grid (`divide-x`, `divide-y`, `border-[#232320]`, `rounded-none`).
2. **NO "Icon Toppers":** Never place decorative Lucide icons inside colored rounded squares (`w-10 h-10 rounded-lg bg-orange-500/10`) above KPI numbers or section titles. Use numbered monospace technical indices (`01 // THROUGHPUT`, `02 // PROOF DIVERSITY`).
3. **NO Marketing Hero Banners:** Never render a centered hero section, marketing slogan, or glowing pill badge ("Live on Hemi"). Open directly into the functional telemetry workbench.
4. **NO Decorative Stacking:** Zero `backdrop-blur`, zero glassmorphism, zero gradient text, zero floating radial background glow orbs, and zero `border-l-4` colored callout boxes.
5. **NO Untinted Pure Black or Blue-Slate Grays:** Never use `#000000` or Tailwind's default `bg-slate-900` / `bg-gray-900`. Use the Warm Matte Carbon palette exclusively.
6. **NO Centered Popup Modals for Row Inspection:** Use docked Master-Detail split panels (`border-l border-[#232320]` / `divide-x divide-[#232320]`) so clicking a job or GPU row inspects it in a side panel without leaving the table.

---

## 2. Exact Color System & Tokens (Warm Matte Carbon Palette)

| Token | Hex | Usage |
| :--- | :--- | :--- |
| **Canvas Background** | `#0B0B0A` | Root viewport canvas, recessed code & filter wells |
| **Primary Surface / Panel** | `#111110` | Primary workbench panels, headers, inspector rails |
| **Elevated / Active Row Hover** | `#181816` | Active navigation tab fill, selected/hovered table rows |
| **Structural Hairline Border** | `#232320` | `1px solid` exposed structural grid dividers |
| **Primary Ink** | `#EDEDEC` | Headings, primary numeric telemetry, active controls |
| **Secondary Ink** | `#9A9A94` | Body copy, secondary sub-metrics, inactive controls |
| **Muted Technical Labels** | `#63635E` | Indexed micro-headers (`01 // ...`), unit suffixes, column headers |
| **Primary Signal Accent** | `#FF5500` | Surgical use ONLY: active `2px` tab bar, primary CTA buttons, selected row `2px` left bar, primary `zkOP/s` bar fills |

### Hardware Vendor Technical Tags (`rounded-[2px]` Monospace Pills)
- **NVIDIA CUDA:** `text-[#10B981] border-[#10B981]/30 bg-[#10B981]/10`
- **AMD ROCm/HIP:** `text-[#F43F5E] border-[#F43F5E]/30 bg-[#F43F5E]/10`
- **Intel SYCL:** `text-[#38BDF8] border-[#38BDF8]/30 bg-[#38BDF8]/10`

### Border Radius Policy
- `0px` (`rounded-none`) for all layout containers, panels, tables, and grid cells.
- Maximum `2px` (`rounded-[2px]`) for inline technical badges, inputs, segmented switches, and buttons.

---

## 3. Typography & Numeric Discipline

- **UI Labels & Copy:** `Inter` / `Geist` with tight `-0.02em` letter-spacing.
- **Technical & Numeric Data:** `JetBrains Mono` with mandatory `font-mono tabular-nums` on every number, `zkOP/s` score, cycle count, price, block height, contract/wallet address, GPU architecture code (`sm_89`, `sm_120`, `gfx1201`, `gfx1100`, `bmg_g21`, `acm_g10`), and status tag.
- **Section & Cell Micro-Headers:** `text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]` with numeric index prefix (`01 // NETWORK THROUGHPUT`).

---

## 4. Global Shell & Split Workbench Architecture

1. **Top Protocol Telemetry Bar (`h-8`):** Live chain status dot, active chain (`HEMI MAINNET [43111]` / `HEMI SEPOLIA [743111]`), copyable `HemiProve` router address, `zkOP` baseline formula, verifier adapter status tags (`RISC0`, `SP1`, `OPENVM`), and block/API latency telemetry (`API <ms>ms`).
2. **Main Workbench Header (`h-12`):** Wordmark `HEMIPROVE // HUB` + flush vertical-divider tabs (`[01] MARKETPLACE`, `[02] GPU BENCHMARKS`, `[03] SIMULATE STUDIO`) with `#FF5500` `2px` active bottom indicator + physical-style `MAINNET 43111` / `SEPOLIA 743111` and `DATA: LIVE / DEMO` hardware switches.
3. **Master-Detail Workbenches:**
   - `/` — 4-Cell Flush Metric Strip + `8 / 4` Split Auction Table & Docked Job Telemetry Inspector.
   - `/benchmarks` — Hardware Filter Strip + `8 / 4` Split GPU Datasheet Table (with inline `#FF5500` `zkOP/s` proportion bars) & Dual-Mode Control Rail (`01 // ROI CALCULATOR` | `02 // SUBMIT CLI OUTPUT`).
   - `/simulate` — `5 / 7` Compiler Split Console (`01 // LOAD PRESET WORKLOAD`, `02 // ELF BINARY & EXECUTION PARAMETERS`) & Diagnostic Output (`3-Cell Strip`, `03 // KECCAK CHARGES & EVIDENCE`, `04 // RISC0-PUBLIC-V3 7-SEGMENT AUDIT MATRIX`, `05 // ARTIFACT & CONTRACT GENERATOR`).
