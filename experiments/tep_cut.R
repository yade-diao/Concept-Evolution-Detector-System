# Cut the faulty Tennessee Eastman testing workspace down to the first R runs
# per fault and write it as raw float32, ordered (fault, run, sample, variable).
# Loading the 9.6 M-row workspace through pandas needs more memory than R does,
# so this step is R; experiments/tep_prepare.py reads its output.
#
#   docker run --rm -v ~/data/tep-rieth:/d -v "$PWD/experiments":/x r-base:4.4.1 \
#     Rscript /x/tep_cut.R /d/f3031243.RData /d/faulty50.f32 50
args <- commandArgs(trailingOnly = TRUE)
runs <- as.integer(args[3])
e <- new.env(); load(args[1], envir = e); x <- get(ls(e)[1], envir = e); rm(e); gc()
x <- x[x$simulationRun <= runs, ]; gc()
x <- x[order(x$faultNumber, x$simulationRun, x$sample), ]
m <- as.matrix(x[, 4:55]); storage.mode(m) <- "double"
con <- file(args[2], "wb"); writeBin(as.vector(t(m)), con, size = 4); close(con)
cat(dim(m), "\n")
