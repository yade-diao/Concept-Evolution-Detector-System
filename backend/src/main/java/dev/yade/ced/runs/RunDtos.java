package dev.yade.ced.runs;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What crosses the wire for runs.
 *
 * Records, so they are immutable and carry no behaviour, and bean-validated so a
 * bad value is refused at the edge with the offending field named. The bounds
 * are the algorithm's: `neighbourFraction` is a fraction of the window used as a
 * neighbourhood size, so 1.5 is not a slow setting but a meaningless one, and
 * `similarityThreshold` separates drift from a new concept, so it lives in
 * [0, 1]. Rejecting those here is the difference between a 400 naming the field
 * and a result computed from nonsense.
 */
public final class RunDtos {

    private RunDtos() {
    }

    public record Parameters(
            @NotNull @Min(1) @Max(5) Short kernelType,
            @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("1000") Double sigma,
            @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("1") Double neighbourFraction,
            @NotNull @DecimalMin("0") @DecimalMax("1") Double similarityThreshold,
            @NotNull @Min(2) @Max(100000) Integer windowSize) {
    }

    /**
     * Starting a run.
     *
     * The stream itself never arrives: the client computes in the browser, so
     * the server is told the shape of the data and never sees it. That is worth
     * stating because it is why there is no upload endpoint — the data does not
     * leave the machine that produced it.
     */
    public record CreateRun(
            @NotBlank @Size(max = 200) String datasetName,
            @NotNull @Min(2) Integer samples,
            @NotNull @Min(1) Integer features,
            @NotNull @Valid Parameters parameters) {
    }

    public record ProgressUpdate(@NotNull @Min(0) Integer windowsDone) {
    }

    /**
     * The outcome. Exactly one of the two shapes is sent, which the server
     * checks rather than trusts — a body carrying both a Rand Index and an error
     * describes a run that both succeeded and failed.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SubmitResult(
            Double bestRandIndex,
            List<Integer> clusterCounts,
            Map<String, List<Integer>> events,
            String error) {

        public boolean claimsSuccess() {
            return bestRandIndex != null || clusterCounts != null || events != null;
        }

        public boolean claimsFailure() {
            return error != null && !error.isBlank();
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RunView(
            UUID id,
            RunState state,
            String datasetName,
            int samples,
            int features,
            Parameters parameters,
            int windowsTotal,
            int windowsDone,
            Double bestRandIndex,
            List<Integer> clusterCounts,
            Map<String, List<Integer>> events,
            String error,
            Instant createdAt,
            Instant finishedAt) {

        public static RunView of(Run run) {
            return new RunView(
                    run.getId(),
                    run.getState(),
                    run.getDatasetName(),
                    run.getSamples(),
                    run.getFeatures(),
                    new Parameters(run.getKernelType(), run.getSigma(), run.getNeighbourFraction(),
                            run.getSimilarityThreshold(), run.getWindowSize()),
                    run.getWindowsTotal(),
                    run.getWindowsDone(),
                    run.getBestRandIndex(),
                    run.getClusterCounts(),
                    run.getEvents(),
                    run.getError(),
                    run.getCreatedAt(),
                    run.getFinishedAt());
        }
    }

    /** A listing row. The result can be large and nothing scanning a list needs it. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RunSummary(
            UUID id,
            RunState state,
            String datasetName,
            int windowsTotal,
            int windowsDone,
            Double bestRandIndex,
            Instant createdAt,
            Instant finishedAt) {

        public static RunSummary of(Run run) {
            return new RunSummary(run.getId(), run.getState(), run.getDatasetName(),
                    run.getWindowsTotal(), run.getWindowsDone(), run.getBestRandIndex(),
                    run.getCreatedAt(), run.getFinishedAt());
        }
    }
}
