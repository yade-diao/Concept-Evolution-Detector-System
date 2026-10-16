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
