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
| **+ variable screening (α 0.001)** | none | **0.63** | **0.000** | 0.024 |
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
6. *It loses on random-variation and sticking faults.* Faults 8, 10–13, 16, 17
   and 20 change variability rather than level; an hour's mean and spread per
   variable do not separate them as well as a per-sample T²/SPE against a
   clean reference. Fault 19 is detected (0.32) but with 31% FAR on normal runs
   after it: the screened variable splits the fleet along a line other than
   the fault.

**Where that leaves the method.** As a *peer-comparison* monitor for a fleet —
no clean history required, every window read as "one group" or "these units
left the group, through these variables" — it is competitive with the textbook
reference-based monitor on step faults and better on a compensated one, and
it explains its alarms. It is not a replacement for PCA when a clean reference
exists and the faults are subtle changes in variance.

**Next** (ROADMAP): variance-sensitive summaries for faults 8–20; window-size
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
| FD001 | CED-FS + screening | 0.14 | 0.009 | **16 / 23** | **55** |
| | peer robust z | 0.00 | 0.000 | 0 / 23 | — |
| | PCA, first 30 cycles | 0.16 | 0.000 | 6 / 23 | 32 |
| FD003 | CED-FS + screening | 0.01 | 0.399 | 1 / 27 | — |
| | peer robust z | 0.06 | 0.463 | 3 / 27 | — |
| | PCA, first 30 cycles | 0.27 | 0.003 | 12 / 27 | 32 |

**What it shows.**

1. *On FD001 the peer monitor sees more engines, earlier, but not steadily.*
   It flags 16 of the 23 degrading engines at least once, typically 55 cycles
   before failure, against PCA's 6 at 32; but it flags them intermittently
   (14% of their degraded windows) where a fixed-reference monitor, once past
   its limit, stays past it. The result is also fragile: with 16-cycle windows
   it catches none. Gradual degradation in a fifth of the fleet is close to
   the screening's detection floor.
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
3. *The fixed reference wins on persistence, the peer comparison on reach.*
   PCA fitted on each engine's own early life measures *change in that
   engine*; the fleet monitor measures *difference from the others*, which
   includes differences that were there from the start. For prognostics the
   two answer different questions, and FD003 shows the second is not empty.

**Next.** Persistence (flag an engine once it has left in k of the last m
windows) for the intermittency in point 1; testing whether the FD003 split is
the fan-vs-HPC fault mode (the subset publishes no per-engine mode, so this
needs a proxy, e.g. which sensors trend at end of life).
