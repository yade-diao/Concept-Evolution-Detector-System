# Industrial data

## I1 — A Tennessee Eastman fleet

**Question.** A plant operator watches a fleet of like units — here, simulation
runs of the Tennessee Eastman process (Downs & Vogel 1993), as released by
Rieth et al. (2017, Harvard Dataverse, doi:10.7910/DVN/6C3JR1, public domain).
Some units develop a fault. Can a detector that sees *only the fleet* — no
fault-free history, no training, no labels — tell when the way the units group
changes, which units moved, and through which variable?

**Setup.** `experiments/tep_fleet.py`.

- Fleet: 80 fault-free runs + 20 runs of fault *f*, from the testing set
  (960 three-minute samples per run; the fault is switched on after sample 160,
  hour 8).
- Stream: a row is a run, a column is one of 52 variables at one sample time,
  in time order. Window = 20 samples = 1 hour = 1 040 columns. 48 windows,
  8 before the fault.
- Each column is min-max scaled across the fleet at that instant — the only
  normalisation available without history.
- A run is flagged in a window when it lies outside that window's largest
  cluster. Scored per run per window: false-alarm rate (FAR) over the 8
  pre-fault windows; detection over the 40 after, on the faulty runs; and FAR
  on the normal runs after the fault.
- Baseline: PCA with Hotelling T² and SPE at 99% limits (Chiang, Russell &
  Braatz 2001), fitted on 100 *separate* fault-free runs; a run is flagged in a
  window when more than half of its samples exceed either limit. It has what
  CED-FS does not: a clean reference.

```
python -m experiments.tep_prepare          # after the R step it documents
python -m experiments.tep_fleet --screen 0.001
```

**Results** (faults 3, 9 and 15 excluded from the means — they are the three
the TEP literature agrees are undetectable from these measurements, and every
method here scores zero on them):

| detector | history needed | detection | FAR before fault | FAR on normals after |
|---|---|---|---:|---:|
| CED-FS, unchanged | none | 0.52 | 0.315 | 0.197 |
| + SigClust one-cluster gate (α 0.05) | none | 0.18 | 0.000 | 0.005 |
| + variable screening (α 0.01) | none | 0.63 | 0.000 | 0.031 |
| + variable screening (α 0.001) | none | 0.62 | 0.000 | 0.023 |
| **+ screening, clustered on the selected summaries** | none | **0.83** | **0.000** | 0.006 |
| PCA T² / SPE | 100 clean runs | 0.77 | 0.000 | 0.000 |

Raw per-fault numbers: `experiments/results/tep_fleet_*.json`.

**What it shows.**

1. *Unchanged, the method cannot be used as a monitor.* It alarms on a third
   of the run-windows before any fault, exactly as THEORY.md P3 predicts: it
   always returns at least two clusters, and on a fleet with no structure the
   second is noise.
