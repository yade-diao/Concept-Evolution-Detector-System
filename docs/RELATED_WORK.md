# Related work

Where CED-FS sits, what each neighbouring line of work detects, and what this
project borrows from it. The organising question is always the same one the
README starts from: **along which axis does the stream run?**

CED-FS fixes the samples and lets features arrive. A window is a block of
columns, every window clusters *the same objects*, and an event is a change in
how those objects group. That is a narrower setting than most of the
"concept evolution" literature, and a closer relative of evolutionary
clustering and cluster-transition monitoring than of novel-class detection.

## 1. The method's own lineage

| work | what it contributes here |
|---|---|
| Guo Yufeng, *面向特征流的概念演化检测方法研究* [D], Anhui University, 2023 | CED-FS itself: KPCA per window, K-R-DPC clustering, Dice overlap between consecutive partitions, four event types. The MATLAB original is the reference this port is held to. |
| Rodriguez & Laio, "Clustering by fast search and find of density peaks", *Science* 344, 2014 | Density peaks: local density ρ and distance-to-denser δ; centres are outliers in the (ρ, δ) decision graph. |
| KNN-DPC variants (Du et al., *KBS* 2016, and successors) | Replace the cut-off density with a k-nearest-neighbour one; K-R-DPC belongs to this family. |
| Schölkopf, Smola & Müller, "Nonlinear component analysis as a kernel eigenvalue problem", *Neural Computation*, 1998 | KPCA. The standard projection scales eigenvectors by √λ; the original code uses `K_c v` = λ v. Recorded as T4 / E3 rather than silently "fixed". |

## 2. Same objects, clustered again over time — the closest relatives

| work | axis | what it detects | borrowed |
|---|---|---|---|
| Spiliopoulou, Ntoutsi, Theodoridis & Schult, **MONIC**, KDD 2006 | objects re-observed at successive time points | external transitions: survive, split, absorb/merge, disappear, emerge; internal: location, compactness | the transition taxonomy (T3) and overlap thresholds (τ_survive 0.7, τ_split 0.3, as in the `clusTransition` R package) |
| Oliveira & Gama, **MEC**, *Intelligent Data Analysis* 2012 (and MClusT, 2010) | same | births, deaths, merges, splits, drawn as bipartite graphs between consecutive partitions; applied to Banco de Portugal balance sheets | the bipartite-graph reading the app already draws; a precedent for industrial/economic panel data |
| Chakrabarti, Kumar & Tomkins, **evolutionary clustering**, KDD 2006; Chi et al., evolutionary spectral clustering (PCQ/PCM), KDD 2007 | same | not events: a clustering that trades snapshot quality against temporal smoothness | a baseline (E2) and the argument for why window-by-window clustering is noisy and needs a smoothness or stability check |
| Xu, Kliger & Hero, *Adaptive evolutionary clustering*, DMKD 2014 | same | estimates the smoothing weight from data | the same, with a data-driven weight |

The feature-stream setting is, formally, MONIC's setting with the time points
being windows of columns. That gives the project a precise vocabulary and a
direct competitor to compare against.

## 3. Concept evolution as novel-class detection — a different axis

| work | axis | note |
|---|---|---|
| Masud, Gao, Khan, Han & Thuraisingham, *TKDE* 23(6), 2011 (ECSMiner; ECML-PKDD 2009 precursor) | **samples** arrive; features fixed | "concept evolution" = a new class appears among arriving instances, detected by cohesion and separation of unlabelled outliers. Same words, other axis. |
| Masud et al., DXMiner, "novel class detection of data streams in a dynamic feature space", ECML-PKDD 2010 | samples arrive, and the feature *vocabulary* changes | closest of this family, but still classifies arriving instances. |
| Hou, Zhang & Zhou, **FESL**, NeurIPS 2017; Zhang et al., ICML 2020 | samples arrive; sensors (features) are replaced over time | the industrial motivation is shared — sensors are added and retired — but the task is prediction, not event detection. |

