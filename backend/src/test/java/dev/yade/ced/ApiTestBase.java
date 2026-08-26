package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import dev.yade.ced.auth.GuestPurge;
import dev.yade.ced.auth.JwtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
// Spring Boot 4 moved TestRestTemplate out of boot.test.web.client.
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * Shared setup for the HTTP tests.
 *
 * These go through the real stack — a real PostgreSQL from Testcontainers, real
 * Flyway migrations, the real security filter chain — because the things most
 * worth testing here only exist when those are present. Ownership isolation is
 * a query with a where clause, the state machine is a set of constraints, and a
 * 401 comes from a filter. Mocking any of them would test the mock.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
// Opt-in as of Spring Boot 4. Boot 3 registered TestRestTemplate automatically
// whenever the web environment had a real port; now it has to be asked for.
@AutoConfigureTestRestTemplate
@Import(TestcontainersConfiguration.class)
abstract class ApiTestBase {

    @Autowired
    protected TestRestTemplate http;

    @Autowired
    protected JwtService jwt;

    @Autowired
    protected GuestPurge purge;

    protected String token;

    @BeforeEach
    void registerAndSignIn() {
        token = registerFresh().accessToken();
    }

    /**
     * A user nobody else in the suite shares, so tests cannot see each other's
     * runs.
     *
     * Registration answers with a token when no mail relay is configured, which
     * is the case for the suite, and with a code in flight when one is. This
     * asserts the former: a test that silently got the latter would fail later
     * and further away.
     */
    protected Token registerFresh() {
        String email = "u-" + UUID.randomUUID() + "@example.com";
        ResponseEntity<Map> response = http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class);

        // 202 means a code is in flight, which only happens where a relay is
        // configured. A test class that arranges one says how to read it.
        if (response.getStatusCode().value() == 202) {
            return completeWithCode(email);
        }
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        return tokenIn(response.getBody());
    }

    /**
     * Finish a registration that answered with a code.
     *
     * Unsupported by default: in a context with no relay this branch is
     * unreachable, and a base class that guessed at the code would be guessing.
     */
    protected Token completeWithCode(String email) {
        throw new UnsupportedOperationException(
                "Registration asked for a code, but this test has no way to read one. "
                        + "Override completeWithCode.");
    }

    @SuppressWarnings("unchecked")
    protected static Token tokenIn(Map<String, Object> registration) {
        Map<String, Object> token = (Map<String, Object>) registration.get("token");
        assertThat(token).as("registration answered with a token").isNotNull();
        return new Token((String) token.get("accessToken"), (String) token.get("tokenType"),
                ((Number) token.get("expiresInSeconds")).longValue());
    }

    protected <T> ResponseEntity<T> as(String bearer, HttpMethod method, String path,
                                       Object body, Class<T> type) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) {
            headers.setBearerAuth(bearer);
        }
        return http.exchange(path, method, new HttpEntity<>(body, headers), type);
    }

    /** No body — for GET and DELETE, where sending one is meaningless. */
    protected <T> ResponseEntity<T> as(String bearer, HttpMethod method, String path, Class<T> type) {
        return as(bearer, method, path, null, type);
    }

    protected <T> ResponseEntity<T> get(String path, Class<T> type) {
        return as(token, HttpMethod.GET, path, null, type);
    }

    protected <T> ResponseEntity<T> post(String path, Object body, Class<T> type) {
        return as(token, HttpMethod.POST, path, body, type);
    }

    /**
     * A valid create-run body, with any field overridable per test.
     *
     * The shape is the canonical synthetic stream in {@code cedfs.synthetic}: 90
     * samples carried through 300 feature columns. Ninety samples and three
     * hundred features rather than the reverse, because the stream runs along
     * the feature axis — the numbers are this way round on purpose.
     */
    protected static Map<String, Object> createRunBody(Object... overrides) {
        var body = new java.util.HashMap<String, Object>(Map.of(
                "datasetName", "synthetic",
                "samples", 90,
                "features", 300,
                "parameters", new java.util.HashMap<String, Object>(Map.of(
                        "kernelType", 1,
                        "sigma", 6.0,
                        "neighbourFraction", 0.05,
                        "similarityThreshold", 0.5,
                        "windowSize", 60))));
        for (int i = 0; i < overrides.length; i += 2) {
            body.put((String) overrides[i], overrides[i + 1]);
        }
        return body;
    }

    protected static Map<String, Object> parametersWith(String field, Object value) {
        var params = new java.util.HashMap<String, Object>(Map.of(
                "kernelType", 1, "sigma", 6.0, "neighbourFraction", 0.05,
                "similarityThreshold", 0.5, "windowSize", 60));
        params.put(field, value);
        return params;
    }

    /** A session with no account behind it. */
    protected String guestToken() {
        ResponseEntity<Token> response = http.postForEntity("/api/v1/auth/guest", null, Token.class);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        return response.getBody().accessToken();
    }

    /**
     * The address `ced.admin-email` names in the test properties.
     *
     * Registered on the first call and signed in on the rest, because the
     * address is fixed - it has to be, since the role is granted by matching it
     * - and a second registration is a conflict rather than a second account.
     */
    protected String adminToken() {
        var credentials = Map.of("email", "admin@example.com",
                "password", "correct-horse-battery");
        // Read as a map: a second call gets a 409 whose body is an ApiError, and
        // asking for a Token makes that a deserialisation failure instead of the
        // "already registered, sign in" it actually is.
        ResponseEntity<Map> registered =
                http.postForEntity("/api/v1/auth/register", credentials, Map.class);
        if (registered.getStatusCode().value() == 202) {
            return completeWithCode("admin@example.com").accessToken();
        }
        if (registered.getStatusCode().value() == 201) {
            return tokenIn(registered.getBody()).accessToken();
        }
        return http.postForEntity("/api/v1/auth/login", credentials, Token.class)
                .getBody().accessToken();
    }

    /** A signed token naming an account directly, for states no endpoint issues. */
    protected String tokenFor(UUID userId) {
        return jwt.issue(userId, Instant.now());
    }

    record Token(String accessToken, String tokenType, long expiresInSeconds) {
    }
}