2. *The fault is diluted, not absent.* Fault 4 moves one variable (reactor
   cooling water flow, `xmv_10`); in a 1 040-column window that is 20 columns,
   and unchanged CED-FS scores ARI 0.00 on it. Screening the variables first
   (IF-PCA's idea, Jin & Wang 2016) and clustering only on the selected ones
   lifts it to 1.00 detection, ARI 1.00.
3. *Screening also settles P3.* A window in which no variable is selected is
   one cluster, so the pre-fault stream reads "stable, stable, …" — at
   α = 0.001 not one of the 8 × 20 pre-fault windows alarms.
4. *It names the variable.* The variables most often selected after the fault
   are the physically right ones: fault 1 (A/C feed ratio) → `xmv_3`, A feed
   flow; fault 4 and 14 (reactor cooling water) → `xmv_10`; fault 5 (condenser
   cooling water) → `xmv_11`, condenser cooling water flow; fault 7 (C header
   pressure loss) → `xmv_4`. PCA T²/SPE says *that* a run is abnormal; this says
   *where*.
5. *It catches what the reference-based monitor misses.* Fault 5: CED-FS 1.00,
   PCA 0.24. The control loop compensates the condenser-temperature step, the
   plant's operating point returns close to normal, and PCA's limits — set on
   the normal operating point — stop firing; the faulty units still group
   apart from their peers because the compensating valve sits elsewhere.
6. *Random-variation faults needed a different representation, not a
   different test.* With screening alone (row 4) the method lost on faults 8,
   10–13, 16, 17 and 20, which change variability rather than level. The
   screening already picked the right variables — fault 11 (reactor cooling
   water inlet temperature, random variation) selects `xmv_10` — but the
   selected variable's raw columns were then clustered, and units whose signal
   has more variance do not gather in raw space, they scatter. Clustering on
   the selected *summaries* instead — each unit's window mean and log-spread
   of the variables that failed the test, the characteristic-based clustering
   of Wang, Smith & Hyndman (DMKD 2006) — makes them a group
   (`cedfs.fleet.monitor(..., represent="summaries")`). Fault 8 goes 0.52 →
   0.93, 11 0.30 → 0.96, 12 0.37 → 0.98, 13 0.57 → 0.89, 14 0.69 → 1.00,
   19 0.33 → 0.99, 20 0.46 → 0.62, with no pre-fault alarm anywhere.
7. *With it, the fleet monitor out-detects the reference monitor.* Mean
   detection 0.83 against PCA's 0.77, without the 100 clean runs PCA is fitted
   on. Per fault it is ahead on 4 (5, 11, 19, 20 — fault 19 by 0.99 to 0.01),
   behind on 5 (10 and 16 most, then 17, 13, 8), level on the rest. The cost
   is fault 19's 9.1% alarm rate on normal runs after the fault, the only one
   above 2%.

**Where that leaves the method.** As a *peer-comparison* monitor for a fleet —
no clean history required, every window read as "one group" or "these units
left the group, through these variables" — it is competitive with the textbook
reference-based monitor on step faults and better on a compensated one, and
it explains its alarms. Clustered on the selected summaries it detects more
than the reference-based monitor on average, with no reference. It is still
behind PCA on faults 10, 16 and 17, so where a clean reference exists the
two are complements: one says a unit changed, the other that it is unlike its
peers and through which variable.

**Next** (ROADMAP): window-size
sensitivity (detection delay is quantised to the window, THEORY.md P4); fleets
with a smaller faulty fraction; C-MAPSS (I2) where there is no switch-on time
and degradation is gradual.

### How small a faulty share can be seen

A fifth of a fleet failing at once is a lot. `experiments/tep_fraction.py`
keeps the fleet at 100 runs and varies the faulty ones, k = 1 … 20, over the
17 detectable faults (`experiments/results/tep_fraction.json`):

| faulty runs | clustering: detection | FAR before | FAR on normals after | deviation: detection | FAR before | FAR on normals after |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.29 | 0.000 | 0.169 | **0.77** | 0.040 | 0.065 |
| 2 | 0.43 | 0.000 | 0.128 | **0.71** | 0.043 | 0.061 |
| 5 | **0.78** | 0.000 | 0.026 | 0.72 | 0.037 | 0.050 |
| 10 | **0.83** | 0.000 | 0.005 | 0.72 | 0.041 | 0.034 |
| 20 | **0.83** | 0.000 | 0.006 | 0.66 | 0.041 | 0.019 |

(clustering: screened at α = 0.001, clustered on summaries; deviation: own
baseline over the first 100 samples, m = 5, level 0.01, not latched.)

1. **The two monitors cross at about 5% of the fleet.** Screening asks whether
   a variable is one Gaussian across the fleet; one deviant among a hundred
   moves the empirical distribution by 1/100, which the KS distance barely
   sees, so the clustering monitor needs a group. The deviation score ranks
   units one by one and sees a single faulty run 77% of the time.
2. **The clustering monitor's alarms on normals at small k have one cause.**
   When screening does fire on a single deviant, K-R-DPC still returns at
   least two clusters, and the cut takes normal runs with it (17% FAR at k = 1).
   Confirming each cluster flag with the unit's own deviation p-value in that
   window (p ≤ 0.05) removes nearly all of it — FAR 0.169 → 0.010 at k = 1,
   0.125 → 0.006 at k = 2 — for little detection (0.28 → 0.25, 0.45 → 0.38).
   It cannot be used at large k: twenty deviants cannot all rank in the top 5%,
   and detection at k = 20 falls to 0.19.
3. **Combining the monitors trades, it does not add.** Alarming on either
   reaches 0.81–0.89 detection but carries the deviation monitor's 4%
   pre-fault rate; alarming on both is clean (FAR ≤ 1.4%) and detects less
   than either alone.
4. **The deviation monitor's floor is its 4% pre-fault rate**, in every
   column: TEP runs differ persistently, so a run's p-values are not
   independent over windows (see the C-MAPSS section). It is a property of
   the fleet, not of k.
5. *A measurement correction made on the way*: `accumulate` first latched its
   alarms, which suits run-to-failure engines and turned every passing
   alarm on a normal TEP run into forty windows of false alarm (FAR 0.45 at
   k = 1). It no longer latches by default; the C-MAPSS figures are unchanged
   by it (FD001 0.71 / 0.000, FD003 0.29 / 0.119).

**Operating guidance.** If a fault is expected to hit a handful of units,
use the deviation monitor; if it hits a group, or the question is which
group and through which variables, use the clustering monitor; to keep the
clustering monitor's zero-FAR behaviour down to single units, confirm its
flags with the deviation p-value.

## I2 — A fleet of turbofan engines (NASA C-MAPSS)

**Question.** The same monitor, on a fleet that degrades gradually and has no
switch-on time: does a group of engines leave its peers as they approach
failure, and how early?

**Data.** C-MAPSS run-to-failure simulations (Saxena, Goebel, Simon & Eklund,
"Damage propagation modeling for aircraft engine run-to-failure simulation",
PHM 2008), training sets FD001 (100 engines, one operating condition, HPC
degradation) and FD003 (100 engines, one condition, HPC *or* fan degradation).
Engines are aligned at cycle 1 and cut at the shortest life (128 / 145 cycles)
so every engine is in every window; 21 sensors.

**Truth.** From remaining useful life at a window's last cycle: degraded if
RUL ≤ 50, healthy if RUL > 125 (the cap below which the PHM literature treats
an engine as degrading; Heimes 2008), unscored in between. In FD001, 23
engines become degraded inside the 128 cycles.

**Monitors** (`experiments/cmapss_fleet.py`), all scored per engine per window:
CED-FS with screening (`cedfs.fleet.monitor`, no history); peer robust z — an
engine flagged when any sensor's window mean is beyond a Bonferroni quantile in
fleet median/MAD units, no history; and PCA T²/SPE fitted on every engine's
first 30 cycles.

**A correction found on the way.** Five FD001 sensors are constant or take two
or three values (e.g. sensor 6 is 21.60 or 21.61). The KS test against a
continuous law rejects such a summary whatever the fleet does, so the
screening selected them in every window and the monitor alarmed on 27% of
healthy engine-windows. Summaries with fewer than max(10, n/4) distinct values
across the fleet are now not tested (`screening.testable`); the Tennessee
Eastman results are unchanged by it.

**Results** (window 10 cycles, α = 0.01; `experiments/results/cmapss_*.json`):

| | monitor | detection (degraded engine-windows) | FAR (healthy) | engines caught | median RUL at first flag |
|---|---|---:|---:|---:|---:|
| FD001 | CED-FS + screening | 0.00 | 0.062 | 12 / 23 | 128 |
| | CED-FS + screening + persistence (2 of 5) | 0.00 | 0.000 | 0 / 23 | — |
| | peer robust z | 0.00 | 0.000 | 0 / 23 | — |
| | PCA, first 30 cycles | 0.16 | 0.000 | 6 / 23 | 32 |
| FD003 | CED-FS + screening | 0.01 | 0.389 | 1 / 27 | — |
| | CED-FS + screening + persistence (2 of 5) | 0.01 | 0.362 | 1 / 27 | — |
| | peer robust z | 0.06 | 0.463 | 3 / 27 | — |
| | PCA, first 30 cycles | 0.27 | 0.003 | 12 / 27 | 32 |

**What it shows.**

1. *On FD001 there is one split, not a monitor tracking degradation.* The
   first version of this page read the "16 of 23 engines caught, 55 cycles
   before failure" row as earlier detection than PCA. The persistence rule
   (`cedfs.fleet.persistent`, below) showed why that reading was wrong: it
   catches nothing, because no engine is flagged twice. Every flag comes from
   one window — cycles 91–100, the only window not read as one cluster —
   in which sensors 3 and 17 split the fleet 48 / 52. The 48 do have shorter
   remaining lives (median 86 against 114 cycles; Mann–Whitney p = 2·10⁻⁵,
   AUC 0.75), so the split is real and life-relevant, but it is a single
   coarse ranking of the fleet, not an alarm that follows each engine into
   failure. Gradual degradation in a fifth of the fleet is below what the
   screening resolves window by window; PCA against each engine's own early
   life is the better detector here.
   *(Re-run after the spread-scale change of THEORY.md P6: the one split now
   falls in an earlier window and catches 12 engines at a median RUL of 128 —
   still a single split, now unrelated to degradation; the table shows the
   re-run. The reading above was made on the earlier run and its conclusion
   stands.)*
2. *On FD003 the fleet is not one group to begin with.* From the very first
   window the screening selects the two fan-speed sensors (8 and 13), whose
   window means are strongly skewed across engines (skewness −2.3), and splits
   off about 20 engines. By the RUL truth those are false alarms. But they are
   not noise: **the engines split off in window 1 have a median life of 310
   cycles against 206 for the rest** (Mann–Whitney p = 0.0003), and initial fan
   speed correlates with life at Spearman −0.46 (p = 2·10⁻⁶). The monitor has
   found a real, life-relevant subpopulation of the fleet at cycle 10 — which
   is exactly what "compare a unit with its peers" should do, and exactly what
   a degradation-only score cannot credit.
3. *A fixed reference and a peer comparison answer different questions.*
   PCA fitted on each engine's own early life measures *change in that
   engine*; the fleet monitor measures *difference from the others*, which
   includes differences that were there from the start. For prognostics the
   two answer different questions, and FD003 shows the second is not empty.

**Persistence.** `cedfs.fleet.persistent(flags, alpha, m=5)` raises an alarm
when a unit has been flagged in k of its last m windows, k being the smallest
count whose Binomial(m, α) tail is below 0.001 — screening bounds a unit's
per-window flag probability by α under no structure (THEORY.md P6), so the
threshold follows from the bound instead of being tuned (k = 2 for α = 0.01,
m = 5). The idea of accumulating a unit's deviation from the fleet over time
before calling it is COSMO's (Rögnvaldsson, Nowaczyk, Byttner, Prytz &
Svensson, "Self-monitoring for maintenance of vehicle fleets", *Data Mining and
Knowledge Discovery* 32, 2018, on four years of a city-bus fleet), and the k-of-m
form is the control-chart run rule. Its first use was diagnostic: it is what
exposed point 1.

