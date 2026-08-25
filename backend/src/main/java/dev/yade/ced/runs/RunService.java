package dev.yade.ced.runs;

import dev.yade.ced.auth.User;
import dev.yade.ced.auth.Role;
import org.springframework.beans.factory.annotation.Value;
import dev.yade.ced.common.GlobalExceptionHandler.NotFound;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RunService {

    /**
     * Concept evolution is measured between consecutive windows, so a stream
     * that yields one window can produce no events at all. Letting that through
     * gives a run that completes and reports nothing — which reads as a stream
     * that did not evolve rather than a window size that made evolution
     * impossible to observe.
     */
    private static final int MINIMUM_WINDOWS = 2;

    private final RunRepository runs;

    private final int runsPerUser;
    private final int runsPerGuest;

    public RunService(RunRepository runs,
                      @Value("${ced.limits.runs-per-user:200}") int runsPerUser,
                      @Value("${ced.limits.runs-per-guest:20}") int runsPerGuest) {
        this.runs = runs;
        this.runsPerUser = runsPerUser;
        this.runsPerGuest = runsPerGuest;
    }

    @Transactional
    public Run create(User owner, RunDtos.CreateRun request) {
        // A cap per account, not per request: the runs themselves are small,
        // but nothing else stops one signed-in client from creating them in a
        // loop until the disk is full. Guests get a smaller share, because a
        // guest is an account anyone can have for the asking.
        long held = runs.countByOwner(owner);
        int limit = owner.getRole() == Role.GUEST ? runsPerGuest : runsPerUser;
        if (held >= limit) {
            throw new QuotaExceeded(
                    ("You are keeping %d runs, which is the limit for this kind of account. "
                     + "Delete some and try again.").formatted(held));
        }

        var p = request.parameters();
        int windows = Run.windowCount(request.features(), p.windowSize());
        if (windows < MINIMUM_WINDOWS) {
            throw new IllegalArgumentException(
                    ("A window of %d leaves %d window(s) in a stream of %d features. Concept evolution "
                     + "is measured between consecutive windows, so at least %d are needed — use a "
                     + "smaller window.")
                            .formatted(p.windowSize(), windows, request.features(), MINIMUM_WINDOWS));
        }
        return runs.save(Run.start(owner, request.datasetName(), request.samples(), request.features(),
                p.kernelType(), p.sigma(), p.neighbourFraction(), p.similarityThreshold(),
                p.windowSize(), Instant.now()));
    }

    @Transactional(readOnly = true)
    public Page<Run> list(User owner, Pageable pageable) {
        return runs.findByOwnerOrderByCreatedAtDesc(owner, pageable);
    }

    @Transactional(readOnly = true)
    public Run get(User owner, UUID id) {
        return runs.findByIdAndOwner(id, owner)
                .orElseThrow(() -> new NotFound("No run with id " + id + "."));
    }

    @Transactional
    public Run reportProgress(User owner, UUID id, int windowsDone) {
        Run run = get(owner, id);
        run.reportProgress(windowsDone);
        return run;
    }

    @Transactional
    public Run submitResult(User owner, UUID id, RunDtos.SubmitResult result) {
        Run run = get(owner, id);

        if (result.claimsSuccess() && result.claimsFailure()) {
            throw new IllegalArgumentException(
                    "A result carries either an outcome or an error, not both.");
        }
        if (result.claimsFailure()) {
            run.fail(result.error(), Instant.now());
            return run;
        }
        if (result.bestRandIndex() == null || result.clusterCounts() == null || result.events() == null) {
            throw new IllegalArgumentException(
                    "A successful result needs bestRandIndex, clusterCounts and events. "
                    + "Send `error` instead to record a failure.");
        }
        // The client computed these, so their internal consistency is checked
        // here rather than assumed: a cluster count per window, and event counts
        // per boundary, of which there is one fewer than there are windows.
        List<Integer> counts = result.clusterCounts();
        if (counts.size() != run.getWindowsTotal()) {
            throw new IllegalArgumentException(
                    "This run has %d windows but the result reports %d cluster counts."
                            .formatted(run.getWindowsTotal(), counts.size()));
        }
        int boundaries = run.getWindowsTotal() - 1;
        for (Map.Entry<String, List<Integer>> entry : result.events().entrySet()) {
            if (entry.getValue().size() != boundaries) {
                throw new IllegalArgumentException(
                        "This run has %d window boundaries but '%s' reports %d entries."
                                .formatted(boundaries, entry.getKey(), entry.getValue().size()));
            }
        }
        run.succeed(result.bestRandIndex(), counts, result.events(), Instant.now());
        return run;
    }

    @Transactional
    public void delete(User owner, UUID id) {
        if (runs.deleteByIdAndOwner(id, owner) == 0) {
            throw new NotFound("No run with id " + id + ".");
        }
    }

    /** The account holds as many runs as it is allowed to. */
    public static class QuotaExceeded extends RuntimeException {
        public QuotaExceeded(String message) {
            super(message);
        }
    }
}
