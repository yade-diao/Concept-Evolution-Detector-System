# Concept Evolution Detector (CED-FS)

[![CI](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/ci.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/ci.yml)
[![frontend](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/frontend.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/frontend.yml)
[![backend](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/backend.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/backend.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Detects how groups appear, split, merge and disappear in a **feature stream** —
a fixed set of objects whose measurements arrive over time — and turns that
into a monitor for **fleets of machines**: which units left their peers, when,
and through which variables, with no fault-free history and no labels.

**→ [evolve.daokui.fr](https://evolve.daokui.fr)**
— "Continue as guest" needs no account. Everything is computed in your browser.

![The Fleets page on a Tennessee Eastman fleet: no unit flagged before the
fault, the twenty faulty runs leaving together at 8:00, and the variable they
left through](docs/fleets.png)

## What it does on industrial fleets

A fleet of like units observed together is exactly the method's setting: the
units are the samples, which stay; the measurements are the features, which
arrive. Three fleets, two simulated and one real, each against the monitor
its field would normally use:

| fleet | question | this project | reference monitor |
|---|---|---|---|
| **Tennessee Eastman** process, 100 runs, 17 detectable faults ([Rieth et al. 2017](https://doi.org/10.7910/DVN/6C3JR1)) | which runs became faulty, and through what? | detection **0.83**, **no alarm before any fault**, names the variable (fault 5: xmv_11, condenser cooling water) | PCA T²/SPE on 100 clean runs: 0.77 |
| **C-MAPSS** turbofans, 100 engines, run to failure (NASA) | which engines are degrading? | FD001: **0.71** detection, 0 false alarms; FD003: **0.68**; and its first-window split *is* the fault mode (p = 10⁻¹⁶) | PCA on each engine's first 30 cycles: 0.22 / 0.36 |
| **Lithium-ion cells**, 128 real cells, 70 charging protocols ([Severson et al. 2019](https://doi.org/10.1038/s41560-019-0356-8)) | which cells will die young, by cycle 100? | names **69%** of the shortest-lived quarter at **55%** precision (chance 25%), unsupervised | the paper's best feature, ranked: ρ = −0.90 with life (reproduced) |

The numbers, the baselines, and every case where it loses are
[below](#the-industrial-fleets-in-detail). In one line each: the clustering
monitor needs a group (one faulty unit in a hundred is seen 29% of the time);
it is behind PCA on TEP faults 10, 16 and 17; and on the battery fleet the
alarm keeps much less than the score behind it.

### Three monitors, for three shapes of change

| change | example | use |
|---|---|---|
| some units **leave** the fleet, abruptly | process faults, a new operating mode | `cedfs.fleet.monitor` — K-R-DPC per window, after screening which variables split the fleet; events between windows in CED-FS's and MONIC's terms |
| units **drift**, the fleet otherwise alike | wear in identical machines | `cedfs.fleet.deviation` + `accumulate` — conformal p-value against the fleet, each unit minus its own start |
| units drift, the fleet **heterogeneous** in use or ageing | batteries on different duty, mixed fault modes | `cedfs.fleet.own_change` + `accumulate` — one-sided: each unit against its own start, the fleet only ranks how much |

```
python -m cedfs.monitor fleet.csv --unit engine --time cycle --window 5 --baseline 30
```

reads a long-format CSV and runs the first two; the **Fleets** page runs all
three in the browser on the bundled fleets.

### What changed from the published method, and why

The original CED-FS (Guo, Anhui University, 2023) is kept as the default
everywhere, and the browser port is held to it on the bundled benchmarks.
What was added, each because a measurement showed the need:

- **Variable screening** (after IF-PCA, Jin & Wang 2016). The method always
  returns at least two clusters ([Theory](#theory-what-the-event-rules-imply-before-any-data-is-run), P3), so on a
  fleet with no structure it reported events in every window — 31% of
  run-windows alarmed before any fault. Screening tests each variable for
  being one Gaussian across the fleet, calls a window one group when nothing
  is selected, and clusters only what was selected. Pre-fault alarms: 31% → 0.
- **Clustering on summaries.** A fault that adds variance scatters its units
  in raw columns; their window means and spreads gather them. TEP detection
  0.63 → 0.83.
- **Relative density** (RECOME, Geng et al. 2018), an option: the original
  absorbs a group under a third of its neighbour's size — exactly the groups
  emerging and forgetting depend on (P2).
- **MONIC's transitions** (Spiliopoulou et al. 2006) next to the original four
  events: the original calls every split *drift* and some merges *forgetting*.
- **The graded monitors** above, for fleets that wear out rather than break.

Findings against the method are kept too: max Rand Index, the thesis's figure,
stays at 0.96 on a stream where every rare event is missed
([E1](#e1--an-evaluation-protocol-that-scores-the-events)); screening *hurts* on the
gene-expression benchmarks, whose columns are skewed regardless (T5); and on
the industrial fleet the choice of clusterer barely matters once screening has
run (E2).

**Contents.** [Industrial fleets in detail](#the-industrial-fleets-in-detail) ·
[The method](#the-premise-the-stream-runs-along-the-feature-axis) ·
[Theory](#theory-what-the-event-rules-imply-before-any-data-is-run) ·
[Experiments](#experiments-on-the-detector-itself) ·
[Related work](#related-work-by-the-axis-each-stream-runs-along) ·
[Benchmarks](#the-benchmarks-and-a-stream-whose-answer-is-known) ·
[Two implementations](#the-algorithm-exists-twice-and-the-two-are-held-together) ·
[Running it](#running-it) · [The API](#the-api) · [Deploying](#deploying) ·
[Layout](#layout) · [Open](#open)

## The premise: the stream runs along the feature axis

This is the least obvious thing about the method, and everything else follows
from it. In a feature stream the sample space is fixed and the **features**
arrive over time — a sensor network gaining sensors, a production line gaining
measurement stages. A window is therefore a contiguous block of *columns*: every
window covers every sample, and what evolves between windows is how those same
samples cluster as new features arrive.

Two consequences, both of which an implementation gets quietly wrong:

- The number of windows comes from the **feature** count, not the sample count.
  An implementation that windows the sample axis computes `round(8/60) = 0`
  windows for a stream that has five, and reports nothing while looking like it
  worked.
- Comparing two windows by *which samples* they group together is meaningful,
  precisely because consecutive windows hold the same samples.

## What happens in each window, and between them

    a window of columns
          |
          v
    K-r-DPC  ── K-PCA ───────── project through a kernel
             ├─ rKNN density ── how crowded each point is
             └─ density peaks ─ centres are high in density and far from
                                anything denser; the count is read off the
                                cliff in density × distance
          |
          v
    Dice similarity against the previous window's clusters
          |
          v
    stable / drift / forgetting  (per past cluster)
    emerging                     (per current cluster)

A past cluster whose best match reaches 1 is **stable**, one that reaches the
threshold has **drifted**, one that reaches neither is **forgotten**; a current
cluster matching nothing above the threshold is **emerging**.

`stable` testing an exact 1 is the published rule and is kept here. In practice
two consecutive windows almost never partition the samples identically, so on
real data stable is nearly always zero and near-identical windows are reported
as drift.

### Kernels

| Code | Kernel | Formula | Note |
|------|--------|---------|------|
| 1 | Gaussian (RBF) | exp( -\|\|x-y\|\|² / (2σ²) ) | squared distance, fast decay |
| 2 | Polynomial | ( xᵀy + 1 )^σ | captures feature interactions |
| 3 | Linear | xᵀy | no kernel trick |
| 4 | Exponential | exp( -\|\|x-y\|\| / (2σ²) ) | distance, not squared |
| 5 | Laplacian | exp( -\|\|x-y\|\| / σ ) | slower decay than Gaussian |

## Theory: what the event rules imply before any data is run

A fixed set of objects `U` is observed by features that arrive in order; a
window `W_t` is a block of `w` columns and every window sees every object, so
consecutive partitions `P_{t-1}`, `P_t` are partitions *of the same set*. That
is MONIC's setting (Spiliopoulou et al., KDD 2006) with "time point" read as
"window of columns" — not the novel-class setting of Masud et al., where
instances arrive and features are fixed. The overlap between past cluster `A`
and current cluster `B` is Dice, `S = 2|A∩B| / (|A|+|B|)`; with threshold τ a
past cluster is stable if its best `S` is 1, drift if `≥ τ`, forgetting
otherwise, and a current cluster is emerging if no past one reaches τ.

| | statement | consequence | checked by |
|---|---|---|---|
| **P1** | `S = 1` iff `A = B` as sets | one object changing groups ends "stable" for every cluster it touches | `tests/test_theory.py` |
| **P2** | `S ≤ 2 min(a,b)/(a+b)` | a split is *never* forgetting (best overlap ≥ 2/3); an absorption into a cluster > 3× larger *is* forgetting; a group under a third of its neighbour leaving it is emerging. Emerging and forgetting therefore need groups of unequal size; split and merge are invisible as such | `tests/test_theory.py`, E1 |
| **P3** | K-R-DPC never returns fewer than two clusters | on a fleet with no structure every boundary is non-stable, plus emerging/forgetting pairs when the noise clusters are small — measured: 31% of pre-fault run-windows alarm on Tennessee Eastman | `tests/test_fleet.py`, TEP |
| **P4** | `S` is invariant to relabelling, not to the window grid | detection delay is quantised to the window | TEP sensitivity |
| **P5** | the Rand Index counts pairs separated in both partitions as agreement | it rewards over-segmentation; ARI and NMI are reported instead | E1 |
| **P6** | screening tests each variable's window mean and spread for normality across the objects at level `α/2V` | if the objects are independent and the summaries Gaussian, a window selects anything with probability ≤ α, so the pre-fault stream reads "stable" except with probability ≤ α | `tests/test_one_cluster.py` |

P6 is only as good as its Gaussian assumption, and the spreads are where it
fails first. A short window's spread is chi-like: with the log alone, pure
Gaussian noise selected something in 5.2% of windows at a nominal 0.5%; with
s^(2/3) alone (Wilson & Hilferty 1931), fault-free Tennessee Eastman fleets did
in 25%. `screening.spread_scale` picks, per variable and window, the least
skewed of {log, s^(1/3), s^(2/3)}: measured rates become 0–0.5% on Gaussian
noise and 0.4% on TEP at α = 0.001. Sample-and-hold analysers and summaries
with a handful of distinct values (quantised sensors) are not tested. P-values
below 0.01 use the Dallal–Wilkinson closed form (1986): a simulated null cannot
resolve the 10⁻⁶ a Bonferroni level of 10⁻⁴ needs, and the closed form is what
lets the browser port make the same decisions.

The original's KPCA projects with `K_c v = λv` where the textbook uses `√λ v`.
Ablated (E5): `√λ` is worse everywhere it differs, so the original stays.

## Experiments on the detector itself

### E1 — An evaluation protocol that scores the events

The thesis reports the best Rand Index over the windows of one run.
`experiments/protocol.py` reports, over 20 seeds per noise level, window ARI
and NMI against what each window *can* show, event precision/recall/F1 against
the placed events, and the share of boundaries exactly right.

| stream, spread | window ARI | event F1 | F1 on emerging + forgetting | exact boundaries | max RI (thesis figure) |
|---|---:|---:|---:|---:|---:|
| canonical 1.00 | 0.99 | 0.96 | — | 0.95 | 1.00 |
| canonical 1.40 | 0.74 | 0.43 | 0.50 | 0.16 | 0.83 |
| uneven 0.70 | 0.97 | 0.40 | **0.00** | 0.00 | **0.96** |

The headline figure hides failure: on `uneven` at 0.7 max RI is 0.96 while
every emerging and forgetting event is missed. The cause is that K-R-DPC
absorbs the 6-object class — trivially separable, but with k = 5 neighbours its
kNN density is low and no centre lands there — and small groups are exactly
where P2 puts those events. On the two real streams window ARI against the
labels is 0.005 (appliances) and 0.037 (eog), above a shuffled-label null of 0
and far from a usable clustering: every window sits at the two-cluster floor.

### E5 — Small groups, and the KPCA scaling

`k_r_dpc(density="relative")` divides each density by the highest in its
neighbourhood (RECOME, Geng et al. 2018), so a small group competes on δ alone.
Exact boundaries, 20 seeds:

| | canonical 1.0 | canonical 1.4 | uneven 0.7 | uneven 1.0 |
|---|---:|---:|---:|---:|
| original | 0.95 | 0.16 | 0.00 | 0.00 |
| relative density | **1.00** | 0.09 | **1.00** | **0.85** |
| √λ scaling | 0.38 | 0.03 | 0.00 | 0.00 |

Relative density fixes small groups up to moderate noise and loses at high
noise; it is an option, not the default. On the real benchmarks the choice is
within window-to-window spread.

### T3 — MONIC's transitions next to the Dice events

`cedfs/transitions.py` reads the same partitions MONIC's way: asymmetric
overlap |X∩Y|/|X|, survive / absorb / split / disappear / emerge, τ = 0.7 and
τ_split = 0.3 as in the clusTransition package. It is exactly as accurate as
the Dice events and names what they cannot: the placed split (Dice: drift), the
placed merge (Dice: drift) and a small class rejoining its neighbour (Dice:
*forgetting*; MONIC: absorb, which is what happened).

### E2 — Other clusterers under the same rules

Exact boundaries on the synthetic streams, and detection on the Tennessee
Eastman fleet after screening (`experiments/baselines.py`):

| | canonical 1.0 | uneven 1.0 | uneven 1.4 | TEP detection, screened (FAR 0 for all) |
|---|---:|---:|---:|---:|
| K-R-DPC | 0.95 | 0.00 | 0.00 | 0.62 |
| K-R-DPC, relative density | **1.00** | 0.85 | 0.00 | 0.65 |
| k-means (k by silhouette) | 0.50 | 0.00 | 0.00 | 0.65 |
| HDBSCAN | 0.50 | **1.00** | **1.00** | 0.48 |
| evolutionary k-means (seeded by the previous partition) | 1.00 | 0.00 | 0.00 | 0.67 |

No clusterer wins everywhere. k-means and HDBSCAN merge a near pair next to a
far group; K-R-DPC is the only one that keeps it, which a fleet with several
operating modes needs. Seeding from the previous partition — the temporal
smoothness of evolutionary clustering (Chakrabarti et al. 2006) — never reports
the small class emerging: smoothing is a prior *against* concept evolution.
On the industrial fleet, unscreened every clusterer alarms on 13–67% of
pre-fault windows; screened, all are at zero. Screening decides; the clusterer
barely does.

### E3 — Threshold and kernel

τ from 0.3 to 0.7 changes nothing on the synthetic streams (the overlaps that
occur are 1, 2/3 and 0.17; P2). The kernel matters most: Gaussian is exact
where linear and polynomial lose every event; exponential keeps the small class
and loses the near pair.

### T5 — Screening on the gene-expression benchmarks

`CED_FS(..., {"screenAlpha": α})` screens each window's columns. On the
bundled gene benchmarks it **hurts** (glioma window ARI 0.37 → 0.05, mll
0.36 → 0.22): their columns are skewed whether or not they separate the
classes, so a normality screen keeps noise. Screening belongs to fleets of
like units, where "no structure" really means Gaussian columns.

### E4 — Running time

The kernel matrix, the double centring and the kNN graph are vectorised, with
every partition of glioma, mll and eog identical label for label: an eog
window goes from 0.98 s to 0.034 s. What remains is cubic by design (n/3
kernel components); `k_r_dpc(..., landmarks=m)` uses a Nyström approximation
(Williams & Seeger, NIPS 2001), O(n m²):

| n | exact | m = 200 | m = 500 |
|---:|---:|---:|---:|
| 2 000 | 2.4 s | 0.97 s | 1.5 s |
| 4 000 | 19.4 s | 4.5 s | 8.1 s |
| 8 000 | — | 34 s | 35 s |

with identical ARI; with every point a landmark it reproduces the exact
distances. Past ten thousand units the bottleneck is the n × n distances
density peaks needs, not the eigensolver.

## The industrial fleets in detail

### Tennessee Eastman

80 fault-free + 20 faulty runs of the Rieth et al. (2017) testing set
(public domain), 960 three-minute samples, fault switched on after sample 160.
A row is a run, a column one of 52 variables at one time; window = 20 samples
= 1 hour. Baseline: PCA T²/SPE at 99% limits (Chiang, Russell & Braatz 2001)
fitted on 100 *separate* fault-free runs. Means over the 17 detectable faults
(3, 9 and 15 are undetectable for every method):

| detector | history | detection | FAR before fault | FAR on normals after |
|---|---|---:|---:|---:|
| CED-FS, unchanged | none | 0.52 | 0.315 | 0.197 |
| + SigClust gate (Liu et al. 2008) | none | 0.18 | 0.000 | 0.005 |
| + variable screening | none | 0.62 | 0.000 | 0.023 |
| **+ screening, clustered on summaries** | none | **0.83** | **0.000** | 0.006 |
| PCA T²/SPE | 100 clean runs | 0.77 | 0.000 | 0.000 |

- *It names the variable*: fault 1 → xmv_3 (A feed), 4 and 14 → xmv_10
  (reactor cooling water), 5 → xmv_11 (condenser cooling water), 7 → xmv_4.
- *It catches what the reference misses*: fault 5, 1.00 against 0.24 — the
  control loop compensates and the operating point returns near normal, but
  the faulty runs still group apart through the compensating valve; fault 19,
  0.99 against 0.01.
- *It loses* on faults 10, 16 and 17, and fault 19 costs 9% alarms on normal
  runs after it.
- *Faulty share*: with k faulty runs in 100, the clustering monitor needs a
  group (k = 1: 0.29; k = 20: 0.83) while the deviation monitor ranks units one
  by one (k = 1: 0.77, with a 4% pre-fault rate from runs' persistent
  idiosyncrasies). Confirming a cluster flag with the unit's deviation p-value
  cuts single-unit false alarms from 17% to 1%.
- *Sensitivity*: α between 10⁻² and 10⁻⁴ and p barely matter; σ is best at
  3–6; the window is the one real choice — 15 minutes gives 0.68 detection at
  15 minutes' delay, 2 hours gives 0.86 at 2 hours'.

### C-MAPSS turbofans

NASA's run-to-failure simulations (Saxena et al., PHM 2008), FD001 (one fault
mode) and FD003 (two), 100 engines each, aligned at cycle 1 and cut at the
shortest life. Truth from remaining life: degraded if ≤ 50, healthy if > 125.
Window 5 cycles:

| | monitor | detection | FAR (healthy) | engines caught | median RUL at first alarm |
|---|---|---:|---:|---:|---:|
| FD001 | clustering, screened | 0.00 | 0.025 | 8 / 25 | 126 |
| | **deviation (two-sided), accumulated** | **0.71** | **0.000** | 17 / 25 | 52 |
| | own change (one-sided), accumulated | 0.82 | 0.064 | 19 / 25 | 57 |
| | PCA, first 30 cycles | 0.22 | 0.005 | 10 / 25 | 45 |
| FD003 | deviation (two-sided) | 0.29 | 0.119 | 12 / 34 | 38 |
| | **own change (one-sided)** | **0.68** | 0.062 | 20 / 34 | 54 |
| | PCA, first 30 cycles | 0.36 | 0.011 | 21 / 34 | 49 |

Why the clustering monitor fails here, measured: a failing engine's drift by
RUL 50 is only 1.2–1.5× the engine-to-engine spread at the start, and
degradation is a continuum that "outside the largest cluster" cuts at an
arbitrary place. A persistence rule (`fleet.persistent`, k-of-m with k from
the Binomial(m, α) tail, after COSMO — Rögnvaldsson et al., DMKD 2018) exposed
an early misreading: the clustering monitor's apparent "16 of 23 engines
caught" on FD001 came from a single window's split. In FD003, the engines the
clustering monitor separates in **cycles 1–10** are 32 of the 44 engines of
one end-of-life fault-mode group and none of the other (Fisher p = 1.5·10⁻¹⁶;
modes proxied by the direction sensors move at end of life,
`experiments/cmapss_modes.py`): what a remaining-life score counts as false
alarms is the fleet's two kinds of engine told apart before either degrades.

### Lithium-ion cells (real)

Severson et al. (Nature Energy 2019; data.matr.io): commercial LFP/graphite
cells cycled to 80% capacity under 72 fast-charging protocols. Lives and
continuations are derived from the raw files (`experiments/matr_prepare.py`):
128 cells (the paper keeps 124), lives 147–2157 cycles, observed over cycles
2–147. The paper's best feature, log var ΔQ₁₀₀₋₁₀(V), reproduces at ρ = −0.90
with life (paper: |ρ| = 0.93). Scored: Spearman of *when a cell is first
named* with its life, and of the cells named by cycle 100, the share from the
shortest-lived quarter (chance 0.25):

| monitor (window 5, m = 8, level 0.01) | ρ(naming, life) | precision | recall of shortest quarter |
|---|---:|---:|---:|
| deviation on per-cycle summaries (two-sided) | 0.21 | 0.43 | 0.47 |
| deviation on discharge curves (two-sided) | 0.08 | 0.33 | 0.38 |
| **own change on discharge-curve shape (one-sided)** | **0.55** | **0.55** | **0.69** |
| PCA T²/SPE, first 20 cycles | 0.23 | 0.63 | 0.16 |

The two-sided peer monitor fails on this fleet: with 70 protocols "unlike its
peers" is mostly "charged differently", and a cell that ages *less* is as
strange as one that ages more. `fleet.own_change` compares each cell only with
its own first cycles and lets the fleet rank how much it changed; on the
discharge curve's voltage bands with the "shape" statistic it is the online,
unsupervised form of the paper's feature. Its underlying score correlates with
life at −0.84 by cycle 51; the binary alarm keeps less of that than the score.

### Running it on your own fleet

```
$ python -m cedfs.monitor fd001.csv --unit engine --time cycle --window 5 --baseline 30 --m 8
100 units, 128 time steps, 21 variables, window 5
window   1  [1 .. 5]  one group
...
window   8  [36 .. 40]  one group  | deviating: 39
window  17  [81 .. 85]  one group  | deviating: 39, 57, 63, 90, 91, 97, 98
```

The input is a long-format CSV (unit column, time column, one column per
variable). On FD001 the first engine named, at cycle 40, is engine 39 — the
shortest-lived of the hundred, 88 cycles before it fails. `--json` gives one
object per window.

## Related work, by the axis each stream runs along

| line of work | axis | relation to this project |
|---|---|---|
| Guo, *面向特征流的概念演化检测方法研究* [D], Anhui University, 2023 | features arrive | CED-FS itself, the reference this port is held to |
| Rodriguez & Laio, *Science* 2014; KNN-DPC (Du et al., KBS 2016); RECOME (Geng et al., Inf. Sci. 2018) | — | density peaks, kNN density, relative density (E5) |
| MONIC (Spiliopoulou et al., KDD 2006); MEC (Oliveira & Gama, IDA 2012) | same objects re-clustered over time | the closest relatives; MONIC's transitions are T3 |
| Evolutionary clustering (Chakrabarti et al., KDD 2006; Chi et al., KDD 2007; Xu et al., DMKD 2014) | same | a baseline (E2); smoothing suppresses emergence |
| Masud et al., TKDE 2011 (ECSMiner); DXMiner, ECML-PKDD 2010; FESL (Hou et al., NeurIPS 2017) | samples arrive | "concept evolution" as novel classes — same words, other axis |
| OSFS (Wu et al., TPAMI 2013), SAOLA (Yu et al., TKDD 2016), Alpha-investing (Zhou et al., JMLR 2006) | features arrive | supervised streaming feature selection |
| IF-PCA (Jin & Wang, Ann. Stat. 2016); SigClust (Liu et al., JASA 2008) | — | variable screening; the one-cluster gate |
| Hendrickx et al., MSSP 2020; COSMO (Rögnvaldsson et al., DMKD 2018) | fleets over time | compare a unit with its peers, no history; accumulate deviation before calling it |
| PCA T²/SPE (MacGregor & Kourti 1995; Chiang et al. 2001); Page-Hinkley; ADWIN | samples arrive | the reference monitors |
| Wang, Smith & Hyndman, DMKD 2006 | — | characteristic-based clustering: the summaries representation |
| Severson et al., Nature Energy 2019 | cells over cycles | the bar for the battery fleet |

## The benchmarks and a stream whose answer is known

The experiment page runs the original method on ten benchmarks in the browser,
in a worker thread; the server holds accounts and saved runs and computes
nothing.

![What a run found on a benchmark: a reading in sentences, then the four
charts](docs/findings.png)


### A stream whose answer is known

`experiments/synthetic_drift.py` builds a feature stream with the events placed
on purpose — classes appear, move and are removed at chosen windows — so the
answer is known by construction rather than by inspection.

```
$ python -m experiments.synthetic_drift
synthetic feature stream: canonical
  samples=90  features=300  windows=5  features/window=60  seed=7

  window  placed  found          boundary  placed       detected
  1       2       2      ok      1 -> 2    S2 E0 D0 F0  S2 E0 D0 F0  ok
  2       2       2      ok      2 -> 3    S1 E0 D1 F0  S1 E0 D1 F0  ok
  3       3       3      ok      3 -> 4    S3 E0 D0 F0  S3 E0 D0 F0  ok
  4       3       3      ok      4 -> 5    S1 E0 D2 F0  S1 E0 D2 F0  ok
  5       2       2      ok

  cluster count recovered in 5/5 windows
  best Rand Index against the placed labels: 1.0000
```

`--stream uneven` places classes of different sizes, which is the only
construction that makes emerging and forgetting reachable — under equally sized
classes the Dice overlap stays above the threshold and every boundary is drift.
It recovers 3/3 windows and both boundaries exactly, `S1 E1 D1 F0` and
`S1 E0 D1 F1`.

### Ten benchmarks, of which two are actually streams

`datasets/bundled` holds them, and they are in the repository rather than
downloaded: two exist at these exact shapes nowhere public, and the canonical
host of another sends no CORS headers, so a browser could not fetch them from
upstream even if the shapes matched.

**Eight of the ten are not feature streams**, and the tool says so on the card
before you run them. Their columns are gene indices and pixel positions, in no
order that means anything: column 7 is not earlier than column 8. Shuffling the
column order and re-running produces the same answer, which is the measurement
that shows the order carries no information. They are a fair test of the
clustering, of the event rules, and of one implementation against another. They
are not evidence that the method detects drift in a stream, because there is no
drift in them to detect.

**Two of them are.** `appliances` and `eog` were added for exactly this gap, and
their columns are literally time:

| | one row is | one column is | a window of 50 columns is |
|---|---|---|---|
| `appliances` | one appliance, monitored for a day | one two-minute power reading, in clock order from midnight | 100 minutes of that day |
| `eog` | one trial of a person writing a katakana stroke with their eyes | one millisecond of gaze position, at 1 kHz | 50 ms of the movement |

On these the windows are moments and a change between them is what the method
claims to detect, so a result means what it appears to mean. The reading under a
run says which case it is in, because the same numbers support a much weaker
claim on the other eight.


### Where the benchmarks come from

Public benchmarks, redistributed for reproducibility rather than claimed as
original: `arcene` and `gisette` from the NIPS 2003 feature-selection
challenge (this `arcene` is its *training* split and this `gisette` its
*validation* split); `dlbcl`, `glioma`, `lung2`, `mll` and `prostate` gene
expression sets from the ASU feature-selection repository; `car` from the same
collection; `appliances` (UK-DALE) and `eog` (Fang & Shinozaki) from the
UCR/UEA time-series archive. They are committed because three have nowhere to
be downloaded from at these shapes — `dlbcl` (77 × 6 285) and `mll`
(57 × 5 848) exist at these shapes on no public source, and `gisette` only on
hosts that send no CORS headers — so the deployment serves them from the same
origin as the page.

Shuffling the column order of the eight unordered sets and re-running gives the
same answer (glioma best RI 0.7976 observed, 0.7886–0.8065 over five shuffles;
on mll a random order scores *higher*, 0.8420 against 0.8089): on them the
detector describes the ordering that was imposed, not evolution in the data.
`datasets/bundled/fleets/` holds the three industrial fleets as int16 with a
per-variable offset and scale (`cedfs/fleets.py`, built by
`experiments/build_fleets.py`); Tennessee Eastman is public domain, C-MAPSS is
NASA's.

## The algorithm exists twice, and the two are held together

The deployed system is **React + Spring Boot**: the detector is TypeScript
(`frontend/src/cedfs/`) and runs in the visitor's browser, in a worker thread;
the Java service (`backend/`) holds accounts, datasets and saved runs and
computes nothing. No Python runs in production.

`cedfs/` is the **reference implementation**, in Python, and it stays for two
reasons: every experiment and number in this README is produced with it (NumPy,
SciPy, scikit-learn, and readers for the raw R and HDF5 releases), and it is
what the TypeScript port is checked against.

Two implementations of one method drift, and the way they drift is silent: both
return a plausible number of clusters and nobody is told which one is right. So
the port is run over the bundled benchmarks and compared against what the
reference answered on the same files:

```bash
cd frontend && npm ci && npm test
```

Inputs are never copied into a fixture. Both sides read `datasets/bundled`, and
`frontend/tests/reference/answers.json` holds only numbers — cluster counts,
events, Rand Indices — regenerated deliberately with
`python -m tests.generate_reference_answers`.

That comparison has already earned its place. It found that the port rounded its
neighbourhood size with `Math.round`, where Python's `round` breaks halves to
even: at `p = 0.05` a 50-sample window asks for `round(2.5)` neighbours — two
there, three here — and the density estimate is built on those neighbours. One
window of `glioma` split into three clusters where the reference found two.

The fleet monitors are held the same way: `frontend/tests/fleets.test.ts`
runs the TypeScript screening, clustering, deviation and own-change monitors
on the three bundled fleets and compares every window's groups, flagged units,
selected variables, events, transitions and p-values with
`frontend/tests/reference/fleet_answers.json`
(`python -m tests.generate_fleet_answers`). To make that possible, every
screening decision in Python is taken by a closed form (the Dallal–Wilkinson
Lilliefors tail) rather than a simulated null the browser could not reproduce.

## Running it

```bash
# The reference and its tests
pip install -r requirements.txt
python -m pytest tests/ -q
python -m experiments.synthetic_drift              # the run reported below

# A fleet in a CSV file: unit column, time column, one column per variable
python -m cedfs.monitor fleet.csv --unit engine --time cycle --window 5 --baseline 30

# The industrial experiments (each script's docstring says where its data comes from)
python -m experiments.tep_fleet --screen 0.001 --represent summaries
python -m experiments.cmapss_fleet --subset FD003 --window 5 --represent summaries
python -m experiments.matr_prepare && python -m experiments.matr_curves && python -m experiments.matr_fleet

# The application: detector, datasets and all, in a browser
cd frontend && npm ci && npm run dev

# The API, if you want accounts and saved runs
docker compose up -d                               # PostgreSQL only
cd backend && CED_JWT_SECRET=$(openssl rand -base64 48) ./mvnw spring-boot:run
```

`npm run dev` alone is enough to use the detector: the sign-in page offers a
guest session, and a guest gets the same detector, the same charts and the same
readings as an account. What an account adds is storage — your own `.mat` or
CSV files, and every run recorded with the parameters that produced it.

### Who can do what

| | run the benchmarks | bring your own data | kept after the tab closes | accounts, inbox |
|---|---|---|---|---|
| guest | yes | no | no — the session is the tab | no |
| account | yes | 25 MB, uploaded only if you ask | yes | no |
| administrator | yes | yes | yes | yes |

A guest session lives in `sessionStorage` and dies with the tab, deliberately: a
guest has no address and no password, so the token in that tab is the only thing
that could ever reach those runs again. Claiming the session turns it into an
account and keeps the runs already in it.

Registration sends a verification code by email through Microsoft Graph
(`ced.mail.via=graph`), and accounts can also sign in with a Microsoft
account. What would otherwise be email to the operator — a new account,
feedback from a visitor — goes to the administrator's inbox in the
application, counted in the sidebar.

## The API

`backend/` is Java 21, Spring Boot 4.1, Spring Security 7, PostgreSQL and
Flyway. It computes nothing: it holds accounts, datasets and the record of
what was run — the shape of the stream, the parameters, the progress and the
outcome. Everything is under `/api/v1`, and everything but `auth` needs a
bearer token.

| | | |
|---|---|---|
| `POST` | `/auth/register`, `/auth/login` | a token; registration verifies the address by a code sent through Microsoft Graph |
| `GET` | `/auth/microsoft/start` → `/auth/microsoft/callback` | sign in with a Microsoft account (OIDC code + PKCE, server-side exchange) |
| `POST` | `/runs` | start a run; the window count is derived, not accepted |
| `GET` | `/runs`, `/runs/{id}` | my runs, newest first; one run with its result |
| `PATCH` | `/runs/{id}/progress` | windows done — monotonic, so an out-of-order report cannot move the bar back |
| `POST` | `/runs/{id}/result` | the outcome, once; a second attempt is 409 |
| `DELETE` | `/runs/{id}` | |

Decisions worth knowing: another user's run is **404, not 403** (a 403 confirms
the id exists; the repository only offers `findByIdAndOwner`). The window count
is derived **from the feature count**, halves to even, matching Python and
TypeScript — a result computed under another count is rejected. A wrong
password and an unknown address are answered identically **and take the same
time**. The schema is owned by Flyway migrations; Hibernate only validates. A
Microsoft sign-in is matched by tenant and object id, never by email, and never
becomes an administrator. There is no default JWT secret: the service refuses
to start without `CED_JWT_SECRET`. `./mvnw verify` runs the integration tests
through the real HTTP stack against PostgreSQL in Testcontainers.

## Deploying

One small server (1 GB and Docker): PostgreSQL, the API, and Caddy, which
terminates TLS, serves the built frontend from `/opt/ced/site`, and forwards
`/api/*` — one origin, so no CORS configuration exists anywhere. Nothing is
built on the server: CI builds the API image from a commit whose tests passed
and pushes it to `ghcr.io/yade-diao/ced-api:{latest,<sha>}`.

On a fresh machine whose domain already resolves to it,
`deploy/bootstrap.sh <domain>` installs Docker, fetches `compose.yml` and
`Caddyfile`, generates the secrets into `/opt/ced/.env` (never regenerating an
existing one) and starts the stack. By hand: copy `deploy/compose.yml`,
`deploy/Caddyfile` and `deploy/.env.example` to `/opt/ced`, fill `.env`
(`CED_JWT_SECRET` and `CED_DB_PASSWORD` from `openssl rand -base64 48`,
`CED_DOMAIN` — several names separated by commas are served side by side —
`CED_PUBLIC_URL`, `CED_ADMIN_EMAIL`, and the Microsoft and mail settings
`.env.example` documents), point the domain at the server **before** starting
(Caddy answers the ACME challenge itself, and a failed request is rate
limited), then `docker compose --env-file .env up -d`. Register with
`CED_ADMIN_EMAIL` to become the administrator.

The frontend is `npm run build` and an rsync of `frontend/dist/` to
`/opt/ced/site/`. `.github/workflows/deploy.yml` updates the API after
`backend` succeeds on `main` when the repository has `DEPLOY_HOST`,
`DEPLOY_USER` and `DEPLOY_SSH_KEY` secrets, and skips itself without them.
Every image is tagged with its commit, so `CED_IMAGE_TAG=<sha> docker compose
--env-file .env up -d` rolls back.

## Layout

    cedfs/                    the reference implementation
      algorithm/              ced_fs, k_r_dpc, k_pca, kernel, knn, density,
                              screening (is there structure, and in which
                              variables), significance (SigClust gate)
      fleet.py                the three fleet monitors, persistence and
                              accumulation
      fleets.py               the bundled fleets, addressable by name
      monitor.py              python -m cedfs.monitor: a fleet from a CSV
      transitions.py          MONIC's survive / split / absorb / emerge
      baselines.py            k-means, HDBSCAN, evolutionary k-means
      metrics/                Rand Index, NMI
      utils/                  normalisation, Dice similarity, plots
      datasets.py             the bundled benchmarks, addressable by name
      synthetic.py            streams with the events placed on purpose

    frontend/
      src/cedfs/              the TypeScript port, module for module, including
                              screening, fleet and transitions
      src/datasets/           a MATLAB v5 reader, orientation, caching
      src/worker/             where the clustering actually runs
      src/views/              one file per module in the sidebar (FleetView is
                              the Fleets page)
      src/nav.ts              the module registry the rail and routes read
      src/findings.ts         a run, turned into sentences
      src/index.css           the design system: tokens, then primitives
      tests/                  the port against the reference, on real data

    backend/                  Spring Boot 4: accounts, roles, datasets, runs,
                              the administrator's inbox, PostgreSQL + Flyway
    deploy/                   what the server runs: compose, Caddyfile, bootstrap, .env.example
    datasets/bundled/         the ten benchmarks, and their manifest
      fleets/                 three industrial fleets as int16, and theirs
    experiments/              synthetic_drift, protocol, baselines, transitions,
                              tep_* (Tennessee Eastman), cmapss_* (turbofans),
                              matr_* (battery cells), build_fleets; results/
    docs/                     the screenshots this README shows

## Open

- The battery fleet in the browser (its licence to be confirmed before bundling).
- A neighbour index in place of the n × n distances, for fleets past ten
  thousand units.

## Copyright

Copyright © 2026 Zhou Peng. Released under the [MIT License](LICENSE).
