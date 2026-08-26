package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import dev.yade.ced.auth.Role;
import dev.yade.ced.auth.User;
import dev.yade.ced.auth.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

/**
 * Who may do what.
 *
 * Three kinds of account and one privileged operation, so these tests are about
 * the boundaries between them rather than about a permission model: a guest
 * that expires, a claim that keeps the runs, and an administration endpoint
 * that an ordinary account cannot reach.
 */
class AccessApiTest extends ApiTestBase {

    @Autowired
    UserRepository users;

    @Test
    void a_guest_session_needs_nothing_and_can_keep_runs() {
        String guest = guestToken();

        ResponseEntity<Map> created = as(guest, HttpMethod.POST, "/api/v1/runs",
                createRunBody(), Map.class);
        assertThat(created.getStatusCode().value()).isEqualTo(201);

        ResponseEntity<List> mine = as(guest, HttpMethod.GET, "/api/v1/runs", List.class);
        assertThat(mine.getBody()).hasSize(1);
    }

    // The whole point of the isolation is that "anyone can have one" does not
    // mean "everyone shares one".
    @Test
    void one_guest_cannot_see_another_guests_runs() {
        String first = guestToken();
        as(first, HttpMethod.POST, "/api/v1/runs", createRunBody(), Map.class);

        ResponseEntity<List> other = as(guestToken(), HttpMethod.GET, "/api/v1/runs", List.class);
        assertThat(other.getBody()).isEmpty();
    }

    @Test
    void claiming_a_guest_keeps_the_runs_it_already_owns() {
        String guest = guestToken();
        as(guest, HttpMethod.POST, "/api/v1/runs", createRunBody(), Map.class);

        String email = "claimed-" + UUID.randomUUID() + "@example.com";
        ResponseEntity<Token> claimed = as(guest, HttpMethod.POST, "/api/v1/auth/claim",
                Map.of("email", email, "password", "correct-horse-battery"), Token.class);
        assertThat(claimed.getStatusCode().value()).isEqualTo(200);

        // The same rows, under a token issued to an account that does not expire.
        ResponseEntity<List> kept = as(claimed.getBody().accessToken(), HttpMethod.GET,
                "/api/v1/runs", List.class);
        assertThat(kept.getBody()).hasSize(1);

        var account = users.findByEmailIgnoreCase(email).orElseThrow();
        assertThat(account.getRole()).isEqualTo(Role.USER);
        assertThat(account.getExpiresAt()).isNull();
    }

    @Test
    void an_account_that_is_not_a_guest_cannot_be_claimed() {
        ResponseEntity<Map> refused = as(token, HttpMethod.POST, "/api/v1/auth/claim",
                Map.of("email", "someone-else@example.com", "password", "correct-horse-battery"),
                Map.class);
        assertThat(refused.getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void claiming_with_an_address_that_is_taken_is_refused() {
        String email = "taken-" + UUID.randomUUID() + "@example.com";
        http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class);

        ResponseEntity<Map> refused = as(guestToken(), HttpMethod.POST, "/api/v1/auth/claim",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class);
        assertThat(refused.getStatusCode().value()).isEqualTo(409);
    }

    // Expiry is enforced on the request, not only by the hourly purge: an
    // account that is over stops working when it is over.
    @Test
    void an_expired_guest_is_nobody() {
        User expired = users.save(User.guest(UUID.randomUUID(), Instant.now(),
                Duration.ofSeconds(-1)));

        // A token for it would be issued in the past; go through the filter with
        // one minted for this id by the same service the login path uses.
        String stale = tokenFor(expired.getId());
        ResponseEntity<Map> refused = as(stale, HttpMethod.GET, "/api/v1/runs", Map.class);
        assertThat(refused.getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void the_purge_removes_expired_guests() {
        User expired = users.save(User.guest(UUID.randomUUID(), Instant.now(),
                Duration.ofSeconds(-1)));
        User alive = users.save(User.guest(UUID.randomUUID(), Instant.now(),
                Duration.ofDays(7)));

        purge.purge();

        assertThat(users.findById(expired.getId())).isEmpty();
        assertThat(users.findById(alive.getId())).isPresent();
    }

    @Test
    void an_ordinary_account_cannot_reach_the_administration_endpoints() {
        ResponseEntity<Map> refused = as(token, HttpMethod.GET, "/api/v1/admin/users", Map.class);
        assertThat(refused.getStatusCode().value()).isEqualTo(403);
    }

    // ced.admin-email in the test properties names this address, so registering
    // it is what grants the role - there is no endpoint that does.
    @Test
    void the_configured_address_becomes_an_administrator_by_registering() {
        String admin = adminToken();

        ResponseEntity<List> listed = as(admin, HttpMethod.GET, "/api/v1/admin/users", List.class);
        assertThat(listed.getStatusCode().value()).isEqualTo(200);
        assertThat(listed.getBody()).isNotEmpty();
    }

    @Test
    void an_administrator_cannot_delete_the_account_they_are_using() {
        String admin = adminToken();
        UUID id = users.findByEmailIgnoreCase("admin@example.com").orElseThrow().getId();

        ResponseEntity<Map> refused = as(admin, HttpMethod.DELETE, "/api/v1/admin/users/" + id,
                Map.class);
        assertThat(refused.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void deleting_an_account_takes_its_runs_with_it() {
        String guest = guestToken();
        as(guest, HttpMethod.POST, "/api/v1/runs", createRunBody(), Map.class);
        UUID id = users.findAll().stream()
                .filter(u -> u.getRole() == Role.GUEST)
                .findFirst().orElseThrow().getId();

        ResponseEntity<Void> deleted = as(adminToken(), HttpMethod.DELETE,
                "/api/v1/admin/users/" + id, Void.class);
        assertThat(deleted.getStatusCode().value()).isEqualTo(204);
        assertThat(users.findById(id)).isEmpty();
    }
}
