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
