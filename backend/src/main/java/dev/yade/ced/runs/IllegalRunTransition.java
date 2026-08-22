package dev.yade.ced.runs;

/**
 * A state change a run will not make.
 *
 * Separate from a validation failure: the request was well formed and the caller
 * is allowed to make it — it is the run that is in the wrong state, which is a
 * 409 rather than a 400. Telling those apart matters to a client deciding
 * whether to fix the request or stop retrying.
 */
public class IllegalRunTransition extends RuntimeException {
    public IllegalRunTransition(String message) {
        super(message);
    }
}
