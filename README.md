# Concept Evolution Detector (CED-FS)

[![CI](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/ci.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/ci.yml)
[![frontend](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/frontend.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/frontend.yml)
[![backend](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/backend.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/backend.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Detects how groups appear, split, merge and disappear in a **feature stream** —
a fixed set of objects whose measurements arrive over time — and turns that
into a monitor for **fleets of machines**: which units left their peers, when,
and through which variables, with no fault-free history and no labels.

**→ [ced-stream.denmarkeast.cloudapp.azure.com](https://ced-stream.denmarkeast.cloudapp.azure.com)**
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

The numbers, the baselines, and every case where it loses are in
[docs/INDUSTRIAL.md](docs/INDUSTRIAL.md). In one line each: the clustering
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
  returns at least two clusters ([docs/THEORY.md](docs/THEORY.md), P3), so on a
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
([docs/EXPERIMENTS.md](docs/EXPERIMENTS.md), E1); screening *hurts* on the
gene-expression benchmarks, whose columns are skewed regardless (T5); and on
the industrial fleet the choice of clusterer barely matters once screening has
run (E2).

| | |
|---|---|
| [docs/INDUSTRIAL.md](docs/INDUSTRIAL.md) | the three fleets, baselines, failures, sensitivity, how to run it on your own CSV |
| [docs/THEORY.md](docs/THEORY.md) | what the event rules imply before any data is run (P1–P6) |
| [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md) | evaluation protocol, ablations, other clusterers, running time |
| [docs/RELATED_WORK.md](docs/RELATED_WORK.md) | where the method sits, organised by which axis each stream runs along |
| [docs/ROADMAP.md](docs/ROADMAP.md) | what is done and what is open |

### The benchmarks

The experiment page runs the original method on ten benchmarks in the browser,
in a worker thread; the server holds accounts and saved runs and computes
nothing.

![What a run found on a benchmark: a reading in sentences, then the four
charts](docs/findings.png)

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

## The algorithm exists twice, and the two are held together

The deployed system is **React + Spring Boot**: the detector is TypeScript
(`frontend/src/cedfs/`) and runs in the visitor's browser, in a worker thread;
the Java service (`backend/`) holds accounts, datasets and saved runs and
computes nothing. No Python runs in production.

`cedfs/` is the **reference implementation**, in Python, and it stays for two
reasons: every experiment and number in `docs/` is produced with it (NumPy,
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

## Results

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

See [datasets/README.md](datasets/README.md).

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
    deploy/                   what the server runs; see deploy/README.md
    datasets/bundled/         the ten benchmarks, and their manifest
      fleets/                 three industrial fleets as int16, and theirs
    experiments/              synthetic_drift, protocol, baselines, transitions,
                              tep_* (Tennessee Eastman), cmapss_* (turbofans),
                              matr_* (battery cells), build_fleets; results/
    docs/                     theory, experiments, industrial, related work

## Deploying

One small server: PostgreSQL, the API, and Caddy terminating TLS in front of
both. The static site and the API share an origin, so no CORS configuration
exists anywhere — which is also how the browser gets its datasets.
[deploy/README.md](deploy/README.md) has the runbook; CI builds the image and
`.github/workflows/deploy.yml` puts it there.

## Copyright

Copyright © 2026 Zhou Peng. Released under the [MIT License](LICENSE).
