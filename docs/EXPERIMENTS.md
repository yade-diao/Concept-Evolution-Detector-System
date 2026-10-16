# Experiments

Measured claims about the detector itself. Industrial data has its own page,
[INDUSTRIAL.md](INDUSTRIAL.md); the propositions these numbers test are in
[THEORY.md](THEORY.md).

## E1 — The evaluation protocol

The thesis reports, per dataset, the best Rand Index over the windows of one
run. That figure has three problems: RI rewards over-segmentation (P5); the
maximum of many noisy window scores is high whatever they mean; and it scores
the clustering, not the events the method exists to report.

`experiments/protocol.py` replaces it with, per configuration and over 20
independently generated streams:

- **window ARI and NMI** against what each window *can* show — classes that
  share a centre in a window are one group there (`SyntheticStream.window_labels`);
- **event precision / recall / F1** against the placed events, matched by type
  and boundary (`evaluation.event_scores`), and F1 on emerging + forgetting
  alone;
- **exact boundaries**: the share of boundaries whose four counts are all right;
- and, for contrast, the thesis figure, max RI against the class labels.

```
python -m experiments.protocol --seeds 20     # ~8 s
```

### Results (mean ± std over 20 seeds; `experiments/results/protocol_synthetic.json`)

| stream | spread | window ARI | event F1 | F1 emerging/forgetting | exact boundaries | max RI (thesis figure) |
|---|---:|---:|---:|---:|---:|---:|
| canonical | 0.35 | 1.00 ± 0.00 | 1.00 ± 0.00 | — (none placed) | 1.00 ± 0.00 | 1.00 |
| canonical | 1.00 | 0.99 ± 0.03 | 0.96 ± 0.11 | — | 0.95 ± 0.15 | 1.00 |
| canonical | 1.40 | 0.74 ± 0.10 | 0.43 ± 0.13 | 0.50 ± 0.50 | 0.16 ± 0.16 | 0.83 |
| canonical | 2.00 | 0.13 ± 0.08 | 0.20 ± 0.04 | 0.00 | 0.00 | 0.63 |
| uneven | 0.35 | 1.00 ± 0.00 | 1.00 ± 0.00 | 1.00 ± 0.00 | 1.00 ± 0.00 | 1.00 |
| uneven | 0.70 | 0.97 ± 0.00 | 0.40 ± 0.00 | **0.00 ± 0.00** | 0.00 ± 0.00 | 0.96 |
| uneven | 1.40 | 0.69 ± 0.19 | 0.42 ± 0.07 | 0.11 ± 0.23 | 0.00 | 0.93 |

(For canonical, "—" means no emerging or forgetting event is placed and none
was reported, which scores 1.)

### What it shows

1. **The headline figure hides failure.** On `uneven` at spread 0.7, max RI
   is 0.96 and window ARI 0.97, yet *every* emerging and forgetting event is
   missed, on every seed. The clustering is nearly right; the events — the
   output — are wrong.
2. **Small groups are where the events are, and where density peaks fails.**
   THEORY.md P2 says emerging and forgetting are only reported when a group
   under a third of its neighbour's size leaves or joins it. In `uneven` that
   group is 6 objects against 60, and at spread ≥ 0.5 K-R-DPC absorbs it into
   its neighbour — although the two are separated by ~31 units against a
   within-group spread of ~8 in 60 dimensions, i.e. trivially separable. The
   cause is the density estimate: with `p = 0.05`, k = 5 neighbours, about the
   size of the whole small group, so its points have low kNN density, their
   γ = ρδ falls below the cliff, and no centre is placed there. With
   `p = 0.02` it survives to spread 0.5 and is lost at 0.7. This is the
   known weakness of density-peak clustering on small or sparse clusters, and
   it sits exactly on the case the event rules need (ROADMAP E5).
3. **Degradation with noise is gradual for the clustering and abrupt for the
   events.** Window ARI goes 1.00 → 0.99 → 0.74 between spread 1.0 and 1.4;
   exact boundaries go 0.95 → 0.16. One object in the wrong group ends
   "stable" (P1), so event accuracy is far more sensitive than any partition
   score.

### The two real streams

Window ARI against the class labels, mean ± std over windows (window = 50
columns), against the same with labels shuffled (10 shuffles):

