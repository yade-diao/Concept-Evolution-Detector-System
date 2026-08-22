package dev.yade.ced.runs;

/**
 * Where a run is.
 *
 * The compute happens in the browser, so the server never moves a run forward on
 * its own: the client reports progress and then submits an outcome. That makes
 * the transitions worth naming, because the interesting cases are the ones a
 * client can attempt and must not be allowed — a second result for a run that
 * already has one, or progress on a run that finished.
 */
public enum RunState {
    RUNNING,
    SUCCEEDED,
    FAILED;

    public boolean isFinished() {
        return this != RUNNING;
    }
}
