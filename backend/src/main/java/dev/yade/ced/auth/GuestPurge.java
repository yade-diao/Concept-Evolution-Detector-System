package dev.yade.ced.auth;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Deleting guest accounts once their week is up.
 *
 * A guest is storage nobody asked to own: no address, no password, no way to
 * ask the person whether they still want it. Keeping those rows forever would
 * turn "try it without signing up" into an unbounded liability - both a table
 * that only grows and personal-ish data held with no reason to hold it.
 *
 * Expiry is enforced twice on purpose. Here, which reclaims the space, and in
 * the authentication filter, which refuses an expired account the moment it
 * expires rather than up to an hour later when this next runs.
 */
@Component
public class GuestPurge {

    private static final Logger log = LoggerFactory.getLogger(GuestPurge.class);

    private final UserRepository users;

    public GuestPurge(UserRepository users) {
        this.users = users;
    }

    /**
     * Hourly, and offset from startup rather than on the hour: a deployment
     * that restarts often should not run this on every boot.
     */
    @Scheduled(initialDelay = 5 * 60 * 1000, fixedDelay = 60 * 60 * 1000)
    @Transactional
    public void purge() {
        int deleted = users.deleteExpired(Instant.now());
        if (deleted > 0) {
            log.info("Deleted {} expired guest account(s) and the runs they owned.", deleted);
        }
    }
}