| dataset | windows | window ARI | window NMI | shuffled ARI | max RI |
|---|---:|---:|---:|---:|---:|
| appliances | 14 | 0.005 ± 0.009 | 0.023 ± 0.033 | 0.000 ± 0.000 | 0.43 |
| eog | 25 | 0.037 ± 0.052 | 0.080 ± 0.083 | 0.000 ± 0.000 | 0.61 |

Above chance, barely. Every window returns two clusters — the floor, P3 —
so these windows are mostly the "no structure detected" case the screening of
INDUSTRIAL.md exists for. Class labels are also not the right truth here: an
appliance's class need not be visible in any one 100-minute window.

## E5 — Small groups, and T4 — KPCA scaling

Two candidate causes for the absorbed small group of E1, each now an option
of `k_r_dpc` with the original as default:

- `density="relative"` — each point's density divided by the highest in its
  kNN neighbourhood (RECOME, Geng et al., *Information Sciences* 2018; the same
  idea as NDPC's normalised density). Every local peak scores 1, so a small
  group competes for a centre on its separation δ alone.
- `kpca_scaling="sqrt"` — the textbook `√λ v` projection instead of the
  original's `λ v` (THEORY.md §4, T4). The hypothesis was that eigenvalue
  weighting shrinks the axes of small groups.

Protocol of E1, 20 seeds (`experiments/results/protocol_*.json`). Event F1 /
exact boundaries:

| stream, spread | original | relative density | √λ scaling | both |
|---|---|---|---|---|
| canonical 0.70 | 1.00 / 1.00 | 1.00 / 1.00 | 0.97 / 0.93 | 0.97 / 0.95 |
| canonical 1.00 | 0.96 / 0.95 | **1.00 / 1.00** | 0.63 / 0.38 | 0.41 / 0.40 |
| canonical 1.40 | 0.43 / 0.16 | 0.17 / 0.09 | 0.30 / 0.03 | 0.11 / 0.00 |
| uneven 0.35 | 1.00 / 1.00 | 1.00 / 1.00 | 0.40 / 0.00 | 1.00 / 1.00 |
| uneven 0.70 | 0.40 / 0.00 | **1.00 / 1.00** | 0.40 / 0.00 | 0.99 / 0.95 |
| uneven 1.00 | 0.40 / 0.00 | **0.91 / 0.85** | 0.42 / 0.00 | 0.46 / 0.23 |
| uneven 1.40 | 0.42 / 0.00 | 0.40 / 0.00 | 0.49 / 0.00 | 0.39 / 0.00 |

Window ARI, mean over windows, on the real benchmarks (window 50):

| | glioma | mll | lung2 | prostate | appliances | eog |
|---|---|---|---|---|---|---|
| original | 0.371 | 0.359 | 0.283 | 0.025 | 0.005 | 0.037 |
| relative density | 0.344 | 0.345 | 0.354 | 0.027 | 0.005 | 0.030 |

(window-to-window std is 0.01–0.13, so none of these differences is larger
than the spread.)

**Findings.**

1. **Relative density is the fix for small groups.** On `uneven` it recovers
   every emerging and forgetting event up to spread 0.7 and 85% of boundaries
   exactly at 1.0, where the original recovers none; on `canonical` it is
   exact at 1.0 where the original is at 0.95.
2. **It costs robustness at high noise.** At spread 1.4 every local bump in
   noise is a peak of relative density 1, and event F1 falls below the
   original's. The two densities trade sensitivity to small groups against
   resistance to noise; neither dominates.
3. **The KPCA scaling hypothesis was wrong.** `√λ` is worse everywhere it
   differs — it loses the small group even at spread 0.35. Eigenvalue
   weighting suppresses the many small-eigenvalue noise axes more than the
   few that separate groups, which is what K-R-DPC needs. T4 is answered: the
   original's `λ v` stays, now for a measured reason rather than by inheritance.
4. On the real benchmarks the choice makes no difference beyond window-to-window
   spread. The default stays the original; `density="relative"` is recommended
   where small groups are the point — the emerging/forgetting case.

## T3 — MONIC's transitions next to the Dice events

`cedfs/transitions.py` reads consecutive partitions the way MONIC does
(Spiliopoulou et al., KDD 2006): an asymmetric overlap |X ∩ Y| / |X| and five
external transitions — survive, absorb, split, disappear, emerge — with the
clusTransition defaults τ = 0.7, τ_split = 0.3. `experiments/transitions.py`
derives the truth in each vocabulary from the perfect per-window partitions
and scores the detector's partitions (relative density) against both.

What each vocabulary says about the placed boundaries:

| stream, boundary | what was placed | Dice (CED-FS) | MONIC |
|---|---|---|---|
| canonical 2→3 | class 3 separates from class 2 (30 + 30) | stable 1, **drift 1** | survive 1, **split 1** |
| canonical 4→5 | class 2 merges into class 1 | stable 1, **drift 2** | survive 1, **absorb 2** |
| uneven 1→2 | small class 2 (6) leaves class 1 (60) | stable 1, drift 1, emerging 1 | survive 2, emerge 1 |
| uneven 2→3 | class 2 rejoins class 1 | stable 1, drift 1, **forgetting 1** | survive 1, **absorb 2** |

Exact boundaries, 20 seeds: identical for both up to spread 1.0 (canonical
1.00 / 1.00, uneven 0.85 / 0.85 at 1.0); at 1.4 canonical 0.09 (Dice) against
0.17 (MONIC), uneven 0 / 0.

**Finding.** On the same partitions MONIC is as accurate and says more: the
split and the merge that Dice can only call drift (THEORY.md P2) are named,
and the small class rejoining its neighbour — "forgetting" to Dice, as if a
concept were lost — is an absorption, which is what happened. The original
events stay the default for fidelity; `boundary_transitions` is offered next
to them, and the fleet reading benefits most: "units 1–12 split off" and "two
operating modes merged" are the sentences an operator needs.

## E2 — Other clusterers under the same rules

`cedfs/baselines.py` gives three per-window clusterers with the K-R-DPC
interface, so the Dice events and MONIC transitions read all of them the same
way (`experiments/baselines.py`):

- **k-means**, k ∈ 2..6 by silhouette — the applied default; like K-R-DPC it
  cannot return one cluster;
- **HDBSCAN** (Campello, Moulavi & Sander, PAKDD 2013) — parameter-light
  density clustering that can return one cluster; noise points form a group;
- **evolutionary** — k-means seeded with the previous window's partition, the
  temporal-smoothness idea of Chakrabarti, Kumar & Tomkins (KDD 2006) and
  Chi et al.'s PCQ (KDD 2007) adapted to a feature stream, where the previous
  centroids live in other columns but the previous partition does not.

### Synthetic streams (20 seeds; exact boundaries, Dice / MONIC)

| stream, spread | K-R-DPC | K-R-DPC relative | k-means | HDBSCAN | evolutionary |
|---|---|---|---|---|---|
| canonical 0.70 | 1.00 / 1.00 | 1.00 / 1.00 | 0.50 / 0.50 | 0.50 / 0.50 | 1.00 / 0.75 |
| canonical 1.00 | 0.95 / 0.95 | **1.00 / 1.00** | 0.50 / 0.50 | 0.50 / 0.50 | 1.00 / 0.75 |
| canonical 1.40 | 0.16 / 0.29 | 0.09 / 0.17 | 0.50 / 0.50 | 0.50 / 0.50 | 0.25 / 0.25 |
| uneven 0.70 | 0.00 / 0.00 | 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 | 0.00 / 0.00 |
| uneven 1.00 | 0.00 / 0.00 | 0.85 / 0.85 | 0.00 / 0.00 | **1.00 / 1.00** | 0.00 / 0.00 |
| uneven 1.40 | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 / 0.00 | **1.00 / 1.00** | 0.00 / 0.00 |

Full table, with window ARI and event F1: `experiments/results/baselines_synthetic.json`.

### Tennessee Eastman fleet (17 detectable faults, means)

| clusterer | screened | FAR before fault | detection | FAR on normals after |
|---|---|---:|---:|---:|
| K-R-DPC | no | 0.315 | 0.52 | 0.197 |
| K-R-DPC relative | no | 0.270 | 0.50 | 0.154 |
| k-means | no | 0.436 | 0.56 | 0.239 |
| HDBSCAN | no | 0.134 | 0.22 | 0.024 |
| evolutionary | no | 0.665 | 0.79 | 0.569 |
| K-R-DPC | yes | 0.000 | 0.62 | 0.023 |
| K-R-DPC relative | yes | 0.000 | 0.65 | 0.017 |
| k-means | yes | 0.000 | 0.65 | 0.019 |
| HDBSCAN | yes | 0.000 | 0.48 | 0.024 |
| evolutionary | yes | 0.000 | **0.67** | 0.036 |

### Findings

1. **No clusterer wins everywhere, and the losses are structural.** k-means
   and HDBSCAN score exactly 0.50 on `canonical` at every noise level: in
   window 4 class 2 sits 1.2 from class 1 while class 3 is 8 away, and both
   merge the near pair — silhouette and HDBSCAN's cluster stability both
   prefer the coarse scale. K-R-DPC, whose centres are chosen on ρδ, is the
   only one to keep the near pair apart. On `uneven`, HDBSCAN is the only
   method that keeps the 6-object class at every noise level — its density is
   defined relative to the mutual-reachability hierarchy, which is the same
   cure relative density applies to K-R-DPC (E5), done more robustly.
2. **Temporal smoothness suppresses exactly the events the method is for.**
   Evolutionary k-means never reports the small class emerging: seeding from
   the previous partition keeps it inside its old group. The smoothing that
   evolutionary clustering adds to resist noise is a prior *against* concept
   evolution; it suits tracking stable groups, not detecting new ones.
3. **On the industrial fleet, screening matters and the clusterer barely
   does.** Unscreened, every clusterer is unusable as a monitor (13–67% of
   pre-fault run-windows alarm; HDBSCAN's lower rate comes with 0.22
   detection). Screened, every one has zero pre-fault alarms and detection
   between 0.62 and 0.67, HDBSCAN aside at 0.48. Once the window is reduced to
   the variables that split the fleet, the grouping is easy; deciding *which*
   variables and *whether* anything splits is the hard part, and that is what
   screening does.

**Consequence for the method.** K-R-DPC stays: it is the only clusterer that
resolves near groups next to far ones, which a fleet with several operating
modes will have, and with screening it is as good as any alternative on TEP.
The README should present screening, not the clusterer, as what turns the
method into a monitor. HDBSCAN is the stronger choice when small emerging
groups matter most and groups are well separated in scale; that is offered
through `cedfs.baselines` rather than made the default.

## E4 — Running time

Three changes to the reference implementation, each checked to leave every
partition unchanged — all 231 windows of glioma, mll and eog are identical
label for label before and after:

- the KPCA kernel matrix is computed at once (`kernel.kernel_matrix`, scipy
  `cdist`) instead of by n² calls to `k_kernel`, which stays as the definition;
- the double centring `K − 1K − K1 + 1K1` is written as row and column means
  instead of three n × n products;
- the kNN graph is read from the distance matrix the algorithm computes anyway
  (`_knn_from_distances`) instead of a KD-tree, which in the ~n/3 dimensions
  KPCA leaves is slower than a sort.

One K-R-DPC call, single thread, uniform data with 50 features:

| n | before | after |
|---:|---:|---:|
| 100 (× 1 040 features, a TEP window) | — | 0.010 s |
| 362 (eog) | 0.98 s | 0.034 s |
| 1 000 | — | 0.38 s |
| 2 000 | — | 2.6 s |
| 4 000 | 48 s (vectorised kernel only) | 20 s |

What is left is cubic by design: the method keeps n/3 kernel components, so
both the eigendecomposition and the distances in the reduced space cost
O(n³). A partial eigensolver for the top n/3 pairs (LAPACK syevr) was tried
and saves nothing — the tridiagonal reduction dominates either way. For a
fleet of a few hundred to a thousand units a window takes under half a second.
Beyond that the route is a Nyström approximation of the kernel (Williams &
Seeger, NIPS 2001) with a fixed number of components, which would change
results and belongs behind an option.

## T5 — Screening inside CED_FS, and where it does not belong

`CED_FS` now takes `density` and `screenAlpha` in `algorithm_params` (both
off by default, so the port and the server's checks are unaffected). With
`screenAlpha`, each column of a window is a variable observed once per sample
and the window is screened as IF-PCA screens features (Jin & Wang 2016).

On the bundled benchmarks it **hurts** (window ARI against the labels, window
50; columns kept out of 50 in brackets):

| dataset | no screening | α = 0.05 | α = 0.001 |
|---|---|---|---|
| glioma | **0.371** | 0.058 (8) | 0.045 (6) |
| mll | **0.359** | 0.257 (13) | 0.220 (9) |
| lung2 | **0.283** | 0.206 (16) | 0.171 (12) |
| prostate | 0.025 | 0.025 (22) | 0.025 (18) |
| car | **0.066** | 0.052 (19) | 0.051 (15) |
| eog | **0.037** | 0.024 (45) | 0.025 (42) |

The premise of screening is that a column with no group structure is
Gaussian across the objects. That holds for a fleet of like units — it is
what makes the Tennessee Eastman result — and it does not hold for gene
expression, whose columns are skewed and heavy-tailed whether or not they
separate the classes. The test then keeps the skewed noise and drops the
informative columns. IF-PCA itself works on such data because it standardises
and thresholds by Higher Criticism for rare, weak signals, a regime these
min-max-normalised windows of 50 are not in. The option is documented as
meant for fleets, and stays off for the benchmarks.

## E3 — Threshold and kernel (synthetic streams)

Protocol of E1, relative density, 20 seeds, spreads 0.7 and 1.0
(`experiments/results/protocol_tau*.json`, `protocol_kernel*.json`). Exact
boundaries:

| | canonical 0.7 | canonical 1.0 | uneven 0.7 | uneven 1.0 |
|---|---:|---:|---:|---:|
| τ = 0.3 | 1.00 | 1.00 | 1.00 | 0.85 |
| τ = 0.5 | 1.00 | 1.00 | 1.00 | 0.85 |
| τ = 0.7 | 1.00 | 1.00 | 1.00 | 0.85 |
| kernel 1, Gaussian | **1.00** | **1.00** | **1.00** | 0.85 |
| kernel 2, polynomial (degree σ = 6) | 0.00 | 0.00 | 0.00 | 0.00 |
| kernel 3, linear | 0.00 | 0.00 | 0.00 | 0.00 |
| kernel 4, exponential | 0.50 | 0.50 | 1.00 | **1.00** |
| kernel 5, Laplacian | 0.95 | 0.57 | 1.00 | 0.95 |

1. **τ does not matter here, and THEORY.md P2 says why.** The overlaps that
   occur at these boundaries are 1 (stable), 2/3 (a split of equals), and
   2·6/66 ≈ 0.17 (the small class leaving); no value of τ between 0.3 and 0.7
   reclassifies any of them. τ matters only for overlaps near it, i.e. for
   partial reassignments of a few objects, and then it decides drift against
   forgetting — the threshold is a naming convention more than a parameter.
2. **The kernel matters most.** Linear and polynomial kernels lose every event
   (the polynomial with σ read as the degree, 6, is badly conditioned on
   min-max data). The exponential kernel keeps the small class and loses the
   near pair; the Laplacian is between. The Gaussian is the default for a
   reason, and the one to keep.

TEP-side sensitivity (window, α, σ, p) is in INDUSTRIAL.md.

### Nyström, for fleets of thousands

`k_r_dpc(..., landmarks=m)` replaces the exact KPCA by a Nyström
approximation (Williams & Seeger, NIPS 2001; `k_pca_nystrom`): m random
landmarks, F = K_nm U_m Λ_m^(-1/2), centred, and the eigenpairs from the SVD of
the n × m matrix — O(n m²) instead of O(n³), with the original's eigenvalue
weighting of the scores kept. Off by default. Four separated groups in 50
dimensions, single thread:

| n | exact | m = 200 | m = 500 | ARI, all three |
|---:|---:|---:|---:|---|
| 1 000 | 0.39 s | 0.26 s | 0.33 s | identical |
| 2 000 | 2.4 s | 0.97 s | 1.5 s | identical |
| 4 000 | 19.4 s | 4.5 s | 8.1 s | identical |
| 8 000 | — (memory and time) | 34 s | 35 s | — |

The partitions match the exact ones' quality at every size tried. What is left
at 8 000 is quadratic, not cubic — the n × n distances that density peaks
needs for δ — so the next step past ten thousand units is a neighbour index,
not a better eigensolver.