**Next.** Testing whether the FD003 split is the fan-vs-HPC fault mode (the
subset publishes no per-engine mode, so this needs a proxy, e.g. which sensors
trend at end of life); a per-unit deviation score rather than a binary flag,
so that persistence can accumulate evidence below the flag threshold, as COSMO
does with its conformal z-values.

### Optimising for gradual degradation

**Why the clustering monitor fails here — two causes, measured.**

1. *The fleet is as varied as the fault.* On the eight informative FD001
   sensors, the drift an engine accumulates by RUL 50 (relative to its own
   first 10 cycles) is only 1.2–1.5 × the engine-to-engine spread at the start.
   A failing engine is still inside the fleet's normal range, so comparing it
   with its peers cannot single it out. PCA compares each engine with *its own*
   start, which removes that spread — the data, not the method, decides this.
2. *Degradation is a continuum, not a group.* With each engine's own baseline
   removed, the clustering monitor's detection rises from 0.06 to 0.49 — and its
   false-alarm rate from 1% to 32%. Engines degrading at different rates spread
   along a line; "outside the largest cluster" cuts that line somewhere
   arbitrary. That one is the method's.

**The change.** `cedfs.fleet.deviation` + `cedfs.fleet.accumulate`:

- subtract each unit's mean over its first `baseline` samples;
- per window, score each unit by its summed squared robust z-scores against the
  fleet (median/MAD, continuous variables only), and turn the score into a
  conformal p-value — the share of the fleet at least as strange — which is
  uniform when the units are exchangeable (Vovk, Gammerman & Shafer 2005);
