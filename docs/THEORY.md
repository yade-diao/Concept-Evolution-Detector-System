# Theory

What CED-FS computes, stated precisely, and what follows from the definitions
alone — before any data is run. Each proposition below is either checked by a
test or measured in an experiment; the reference is given with it.

## 1. Setting

A fixed set of objects `U = {1, …, n}` (patients, appliances, engines,
simulation runs) is observed by a stream of features `f_1, f_2, …` that arrive
in order. A window of width `w` is the block of columns

    W_t = [f_{(t-1)w+1}, …, f_{tw}],   t = 1 … T,   T = round(d / w)

and every window sees **every object** — the objects do not change, only the
features describing them. A clustering of window `t` is a partition
`P_t = {C^t_1, …, C^t_{k_t}}` of `U`.

This is MONIC's setting (Spiliopoulou et al., 2006) with "time point" read as
"window of columns". It is not the novel-class setting of Masud et al., where
instances arrive and features are fixed (see [RELATED_WORK.md](RELATED_WORK.md)).

## 2. The overlap matrix and the four events

For consecutive partitions the Dice overlap is

    S_t[i, j] = 2 |C^{t-1}_i ∩ C^t_j| / (|C^{t-1}_i| + |C^t_j|)  ∈ [0, 1]

Because both partitions are of the same `U`, the intersection is well defined
— this is what the feature axis buys. With threshold `τ` (default 0.5), for
each past cluster `A = C^{t-1}_i`, with `s_A = max_j S_t[i, j]`:

| event | condition |
|---|---|
| stable | `s_A = 1` |
| drift | `τ ≤ s_A < 1` |
| forgetting | `s_A < τ` |

and for each current cluster `B = C^t_j` with `s_B = max_i S_t[i, j]`:

| event | condition |
|---|---|
| emerging | `s_B < τ` |

## 3. Consequences of the definitions

Write `a = |A|`, `b = |B|`, `m = |A ∩ B|`.

**P1 (stable is identity).** `S[i, j] = 1` iff `m = a = b`, i.e. `A = B` as
sets. A single object changing groups turns every cluster it touches from
stable into drift. *Checked by `tests/test_synthetic.py`.*

**P2 (Dice is bounded by the size ratio).** `S[i, j] ≤ 2 min(a, b) / (a + b)`.
So with `r = b / a`:

- `A` contained whole in a bigger `B` (an absorption, MONIC's merge) has
  `S = 2 / (1 + r)`, which is below `τ = 0.5` once `r > 3`. **A merge into a
  cluster more than three times larger is reported as forgetting, not drift.**
- `A` split into two parts with fractions `q` and `1 − q` has best overlap
  `2 max(q, 1−q) / (1 + max(q, 1−q)) ≥ 2/3`. **A split is never forgetting at
  τ = 0.5; it is always drift**, however it divides.
- A part `B ⊂ A` with `b < a/3` scores below `τ`, so a small group breaking
  away from a large one is reported as **emerging**, and the large one
  survives as drift.

This is why the README's "uneven" stream is the only one on which emerging and
forgetting appear: with equal class sizes every boundary is drift (r = 1),
whatever happens. The four events are therefore not a partition of what can
happen to a cluster; they are a reading of the overlap magnitude, and split and
merge are invisible as such. MONIC's split/absorb types (T3) are the fix.

**P3 (a homogeneous fleet still produces events).** The centre selection never
returns fewer than two clusters (`min_clusters = 2` in `k_r_dpc`). When the
objects genuinely form one group, each window's partition is decided by noise,
and two independent noise partitions almost never coincide, so by P1 **no
boundary is stable**. What is reported instead depends on the sizes. Two
independent halvings give, for a half `A`, overlaps `m` and `n/2 − m` with the
two new halves, so `s_A = 2 max(m, n/2 − m) / n ≥ 1/2`: always drift, never
forgetting. But density peaks on structureless data tend to pick a second centre
in a sparse fringe, giving a small cluster; by P2 a fringe cluster under a
third of its neighbour's size is reported as emerging when it appears and as
forgetting when it goes. **On a fleet with no structure the detector reports
drift at every boundary, plus emerging/forgetting pairs whenever the noise
clusters are small.** This is the false-alarm behaviour to expect before a
fault, and the Tennessee Eastman experiment (ROADMAP I1) measures it. It also
says what a fix must do: decide *whether there is more than one cluster*
before reading events.

**P4 (events are invariant to relabelling, not to the window grid).** `S` is
invariant to permuting cluster labels and to permuting objects consistently in
both windows. It is not invariant to shifting the window grid: an event that
falls on a window boundary is seen at once, one that falls mid-window is
smeared over two boundaries. Detection delay is therefore quantised to `w`.

**P5 (the Rand Index rewards over-segmentation).** RI counts object pairs that
are separated in both partitions as agreement. With `K` balanced classes,
splitting every class in two raises the separated-pair count and RI with it.
Hence the project reports the adjusted Rand Index (ARI) and NMI alongside RI
(ROADMAP E1), and the centre-selection rule was chosen on ARI.

**P6 (screening bounds the false-alarm rate).** Screening (in
`cedfs/algorithm/screening.py`, after IF-PCA, Jin & Wang 2016) tests each
variable's per-object window mean and log-spread for normality across the
objects, at level `α / 2V` for `V` variables, and calls a window one cluster
when nothing is selected. If the objects are independent and every summary is
Gaussian across them — what "no structure" means for a fleet of like units —
then by the union bound `P(window selects anything) ≤ α`, and by P1 a window
called one cluster next to another called one cluster is *stable*. So the
event stream before a fault is "stable" except with probability `≤ α` per
window. The bound is only as good as the Gaussian assumption: on Tennessee
Eastman fault-free fleets the measured rate is 5.7% at α = 1%, the excess
coming from a few variables with heavier tails. Sample-and-hold analysers are
the one case handled specially: their window spread is discrete, so it is not
tested (`held`).

The SigClust gate (`significance.py`, Liu et al. 2008) answers the same
question differently — is the partition tighter than one Gaussian with the
window's own spectrum? — and has the same kind of guarantee, but on wide
windows it is too conservative to be useful: on Tennessee Eastman it removes
every pre-fault alarm and most of the detections with them.

## 4. What is not claimed

- The method's KPCA projection uses `K_c v` (eigenvalue-scaled) where the
  textbook uses `√λ v`. Both give the same subspace; they weight the axes
  differently before density estimation. This is inherited from the MATLAB
  original; ablated in EXPERIMENTS.md E5, where `√λ` is worse everywhere it
  differs, so the original stays for a measured reason.
- Nothing above depends on labels. Labels are used only to score.
