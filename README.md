# Concept Evolution Detector (CED-FS)

[![CI](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/ci.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/ci.yml)
[![frontend](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/frontend.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/frontend.yml)
[![backend](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/backend.yml/badge.svg)](https://github.com/yade-diao/Concept-Evolution-Detector-System/actions/workflows/backend.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Detects and classifies how concepts appear, move and disappear in a
high-dimensional **feature stream**, and shows what it found in a browser.

**→ [ced-stream.denmarkeast.cloudapp.azure.com](https://ced-stream.denmarkeast.cloudapp.azure.com)**
— running, with ten benchmarks bundled. "Continue as guest" needs no account.

![The experiment page: ten benchmarks, the detector's parameters, and the window
strip above them](docs/experiment.png)

The clustering runs **in the browser**, in a worker thread. The server holds
accounts, uploaded datasets and saved runs; it computes nothing, so the tool
works with the network off once a benchmark is cached.

![What a run found: a reading in sentences, then the four
charts](docs/findings.png)

Every run is read back in the units of the data it came from — the panel above
is `eog`, where a window is fifty milliseconds of eye movement, so the reading
says so rather than saying "window 8".

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

`cedfs/` is the reference, in Python, and is where the numbers reported here
come from. `frontend/src/cedfs/` is a TypeScript port, and is what actually runs
when someone uses the tool — the clustering happens in the browser, in a worker
thread, and the server computes nothing.

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

## Running it

```bash
# The reference and its tests
pip install -r requirements.txt
python -m pytest tests/ -q
python -m experiments.synthetic_drift              # the run reported below

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

The deployment has no mail relay — sending mail needs a domain and a provider,
and a `*.cloudapp.azure.com` name can carry neither the DKIM records nor an MX
record. So registration is one step with an address nothing verifies, and what
would have been email — a new account, feedback from a visitor — goes to the
administrator's inbox in the application, counted in the sidebar.

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
      algorithm/              ced_fs, k_r_dpc, k_pca, kernel, knn, density
      metrics/                Rand Index, NMI
      utils/                  normalisation, Dice similarity, plots
      datasets.py             the bundled benchmarks, addressable by name
      synthetic.py            streams with the events placed on purpose

    frontend/
      src/cedfs/              the TypeScript port, module for module
      src/datasets/           a MATLAB v5 reader, orientation, caching
      src/worker/             where the clustering actually runs
      src/views/              one file per module in the sidebar
      src/nav.ts              the module registry the rail and routes read
      src/findings.ts         a run, turned into sentences
      src/index.css           the design system: tokens, then primitives
      tests/                  the port against the reference, on real data

    backend/                  Spring Boot 4: accounts, roles, datasets, runs,
                              the administrator's inbox, PostgreSQL + Flyway
    deploy/                   what the server runs; see deploy/README.md
    datasets/bundled/         the ten benchmarks, and their manifest
    experiments/              synthetic_drift, run_experiment

## Deploying

One small server: PostgreSQL, the API, and Caddy terminating TLS in front of
both. The static site and the API share an origin, so no CORS configuration
exists anywhere — which is also how the browser gets its datasets.
[deploy/README.md](deploy/README.md) has the runbook; CI builds the image and
`.github/workflows/deploy.yml` puts it there.

## Copyright

Copyright © 2026 Zhou Peng. Released under the [MIT License](LICENSE).
