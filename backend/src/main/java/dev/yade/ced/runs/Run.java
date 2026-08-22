package dev.yade.ced.runs;

import dev.yade.ced.auth.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One analysis, from the moment a client starts computing to the outcome it
 * reports.
 *
 * The transitions live here rather than in the service, because they are the
 * part that must hold no matter which caller asks. A run that has finished
 * cannot take progress, cannot be finished again, and cannot change its mind
 * about whether it succeeded — a REST layer that enforced that would be
 * enforcing it once per endpoint.
 */
@Entity
@Table(name = "runs")
public class Run {

    @Id
    private UUID id;

    /**
     * Lazy, and never serialised. A run is always fetched for a known owner —
     * the query filters by them — so loading the user alongside it would be a
     * join whose result is thrown away.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RunState state;

    @Column(name = "dataset_name", nullable = false)
    private String datasetName;

    @Column(nullable = false)
    private int samples;

    @Column(nullable = false)
    private int features;

    @Column(name = "kernel_type", nullable = false)
    private short kernelType;

    @Column(nullable = false)
    private double sigma;

    @Column(name = "neighbour_fraction", nullable = false)
    private double neighbourFraction;

    @Column(name = "similarity_threshold", nullable = false)
    private double similarityThreshold;

    @Column(name = "window_size", nullable = false)
    private int windowSize;

    @Column(name = "windows_total", nullable = false)
    private int windowsTotal;

    @Column(name = "windows_done", nullable = false)
    private int windowsDone;

    @Column(name = "best_rand_index")
    private Double bestRandIndex;

    /**
     * Read back whole and never queried by element, so jsonb rather than a side
     * table. The shape is the algorithm's, and giving it a schema here would
     * mean a migration every time the algorithm reports one more thing.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cluster_counts")
    private List<Integer> clusterCounts;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "events")
    private Map<String, List<Integer>> events;

    @Column(name = "error")
    private String error;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    protected Run() {
        // for JPA
    }

    private Run(UUID id, User owner, String datasetName, int samples, int features,
                short kernelType, double sigma, double neighbourFraction,
                double similarityThreshold, int windowSize, int windowsTotal, Instant createdAt) {
        this.id = id;
        this.owner = owner;
        this.state = RunState.RUNNING;
        this.datasetName = datasetName;
        this.samples = samples;
        this.features = features;
        this.kernelType = kernelType;
        this.sigma = sigma;
        this.neighbourFraction = neighbourFraction;
        this.similarityThreshold = similarityThreshold;
        this.windowSize = windowSize;
        this.windowsTotal = windowsTotal;
        this.windowsDone = 0;
        this.createdAt = createdAt;
    }

    /**
     * Start a run.
     *
     * `windowsTotal` is derived here from the stream length and the window, not
     * taken from the client. A caller that reported its own total could report a
     * progress bar that reaches 100% having analysed a third of the stream.
     */
    public static Run start(User owner, String datasetName, int samples, int features,
                            short kernelType, double sigma, double neighbourFraction,
                            double similarityThreshold, int windowSize, Instant now) {
        int windowsTotal = Math.max(1, samples / windowSize);
        return new Run(UUID.randomUUID(), owner, datasetName, samples, features,
                kernelType, sigma, neighbourFraction, similarityThreshold,
                windowSize, windowsTotal, now);
    }

    // ── transitions ─────────────────────────────────────────────────────────

    /**
     * Record how far the client has got.
     *
     * Monotonic: progress that goes backwards is refused rather than applied.
     * Two in-flight reports can arrive out of order, and the later-arriving
     * older one would otherwise make the bar jump back.
     */
    public void reportProgress(int windowsDone) {
        if (state.isFinished()) {
            throw new IllegalRunTransition("This run has already finished, so it cannot report progress.");
        }
        if (windowsDone < this.windowsDone) {
            throw new IllegalRunTransition(
                    "Progress cannot go backwards: this run is at %d of %d and was sent %d."
                            .formatted(this.windowsDone, windowsTotal, windowsDone));
        }
        if (windowsDone > windowsTotal) {
            throw new IllegalRunTransition(
                    "This run has %d windows and was sent progress for %d."
                            .formatted(windowsTotal, windowsDone));
        }
        this.windowsDone = windowsDone;
    }

    public void succeed(double bestRandIndex, List<Integer> clusterCounts,
                        Map<String, List<Integer>> events, Instant now) {
        requireUnfinished();
        this.state = RunState.SUCCEEDED;
        this.bestRandIndex = bestRandIndex;
        this.clusterCounts = List.copyOf(clusterCounts);
        this.events = Map.copyOf(events);
        this.windowsDone = windowsTotal;
        this.finishedAt = now;
    }

    public void fail(String reason, Instant now) {
        requireUnfinished();
        this.state = RunState.FAILED;
        this.error = reason;
        this.finishedAt = now;
    }

    /**
     * A finished run is final. Without this a client that retried a submission
     * — after a timeout it could not distinguish from a failure — would replace
     * a good result with a second one, and nothing would record that it had.
     */
    private void requireUnfinished() {
        if (state.isFinished()) {
            throw new IllegalRunTransition(
                    "This run already finished as %s. A result can only be submitted once."
                            .formatted(state));
        }
    }

    // ── reading ─────────────────────────────────────────────────────────────

    public UUID getId() {
        return id;
    }

    public User getOwner() {
        return owner;
    }

    public RunState getState() {
        return state;
    }

    public String getDatasetName() {
        return datasetName;
    }

    public int getSamples() {
        return samples;
    }

    public int getFeatures() {
        return features;
    }

    public short getKernelType() {
        return kernelType;
    }

    public double getSigma() {
        return sigma;
    }

    public double getNeighbourFraction() {
        return neighbourFraction;
    }

    public double getSimilarityThreshold() {
        return similarityThreshold;
    }

    public int getWindowSize() {
        return windowSize;
    }

    public int getWindowsTotal() {
        return windowsTotal;
    }

    public int getWindowsDone() {
        return windowsDone;
    }

    public Double getBestRandIndex() {
        return bestRandIndex;
    }

    public List<Integer> getClusterCounts() {
        return clusterCounts;
    }

    public Map<String, List<Integer>> getEvents() {
        return events;
    }

    public String getError() {
        return error;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }
}
