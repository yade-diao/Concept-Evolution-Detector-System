package dev.yade.ced.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** The checks on Microsoft's ID token, without Microsoft. */
class MicrosoftSignInTest {

    private static final String TENANT = "d9310282-3c07-4a3e-a689-42fe8f7aa3f4";
    private static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");

    private final MicrosoftSignIn signIn = new MicrosoftSignIn(
            JsonMapper.builder().build(), "client-1", "secret", "common", "https://ced.example/");

    private Map<String, Object> claims() {
        Map<String, Object> claims = new HashMap<>();
        claims.put("aud", "client-1");
        claims.put("iss", "https://login.microsoftonline.com/" + TENANT + "/v2.0");
        claims.put("tid", TENANT);
        claims.put("oid", "object-1");
        claims.put("nonce", "nonce-1");
        claims.put("exp", NOW.getEpochSecond() + 600);
        claims.put("email", "someone@example.com");
        return claims;
    }

    private MicrosoftSignIn.Identity identify(Map<String, Object> claims) {
        return signIn.identify(claims, "nonce-1", NOW);
    }

    @Test
    void a_valid_token_names_the_tenant_and_object() {
        MicrosoftSignIn.Identity who = identify(claims());
        assertThat(who.id()).isEqualTo(TENANT + ":object-1");
        assertThat(who.email()).isEqualTo("someone@example.com");
    }

    @Test
    void the_preferred_username_stands_in_for_a_missing_email() {
        Map<String, Object> claims = claims();
        claims.remove("email");
        claims.put("preferred_username", "user@catstu.onmicrosoft.com");
        assertThat(identify(claims).email()).isEqualTo("user@catstu.onmicrosoft.com");
    }

    @Test
    void a_token_for_another_application_is_refused() {
        Map<String, Object> claims = claims();
        claims.put("aud", "someone-else");
        assertThatThrownBy(() -> identify(claims)).isInstanceOf(MicrosoftSignIn.Failed.class);
    }

    @Test
    void a_replayed_nonce_is_refused() {
        Map<String, Object> claims = claims();
        claims.put("nonce", "nonce-2");
        assertThatThrownBy(() -> identify(claims)).isInstanceOf(MicrosoftSignIn.Failed.class);
    }

    @Test
    void an_expired_token_is_refused() {
        Map<String, Object> claims = claims();
        claims.put("exp", NOW.getEpochSecond() - 1);
        assertThatThrownBy(() -> identify(claims)).isInstanceOf(MicrosoftSignIn.Failed.class);
    }

    @Test
    void an_issuer_that_does_not_match_the_tenant_is_refused() {
        Map<String, Object> claims = claims();
        claims.put("iss", "https://login.microsoftonline.com/another-tenant/v2.0");
        assertThatThrownBy(() -> identify(claims)).isInstanceOf(MicrosoftSignIn.Failed.class);
    }

    @Test
    void the_state_must_match_the_cookie() {
        assertThatThrownBy(() -> signIn.finish("code", "state-a", "state-b.nonce.verifier"))
                .isInstanceOf(MicrosoftSignIn.Failed.class);
        assertThatThrownBy(() -> signIn.finish("code", "state-a", null))
                .isInstanceOf(MicrosoftSignIn.Failed.class);
    }

    @Test
    void the_authorize_url_carries_pkce_and_the_callback() {
        MicrosoftSignIn.Started started = signIn.start();
        assertThat(started.url())
                .startsWith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?")
                .contains("code_challenge_method=S256")
                .contains("redirect_uri=https%3A%2F%2Fced.example%2Fapi%2Fv1%2Fauth%2Fmicrosoft%2Fcallback");
        assertThat(started.cookie().split("\\.")).hasSize(3);
    }
}
