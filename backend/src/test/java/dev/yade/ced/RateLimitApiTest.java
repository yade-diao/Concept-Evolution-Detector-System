package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/**
 * The ceiling on authentication attempts from one address.
 *
 * Off for the rest of the suite, which authenticates far more often than a
 * person would, so it is turned back on here and set low. What matters is that
 * a run of attempts stops being answered and says why - not the number, which
 * is configuration.
 */
@TestPropertySource(properties = {
        "ced.rate-limit.enabled=true",
        "ced.rate-limit.auth-per-minute=3",
})
class RateLimitApiTest extends ApiTestBase {

    @Test
    void too_many_attempts_from_one_address_are_refused() {
        Map<String, String> wrong = Map.of("email", "nobody@example.com", "password", "wrong-one");

        int status = 200;
        for (int attempt = 0; attempt < 10 && status != 429; attempt++) {
            status = http.postForEntity("/api/v1/auth/login", wrong, Map.class)
                    .getStatusCode().value();
        }

        assertThat(status).isEqualTo(429);
    }
}
