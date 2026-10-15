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
- [ ] T2 Formal problem statement (`docs/THEORY.md`): windows over the feature
      axis, the event taxonomy as a function of the overlap matrix, and which
      events are reachable under which class-size conditions (the "uneven"
      result in the README, proved rather than observed).
- [ ] T3 Extend the taxonomy to MONIC's external transitions: split and merge,
      and stable that does not require Dice == 1. Keep the original rule as the
      default so the port stays faithful; the extension is an option.
- [ ] T4 KPCA scaling (`K_c v` vs. `sqrt(lambda) v`, inherited from the MATLAB
      original): state it, then ablate it in E3.

## E — Experiments

- [ ] E1 Evaluation protocol: ARI and NMI alongside the Rand Index, event-level
      precision/recall against placed events, mean ± std over seeds instead of
      best-of-runs.
- [ ] E2 Baselines on the synthetic streams and the two real streams: k-means
      and DBSCAN per window + the same overlap rules; MONIC-style transitions;
      a change-point detector on window statistics (Page-Hinkley).
- [ ] E3 Ablations: kernel, sigma, p, similarity threshold, window size,
      KPCA scaling. Sensitivity curves, not single numbers.
- [ ] E4 Scalability: time vs. samples and features; Nyström / top-k
      eigenpairs for large n.

## I — Industrial data

The stream runs along the feature axis, so the industrial case must be a
*fleet* (fixed set of units) observed over *time* (columns arriving).

- [ ] I1 Tennessee Eastman process: rows = simulation runs (normal + faults),
      columns = time steps of a process variable; the fault is introduced at a
      known step, so "a new concept emerges at step t" has ground truth.
      Measure detection delay and false alarms against PCA-T²/SPE, the
      standard monitoring baseline.
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
