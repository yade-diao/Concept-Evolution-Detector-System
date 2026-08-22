package dev.yade.ced.runs;

import dev.yade.ced.auth.User;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Runs, addressed by id and always scoped to the caller.
 *
 * The compute happens in the browser: the client creates a run, reports progress
 * as it works through the windows, and submits the outcome. Nothing here touches
 * the data being analysed — it never leaves the machine that loaded it.
 */
@RestController
@RequestMapping("/api/v1/runs")
public class RunController {

    private static final int MAX_PAGE_SIZE = 100;

    private final RunService runs;

    public RunController(RunService runs) {
        this.runs = runs;
    }

    @PostMapping
    public ResponseEntity<RunDtos.RunView> create(@AuthenticationPrincipal User me,
                                                  @Valid @RequestBody RunDtos.CreateRun request) {
        Run run = runs.create(me, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(RunDtos.RunView.of(run));
    }

    @GetMapping
    public List<RunDtos.RunSummary> list(@AuthenticationPrincipal User me,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        // Clamped rather than rejected: a caller asking for 10 000 rows wants as
        // many as it can have, and refusing the request helps nobody.
        int bounded = Math.clamp(size, 1, MAX_PAGE_SIZE);
        return runs.list(me, PageRequest.of(Math.max(0, page), bounded))
                .map(RunDtos.RunSummary::of)
                .toList();
    }

    @GetMapping("/{id}")
    public RunDtos.RunView get(@AuthenticationPrincipal User me, @PathVariable UUID id) {
        return RunDtos.RunView.of(runs.get(me, id));
    }

    @PatchMapping("/{id}/progress")
    public RunDtos.RunView progress(@AuthenticationPrincipal User me, @PathVariable UUID id,
                                    @Valid @RequestBody RunDtos.ProgressUpdate update) {
        return RunDtos.RunView.of(runs.reportProgress(me, id, update.windowsDone()));
    }

    @PostMapping("/{id}/result")
    public RunDtos.RunView result(@AuthenticationPrincipal User me, @PathVariable UUID id,
                                  @Valid @RequestBody RunDtos.SubmitResult result) {
        return RunDtos.RunView.of(runs.submitResult(me, id, result));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal User me, @PathVariable UUID id) {
        runs.delete(me, id);
    }

}
