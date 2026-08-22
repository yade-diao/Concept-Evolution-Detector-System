package dev.yade.ced.common;

import java.time.Instant;

/**
 * The one error shape every endpoint returns.
 *
 * `detail` is written to be read by the person who caused it — which field, and
 * what would make it acceptable — not to be pattern-matched by a client. A
 * message that says only "invalid request" moves the work of finding the mistake
 * onto whoever made it.
 */
public record ApiError(String detail, Instant at) {
    public static ApiError of(String detail) {
        return new ApiError(detail, Instant.now());
    }
}
