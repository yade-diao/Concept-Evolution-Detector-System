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
| + variable screening (α 0.01) | none | 0.62 | 0.106 | 0.035 |
| + variable screening (α 0.001) | none | 0.63 | 0.000 | 0.024 |
| **+ screening, clustered on the selected summaries** | none | **0.81** | **0.000** | 0.008 |
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
   (`cedfs.fleet.monitor(..., represent="summaries")`). Fault 8 goes 0.49 →
   0.93, 11 0.29 → 0.96, 13 0.56 → 0.90, 14 0.78 → 1.00, 19 0.32 → 0.99,
   20 0.50 → 0.63, with no pre-fault alarm anywhere.
7. *With it, the fleet monitor out-detects the reference monitor.* Mean
   detection 0.81 against PCA's 0.77, without the 100 clean runs PCA is fitted
   on. Per fault it is ahead on 4 (5, 11, 19, 20 — fault 19 by 0.99 to 0.01),
   behind on 7 (10, 12, 16, 17 most), level on the rest. The cost is fault 19's
   9.6% alarm rate on normal runs after the fault, the only one above 2%.

**Where that leaves the method.** As a *peer-comparison* monitor for a fleet —
no clean history required, every window read as "one group" or "these units
left the group, through these variables" — it is competitive with the textbook
reference-based monitor on step faults and better on a compensated one, and
it explains its alarms. Clustered on the selected summaries it detects more
than the reference-based monitor on average, with no reference. It is still
behind PCA on faults 10, 12, 16 and 17, so where a clean reference exists the
two are complements: one says a unit changed, the other that it is unlike its
peers and through which variable.

**Next** (ROADMAP): window-size
sensitivity (detection delay is quantised to the window, THEORY.md P4); fleets
with a smaller faulty fraction; C-MAPSS (I2) where there is no switch-on time
and degradation is gradual.

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
| FD001 | CED-FS + screening | 0.14 | 0.009 | 16 / 23 | 55 |
| | CED-FS + screening + persistence (2 of 5) | 0.00 | 0.000 | 0 / 23 | — |
| | peer robust z | 0.00 | 0.000 | 0 / 23 | — |
| | PCA, first 30 cycles | 0.16 | 0.000 | 6 / 23 | 32 |
| FD003 | CED-FS + screening | 0.01 | 0.399 | 1 / 27 | — |
| | CED-FS + screening + persistence (2 of 5) | 0.01 | 0.374 | 1 / 27 | — |
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
