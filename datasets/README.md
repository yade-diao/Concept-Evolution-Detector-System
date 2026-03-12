# Datasets

This directory is the expected location for `.mat` dataset files.  
The files are **not tracked** in this repository (see `.gitignore`) because of their size.

## Supported Datasets

| File pattern | Description | # Samples | # Features | # Classes |
|---|---|---|---|---|
| `glioma.mat` / `glioma_label.mat` | Glioma gene expression | 50 | 4,434 | 4 |
| `lung2.mat` / `lung2_label.mat` | Lung cancer microarray | 203 | 3,312 | 5 |
| `mll.mat` / `mll_label.mat` | MLL Leukemia | 72 | 12,582 | 3 |
| `dlbcl_data.mat` / `dlbcl_label.mat` | DLBCL Lymphoma | 77 | 7,129 | 2 |
| `prostate_data.mat` / `prostate_label.mat` | Prostate cancer | 102 | 12,600 | 2 |
| `gisette.mat` / `gisett_label.mat` | Gisette handwriting | 6,000 | 5,000 | 2 |
| `arcene.mat` / `arcene_label.mat` | Arcene cancer mass-spec | 100 | 10,000 | 2 |
| `car.mat` / `car_label.mat` | Car evaluation | 1,728 | 6 | 4 |
| `real_sim.mat` / `real_sim_label.mat` | Real-Sim text | 72,309 | 20,958 | 2 |

## File Format

Each dataset is stored as a MATLAB `.mat` file:

- **Feature matrix** – variable named `data`, shape `(n_samples, n_features)`.
- **Label vector**   – variable named `label`, shape `(n_samples, 1)`.

## Download Sources

Several of these datasets originate from the following public repositories:

- [UCI Machine Learning Repository](https://archive.ics.uci.edu/)
- [LIBSVM Data](https://www.csie.ntu.edu.tw/~cjlin/libsvmtools/datasets/)
- [Gene Expression Omnibus (GEO)](https://www.ncbi.nlm.nih.gov/geo/)

After downloading, place the `.mat` files in this directory before running experiments.