- alarm when the mean of a unit's last m p-values falls below the `level`
  quantile of its null law, N(1/2, 1/(12m)) — COSMO's way of turning a
  per-window deviation into a decision (Rögnvaldsson et al. 2018). Note the
  floor this implies: with n = 100 units no p-value is below 0.01, and the
  mean of three can never reach the 0.001 quantile, so m ≥ 5.

**Results** (window 5 cycles, baseline 30, m = 8, level 0.01;
`experiments/results/cmapss_*_w5.json`):

| | monitor | detection | FAR (healthy) | engines caught | median RUL at first alarm |
|---|---|---:|---:|---:|---:|
| FD001 | clustering, screened (summaries) | 0.00 | 0.025 | 8 / 25 | 126 |
| | **deviation, accumulated** | **0.71** | **0.000** | 17 / 25 | 52 |
| | PCA, first 30 cycles | 0.22 | 0.005 | 10 / 25 | 45 |
| FD003 | clustering, screened (summaries) | 0.13 | 0.151 | 32 / 34 | 48 |
| | deviation, accumulated | 0.29 | 0.119 | 12 / 34 | 38 |
| | PCA, first 30 cycles | **0.36** | **0.011** | 21 / 34 | 49 |

1. **On FD001 the optimised monitor is the best of the three**: detection
   0.71 against PCA's 0.22, no false alarm, the first alarm about 52 cycles
   before failure — with the same "first 30 cycles are healthy" assumption PCA
   makes and no model fitted to it.
