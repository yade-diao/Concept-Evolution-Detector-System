# Datasets

Eight high-dimensional benchmarks, bundled so the system has something to run on
without asking anyone to find data first.

| file | samples | features | classes |
|---|---:|---:|---:|
| `arcene` | 100 | 10 000 | 2 |
| `car` | 174 | 9 182 | 11 |
| `dlbcl` | 77 | 6 285 | 2 |
| `gisette` | 1 000 | 5 000 | 2 |
| `glioma` | 50 | 4 434 | 4 |
| `lung2` | 203 | 3 312 | 5 |
| `mll` | 57 | 5 848 | 3 |
| `prostate` | 102 | 5 966 | 2 |

Each is a pair: `<name>.mat` holding the feature matrix and `<name>_label.mat`
holding one class label per sample.

## Provenance

These are public benchmarks, redistributed here for reproducibility rather than
claimed as original. `arcene` and `gisette` come from the NIPS 2003 feature
selection challenge; `dlbcl`, `glioma`, `lung2`, `mll` and `prostate` are gene
expression sets widely circulated through the ASU feature selection repository;
`car` is an image set from the same collection. `real_sim`, used in the original
work, is 34 MB and is left out — download it separately if you need it.

## What these are, and are not, evidence for

**They are not feature streams.** Their columns are gene indices and pixel
positions, in no order that means anything: column 7 is not earlier than column
8. Walking the columns imposes an arrival order the data never had.

That matters, and it is measurable. Shuffling the column order and re-running
the detector produces the same answer:

| | observed | with columns shuffled |
|---|---|---|
| glioma, best Rand Index | 0.7976 | 0.7984 (0.7886 – 0.8065 over 5 shuffles) |
| glioma, drift events | 471 | 478 ± 3 |
| mll, best Rand Index | 0.8089 | **0.8420** |
| mll, drift events | 521 | 478 ± 15 |

The observed values sit inside the shuffled range, and on `mll` a random column
order scores *higher* than the real one. Whatever the detector reports on these
sets describes the ordering that was imposed, not evolution the data contains.

This is a limit of the benchmarks, not of the method. To test detection itself,
a stream needs an order that means something — which is what
`cedfs.synthetic.make_stream` builds, placing the events deliberately so there is
an answer to score against.

## Using your own

Upload a pair of `.mat` files through the web interface, or point the experiment
runner at any directory holding the same shape: a 2-D feature matrix and a label
vector with one entry per sample. Either orientation is accepted — whichever axis
matches the label count is taken as the sample axis.
