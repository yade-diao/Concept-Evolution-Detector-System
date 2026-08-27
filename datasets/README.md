# Datasets

Ten benchmarks, bundled so the system has something to run on without asking
anyone to find data first.

## The two that are feature streams

Their columns are time, in order, which is the case the method is about. A
window of columns is therefore an interval, and a change between two windows is
concept evolution rather than an artefact of how the columns happen to be
arranged.

| file | samples | features | classes | one column is |
|---|---:|---:|---:|---|
| `appliances` | 750 | 720 | 3 | one two-minute power reading, from midnight |
| `eog` | 362 | 1 250 | 6 | one millisecond of gaze position, at 1 kHz |

`appliances` is one appliance per row, monitored for a day; `eog` is one trial
per row of somebody writing a katakana stroke with their eyes. Both come from
the UCR/UEA time series classification archive.

## The eight that are not

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

Their columns are gene indices and pixel positions, in no order that means
anything. They test the clustering, the event rules and one implementation
against another — not whether the method finds drift, because there is none in
them to find. `manifest.json` records which is which, and the interface says so
on the card before you run one.

Each dataset is a pair: `<name>.mat` holding the feature matrix and
`<name>_label.mat` holding one class label per sample. `manifest.json` carries
the shapes, what a row and a column are, whether the columns are ordered, and
where each came from.

## Provenance

These are public benchmarks, redistributed here for reproducibility rather than
claimed as original. `arcene` and `gisette` come from the NIPS 2003 feature
selection challenge; `dlbcl`, `glioma`, `lung2`, `mll` and `prostate` are gene
expression sets widely circulated through the ASU feature selection repository;
`car` is an image set from the same collection. `appliances` (UK-DALE) and `eog`
(Fang & Shinozaki) come from the UCR/UEA time series classification archive.
`real_sim`, used in the original work, is 34 MB and is left out — download it
separately if you need it.

## Why they are committed rather than downloaded

Because for three of them there is nowhere to download from. `car`, `glioma`,
`lung2` and `prostate` are available at exactly these shapes from the
scikit-feature repository, and `arcene` at exactly this shape from OpenML — all
with permissive CORS headers, so a browser could fetch them. But `dlbcl` here is
77 x 6 285 and `mll` is 57 x 5 848, and no public source carries either at that
shape: OpenML's versions of the same studies are 77 x 5 469 and 72 x 12 582,
differently gene-filtered, and for MLL the full set rather than the training
split. `gisette` at exactly this shape exists only at UCI and LIBSVM, neither of
which sends an `Access-Control-Allow-Origin` header at all.

So the files are here, 23 MB of them, and the deployment serves them from the
same origin as the page. Note the two provenance caveats when citing: this
`arcene` is the NIPS 2003 challenge's *training* split and this `gisette` is its
*validation* split, not the full challenge sets.

## What these are, and are not, evidence for

This section is about the eight. `appliances` and `eog` are the answer to it:
they were added because everything below was true of the whole collection, and
a method about arrival order needs at least one dataset that has one.

**The eight are not feature streams.** Their columns are gene indices and pixel
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
