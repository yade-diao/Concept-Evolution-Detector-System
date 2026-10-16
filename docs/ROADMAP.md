# Roadmap

From a faithful port of CED-FS to a method that is (1) stated precisely,
(2) measured honestly against alternatives, and (3) shown to say something
useful on industrial data. Each item ends in a commit; findings that change a
claim also change the README.

Legend: `[ ]` open, `[~]` in progress, `[x]` done, `[!]` blocked (reason given).

## T — Theory

- [x] T1 Literature map (`docs/RELATED_WORK.md`): concept evolution / novel
      class detection (ECSMiner, Masud 2011; SAND), cluster-transition
      monitoring (MONIC, Spiliopoulou 2006; MEC, Oliveira & Gama 2012;
      clusTransition), feature streams (OSFS, SAOLA, Alpha-investing, OCDS /
      OLD³S for evolving feature spaces), density peaks (Rodriguez & Laio 2014,
      KNN-DPC), and drift detection on time series (Page-Hinkley, ADWIN). For
      each: what it detects, on which axis the stream runs, what we borrow.
- [x] T2 Formal problem statement (`docs/THEORY.md`): windows over the feature
      axis, the event taxonomy as a function of the overlap matrix, and which
      events are reachable under which class-size conditions (the "uneven"
      result in the README, proved rather than observed).
- [ ] T3 Extend the taxonomy to MONIC's external transitions: split and merge,
      and stable that does not require Dice == 1. Keep the original rule as the
      default so the port stays faithful; the extension is an option.
- [ ] T4 KPCA scaling (`K_c v` vs. `sqrt(lambda) v`, inherited from the MATLAB
      original): state it, then ablate it in E3.

- [~] T5 One-cluster decision (P3, P6): `screening.py` and `significance.py`
      exist; screening is the useful one. Open: make it an option of `CED_FS`
      and of the TypeScript port, so the app can use it.

## E — Experiments

- [x] E1 Evaluation protocol: ARI and NMI alongside the Rand Index, event-level
      precision/recall against placed events, mean ± std over seeds instead of
      best-of-runs. *Done* (`experiments/protocol.py`, `docs/EXPERIMENTS.md`):
      max RI hides total failure of the event output (0.96 with rare-event F1 0).
- [ ] E2 Baselines on the synthetic streams and the two real streams: k-means
      and DBSCAN per window + the same overlap rules; MONIC-style transitions;
      a change-point detector on window statistics (Page-Hinkley).
- [ ] E3 Ablations: kernel, sigma, p, similarity threshold, window size,
      KPCA scaling. Sensitivity curves, not single numbers.
- [ ] E4 Scalability: time vs. samples and features; Nyström / top-k
      eigenpairs for large n.

- [ ] E5 Small-cluster recovery: K-R-DPC absorbs a 6-object group at spread
      0.5–0.7 though it is trivially separable (EXPERIMENTS.md E1, point 2), and
      small groups are exactly where emerging/forgetting live (THEORY P2). Look
      at relative-density / adaptive-k DPC variants, keep the original as default.

## I — Industrial data

The stream runs along the feature axis, so the industrial case must be a
*fleet* (fixed set of units) observed over *time* (columns arriving).

- [~] I1 Tennessee Eastman process: rows = simulation runs (normal + faults),
      columns = time steps of a process variable; the fault is introduced at a
      known step, so "a new concept emerges at step t" has ground truth.
      Measure detection delay and false alarms against PCA-T²/SPE, the
      standard monitoring baseline.
      *Done so far* (`docs/INDUSTRIAL.md`): unchanged CED-FS alarms on 31% of
      pre-fault run-windows (P3); variable screening (IF-PCA-style, Bonferroni)
      takes that to 0 and detection 0.52 → 0.63 vs PCA 0.77 with no clean
      history, beats PCA on fault 5, names the faulty variable.
      *Open*: variance faults (8, 10–13, 16, 17, 20), window size, smaller
      faulty fraction, two-in-a-row rule results.
- [ ] I2 NASA C-MAPSS turbofan degradation: rows = engines, columns = cycles
      (aligned from start, truncated to the shortest life); clusters split as
      units degrade. Compare events with remaining-useful-life labels.
- [ ] I3 Bearing run-to-failure (XJTU-SY or IMS) if I1/I2 hold up.
- [ ] I4 A usable entry point: `python -m cedfs.monitor` reading a CSV of a
      fleet and printing events as windows close, plus the datasets in the web
      app with their readings in plant units.

## O — Operations

- [!] O1 Move the site to `evolve.daokui.fr`. Needs a DNS A record
      `evolve` → `9.205.159.213` (DNS only, grey cloud) in Cloudflare, and the
      redirect URI `https://evolve.daokui.fr/api/v1/auth/microsoft/callback`
      added to the `ced-stream` app in Entra. Then: `CED_DOMAIN` lists both
      names (Caddy serves both, the old one stays working), `CED_PUBLIC_URL`
      switches, README / mail-check follow.
- [ ] O2 README rewrite once T/E/I have results.
