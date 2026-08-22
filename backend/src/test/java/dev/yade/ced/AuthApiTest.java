package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class AuthApiTest extends ApiTestBase {

    @Test
    void registering_returns_a_usable_token() {
        var created = registerFresh();
        assertThat(created.accessToken()).isNotBlank();
        assertThat(created.tokenType()).isEqualTo("Bearer");
        assertThat(created.expiresInSeconds()).isPositive();

        var response = as(created.accessToken(), HttpMethod.GET, "/api/v1/runs", String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void the_same_address_cannot_register_twice() {
        String email = "dup-" + UUID.randomUUID() + "@example.com";
        var body = Map.of("email", email, "password", "correct-horse-battery");
        assertThat(http.postForEntity("/api/v1/auth/register", body, String.class)
                .getStatusCode().value()).isEqualTo(201);
        assertThat(http.postForEntity("/api/v1/auth/register", body, String.class)
                .getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void addresses_differing_only_in_case_are_the_same_account() {
        String email = "Case-" + UUID.randomUUID() + "@Example.com";
        http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), String.class);

        // Registering the lower-cased form must collide...
        assertThat(http.postForEntity("/api/v1/auth/register",
                Map.of("email", email.toLowerCase(), "password", "correct-horse-battery"),
                String.class).getStatusCode().value()).isEqualTo(409);

        // ...and logging in with it must work, which is the half that breaks when
        // the index is case-insensitive and the lookup is not.
        assertThat(http.postForEntity("/api/v1/auth/login",
                Map.of("email", email.toLowerCase(), "password", "correct-horse-battery"),
                Token.class).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void a_wrong_password_and_an_unknown_address_are_answered_identically() {
        String email = "known-" + UUID.randomUUID() + "@example.com";
        http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), String.class);

        var wrongPassword = http.postForEntity("/api/v1/auth/login",
                Map.of("email", email, "password", "wrong-horse-battery"), String.class);
        var unknownAddress = http.postForEntity("/api/v1/auth/login",
                Map.of("email", "nobody-" + UUID.randomUUID() + "@example.com",
                        "password", "correct-horse-battery"), String.class);

        assertThat(wrongPassword.getStatusCode()).isEqualTo(unknownAddress.getStatusCode());
        // Same body too: a different message turns the login form into a way to
        // ask whether an address has an account here.
        assertThat(bodyDetail(wrongPassword.getBody())).isEqualTo(bodyDetail(unknownAddress.getBody()));
    }

    @Test
    void a_short_password_is_refused_with_the_field_named() {
        var response = http.postForEntity("/api/v1/auth/register",
                Map.of("email", "short-" + UUID.randomUUID() + "@example.com", "password", "short"),
                String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody()).contains("password");
    }

    @Test
    void an_address_that_is_not_an_address_is_refused() {
        var response = http.postForEntity("/api/v1/auth/register",
                Map.of("email", "not-an-address", "password", "correct-horse-battery"),
                String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody()).contains("email");
    }

    @Test
    void runs_are_unreachable_without_a_token() {
        var response = as(null, HttpMethod.GET, "/api/v1/runs", String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(401);
        // An empty body leaves a client parsing JSON with nothing to parse.
        assertThat(response.getBody()).contains("detail");
    }

    @Test
    void a_forged_token_is_not_accepted() {
        var response = as("not.a.token", HttpMethod.GET, "/api/v1/runs", String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(401);
    }

    private static String bodyDetail(String json) {
        return json == null ? "" : json.replaceAll("\"at\":\"[^\"]*\"", "\"at\":\"\"");
    }
}