These are cited so the README can say plainly what CED-FS is *not*: it does not
classify arriving instances and needs no labels to run.

## 4. Streaming feature selection — the other meaning of "feature stream"

| work | note |
|---|---|
| Wu, Yu, Wang, Ding & Zhu, **OSFS / Fast-OSFS**, ICML 2010, *TPAMI* 2013 | features arrive one at a time; keep strongly relevant, non-redundant ones. |
| Yu, Wu, Ding & Pei, **SAOLA**, *TKDD* 2016 | pairwise-only redundancy checks, scales to millions of features. |
| Zhou, Foster, Stine & Ungar, **Alpha-investing**, JMLR 2006 | streamwise regression with false-discovery control. |
| Yu et al., **LOFS** library, *KBS* 2016 | MATLAB implementations of the above. |

Same axis as CED-FS (features arrive, samples fixed), different goal (pick
features for a supervised model). Useful as a pre-filter in wide industrial
streams (E4) and as evidence that the feature-axis setting is an established one.

## 5. Change detection the detector should be compared against

| work | role |
|---|---|
| Page, "Continuous inspection schemes", *Biometrika* 1954 (Page-Hinkley / CUSUM) | change-point on a window statistic (E2 baseline). |
| Bifet & Gavaldà, **ADWIN**, SDM 2007 | adaptive-window change detection with guarantees. |
| PCA monitoring with Hotelling T² and SPE (MacGregor & Kourti, 1995; Chiang, Russell & Braatz, *Fault Detection and Diagnosis in Industrial Systems*, 2001) | the standard process-monitoring baseline on Tennessee Eastman (I1). |

## 6. Industrial data where "fixed fleet, columns are time" is literal

| data | rows | columns | ground truth |
|---|---|---|---|
| Tennessee Eastman process (Downs & Vogel, 1993; Braatz set; Rieth et al. 2017, Harvard Dataverse doi:10.7910/DVN/6C3JR1) | simulation runs, normal and 20 fault types | 3-minute samples of 52 variables | fault introduced at a known step (hour 1 in training runs, hour 8 in testing runs) |
| NASA C-MAPSS turbofan (Saxena et al., PHM 2008) | engines | operating cycles × 21 sensors | run-to-failure; remaining useful life per cycle |
| XJTU-SY bearings (Wang et al., *IEEE Trans. Reliability* 2020); IMS bearings | bearings | vibration snapshots over the life | failure time per bearing |
| Severson, Attia, Jin, Perkins, Jiang, Yang, Chen, Aykol, Herring, Fraggedakis, Bazant, Harris, Chueh & Braatz, *Nature Energy* 4, 2019 (data.matr.io) | 124 LFP/graphite cells, 72 fast-charge protocols | cycles | measured cycle life; the ΔQ₁₀₀₋₁₀(V) variance feature is the bar the unsupervised monitor is held to |
| Fleet condition monitoring: Hendrickx, Meert, Mollet, Gyselinck, Cornelis, Gryllias & Davis, *Mechanical Systems and Signal Processing* 139, 2020 (arXiv:1912.12941); wind-farm peer comparison | machines in a fleet | time | the framing: compare a unit with its peers online, no history needed; validated on electrical drivetrains |
| COSMO: Rögnvaldsson, Nowaczyk, Byttner, Prytz & Svensson, "Self-monitoring for maintenance of vehicle fleets", *DMKD* 32, 2018 | city buses (≈4 years of regular operation) | on-board models sent off-board | the fleet as the definition of normal; a unit's deviation accumulated over time before it is called — the model for `cedfs.fleet.persistent` |

The fleet framing is where CED-FS has a use beyond benchmarks: a set of units
observed together, and a question of *when the way they group changes* — a
unit leaving its peer group (emergence), two operating modes merging, a
group thinning out (forgetting).