2. **On FD003 it loses to PCA, and the false alarms are one group.** The 20
   engines alarmed while "healthy" are the long-lived, low-fan-speed engines of
   point 2 above (median life 298 against 220; initial fan-speed rank ≈ 12 of
   100): they change differently from the majority, so against the fleet they
   look deviant. Scoring each engine only within the peer group the first
   window's clustering finds (`deviation(..., groups=...)`, after Hendrickx et
   al.'s per-cluster comparison) does not help — that group comes out as two
   groups of 10 and 11, too small for a conformal p-value to reach the
   threshold (0.22 detection, 0.14 FAR). What separates those engines is how
   fast they change, not where they start.
3. **On Tennessee Eastman the same score is worse than the clustering
   monitor**: detection 0.85 but 5% false alarms before the fault and 21% on
   normal runs after it, against 0.81 with none. TEP runs carry persistent
   idiosyncrasies, so a unit's p-values are not independent over windows and
   accumulation over-counts them.

**So the system has two monitors, for two kinds of change.** The clustering
monitor (`monitor`, screened, summaries) is for a subset of units *leaving*
the fleet — abrupt faults, new operating modes — and reads out events and the
variables behind them. The deviation monitor (`deviation` + `accumulate`) is
for units *drifting* — wear, degradation — and needs each unit's own baseline.
Neither wins on both datasets; each wins on the one shaped like its question.

## Sensitivity of the clustering monitor (E3, Tennessee Eastman)

`experiments/tep_sensitivity.py`: one parameter at a time around window 20,
α = 0.001, σ = 6, p = 0.05, clustered on summaries; 17 faults, 80 + 20 runs
(`experiments/results/tep_sensitivity.json`). Delay is the median over
faults detected above 0.5, from onset to the end of the first flagged window.

| parameter | value | detection | FAR before | FAR on normals after | delay |
|---|---:|---:|---:|---:|---:|
| window (samples) | 5 (15 min) | 0.68 | 0.003 | 0.009 | 15 min |
| | 10 | 0.78 | 0.018 | 0.010 | 45 min |
| | **20** | 0.83 | 0.000 | 0.006 | 60 min |
| | 40 | 0.86 | 0.000 | 0.003 | 120 min |
| α | 0.01 | 0.83 | 0.000 | 0.011 | 60 min |
| | **0.001** | 0.83 | 0.000 | 0.006 | 60 min |
| | 0.0001 | 0.83 | 0.000 | 0.006 | 60 min |
| σ | 1 | 0.60 | 0.000 | 0.096 | 60 min |
| | 3 | 0.84 | 0.000 | 0.006 | 60 min |
| | **6** | 0.83 | 0.000 | 0.006 | 60 min |
| | 12 | 0.76 | 0.000 | 0.006 | 60 min |
| p | 0.02 | 0.82 | 0.000 | 0.001 | 60 min |
| | **0.05** | 0.83 | 0.000 | 0.006 | 60 min |
| | 0.1 | 0.83 | 0.000 | 0.007 | 60 min |

1. **The window is the one real choice, and it is a delay trade.** A 15-minute
   window alarms 15 minutes after onset and sees 0.68 of the faulty
   run-windows; a 2-hour window sees 0.86 and alarms after 2 hours. Detection
   delay is quantised to the window (THEORY.md P4), so the operator picks the
   delay they can afford and gets the detection that comes with it.
2. **α does not matter between 1e-2 and 1e-4** — and that is the result of two
   fixes found by this sweep, not of luck. The first sweep showed α = 1e-4
   detecting nothing: the simulated Lilliefors null could not produce a p-value
   below 5·10⁻⁶ and the Bonferroni level asked for 10⁻⁶ (fixed with the
   Dallal–Wilkinson tail). It also showed α = 0.01 alarming on 11% of
   pre-fault windows and a 5-sample window on 15%: the log-spread summary was
   not Gaussian enough (fixed by `spread_scale`, THEORY.md P6). After both, the
   pre-fault rate is 0–2% across the whole table.
3. **σ has a broad optimum (3–6); p barely matters.** σ = 1 makes the Gaussian
   kernel nearly diagonal on standardised summaries and the clustering
   fragments (10% FAR on normals after the fault); σ = 12 smooths the faulty
   group into the normals.
