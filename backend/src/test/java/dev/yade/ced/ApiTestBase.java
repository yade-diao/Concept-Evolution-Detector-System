package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
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

    protected String token;

    @BeforeEach
    void registerAndSignIn() {
        token = registerFresh().accessToken();
    }

    /** A user nobody else in the suite shares, so tests cannot see each other's runs. */
    protected Token registerFresh() {
        String email = "u-" + UUID.randomUUID() + "@example.com";
        ResponseEntity<Token> response = http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), Token.class);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        return response.getBody();
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

    /** A valid create-run body, with any field overridable per test. */
    protected static Map<String, Object> createRunBody(Object... overrides) {
        var body = new java.util.HashMap<String, Object>(Map.of(
                "datasetName", "synthetic",
                "samples", 300,
                "features", 8,
                "parameters", new java.util.HashMap<String, Object>(Map.of(
                        "kernelType", 1,
                        "sigma", 6.0,
                        "neighbourFraction", 0.15,
                        "similarityThreshold", 0.5,
                        "windowSize", 60))));
        for (int i = 0; i < overrides.length; i += 2) {
            body.put((String) overrides[i], overrides[i + 1]);
        }
        return body;
    }

    protected static Map<String, Object> parametersWith(String field, Object value) {
        var params = new java.util.HashMap<String, Object>(Map.of(
                "kernelType", 1, "sigma", 6.0, "neighbourFraction", 0.15,
                "similarityThreshold", 0.5, "windowSize", 60));
        params.put(field, value);
        return params;
    }

    record Token(String accessToken, String tokenType, long expiresInSeconds) {
    }
}
