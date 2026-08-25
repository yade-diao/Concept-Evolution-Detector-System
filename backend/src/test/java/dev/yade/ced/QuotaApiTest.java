package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

/**
 * The cap on how many runs one account may keep.
 *
 * Guests get a smaller share than registered accounts, because a guest account
 * is one anyone can have for the asking - without a cap, "try it without
 * signing up" is also "fill this disk without signing up".
 *
 * The limit is lowered here rather than tested at its real value: what is being
 * checked is that the boundary exists and that crossing it is refused with an
 * answer someone can act on, not the number itself.
 */
@TestPropertySource(properties = "ced.limits.runs-per-guest=2")
class QuotaApiTest extends ApiTestBase {

    @Test
    void a_guest_may_keep_only_so_many_runs() {
        String guest = guestToken();
        for (int i = 0; i < 2; i++) {
            assertThat(as(guest, HttpMethod.POST, "/api/v1/runs", createRunBody(), Map.class)
                    .getStatusCode().value()).isEqualTo(201);
        }

        ResponseEntity<Map> refused = as(guest, HttpMethod.POST, "/api/v1/runs",
                createRunBody(), Map.class);
        assertThat(refused.getStatusCode().value()).isEqualTo(409);
        assertThat(refused.getBody().get("detail").toString()).contains("limit");
    }
}
