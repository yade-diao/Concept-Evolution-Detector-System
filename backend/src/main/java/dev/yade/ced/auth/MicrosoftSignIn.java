package dev.yade.ced.auth;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * "Sign in with Microsoft": the OpenID Connect authorization-code flow with
 * PKCE, run by the server so the client secret never reaches a browser.
 *
 * The browser is sent to Microsoft with a state, a nonce and a code challenge,
 * and the three secrets that check them travel in a short-lived cookie scoped
 * to the callback. The ID token comes back from the token endpoint over TLS,
 * authenticated with the client secret, so its signature is not checked
 * separately - OpenID Connect Core 3.1.3.7 allows exactly this for tokens
 * received directly from the token endpoint. Its claims still are: audience,
 * issuer against its own tenant, expiry, and the nonce this server chose.
 */
@Component
public class MicrosoftSignIn {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String LOGIN = "https://login.microsoftonline.com/";

    /** Where to send the browser, and what to remember until it comes back. */
    public record Started(String url, String cookie) {
    }

    /** Who Microsoft says this is: "tenant:object", and the address to show. */
    public record Identity(String id, String email) {
    }

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper json;
    private final String clientId;
    private final String clientSecret;
    private final String authority;
    private final String publicUrl;

    public MicrosoftSignIn(ObjectMapper json,
                           @Value("${ced.microsoft.client-id:}") String clientId,
                           @Value("${ced.microsoft.client-secret:}") String clientSecret,
                           @Value("${ced.microsoft.authority:common}") String authority,
                           @Value("${ced.public-url:}") String publicUrl) {
        this.json = json;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.authority = authority.isBlank() ? "common" : authority;
        this.publicUrl = publicUrl.replaceAll("/+$", "");
    }

    /** Whether the deployment has an app registration to sign in with. */
    public boolean enabled() {
        return !clientId.isBlank() && !clientSecret.isBlank() && !publicUrl.isBlank();
    }

    private String redirectUri() {
        return publicUrl + "/api/v1/auth/microsoft/callback";
    }

    public Started start() {
        String state = random(16);
        String nonce = random(16);
        String verifier = random(32);
        Map<String, String> query = new LinkedHashMap<>();
        query.put("client_id", clientId);
        query.put("response_type", "code");
        query.put("response_mode", "query");
        query.put("redirect_uri", redirectUri());
        query.put("scope", "openid email profile");
        query.put("state", state);
        query.put("nonce", nonce);
        query.put("code_challenge", challenge(verifier));
        query.put("code_challenge_method", "S256");
        query.put("prompt", "select_account");
        String url = LOGIN + authority + "/oauth2/v2.0/authorize?" + form(query);
        return new Started(url, state + "." + nonce + "." + verifier);
    }

    /** Exchange the code Microsoft sent back for the identity it stands for. */
    public Identity finish(String code, String state, String cookie) {
        String[] remembered = cookie == null ? new String[0] : cookie.split("\\.");
        if (remembered.length != 3 || state == null || code == null
                || !MessageDigest.isEqual(state.getBytes(StandardCharsets.UTF_8),
                                          remembered[0].getBytes(StandardCharsets.UTF_8))) {
            throw new Failed("The sign-in took too long or was started elsewhere. Try again.");
        }

        Map<String, String> body = new LinkedHashMap<>();
        body.put("client_id", clientId);
        body.put("client_secret", clientSecret);
        body.put("grant_type", "authorization_code");
        body.put("code", code);
        body.put("redirect_uri", redirectUri());
        body.put("code_verifier", remembered[2]);
        body.put("scope", "openid email profile");

        Map<?, ?> answer;
        try {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                            .uri(URI.create(LOGIN + authority + "/oauth2/v2.0/token"))
                            .timeout(Duration.ofSeconds(15))
                            .header("Content-Type", "application/x-www-form-urlencoded")
                            .POST(HttpRequest.BodyPublishers.ofString(form(body)))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            answer = json.readValue(response.body(), Map.class);
            if (response.statusCode() != 200) {
                throw new Failed("Microsoft refused the sign-in: "
                        + (answer.containsKey("error_description")
                                ? answer.get("error_description") : response.statusCode()));
            }
        } catch (Failed e) {
            throw e;
        } catch (Exception e) {
            throw new Failed("Microsoft could not be reached. Try again in a moment.");
        }

        Object idToken = answer.get("id_token");
        if (!(idToken instanceof String token) || token.split("\\.").length < 2) {
            throw new Failed("Microsoft did not return an identity.");
        }
        Map<?, ?> claims = json.readValue(
                Base64.getUrlDecoder().decode(token.split("\\.")[1]), Map.class);
        return identify(claims, remembered[1], Instant.now());
    }

    /**
     * The checks on the ID token's claims, separate so they can be tested
     * without Microsoft.
     */
    Identity identify(Map<?, ?> claims, String nonce, Instant now) {
        String tenant = text(claims.get("tid"));
        if (!clientId.equals(text(claims.get("aud")))) {
            throw new Failed("That identity was issued for another application.");
        }
        if (!nonce.equals(text(claims.get("nonce")))) {
            throw new Failed("That sign-in answer does not belong to this attempt.");
        }
        if (!(claims.get("exp") instanceof Number exp) || exp.longValue() <= now.getEpochSecond()) {
            throw new Failed("That identity has expired. Try again.");
        }
        if (tenant.isBlank() || !(LOGIN + tenant + "/v2.0").equals(text(claims.get("iss")))) {
            throw new Failed("That identity does not come from Microsoft.");
        }
        if (!Set.of("common", "organizations", "consumers").contains(authority)
                && !authority.equalsIgnoreCase(tenant)) {
            throw new Failed("Accounts from that organisation cannot sign in here.");
        }

        String subject = text(claims.get("oid"));
        if (subject.isBlank()) subject = text(claims.get("sub"));
        String email = text(claims.get("email"));
        if (email.isBlank()) email = text(claims.get("preferred_username"));
        if (subject.isBlank() || !email.contains("@")) {
            throw new Failed("That Microsoft account has no email address to sign in with.");
        }
        return new Identity(tenant + ":" + subject, email.trim());
    }

    private static String text(Object value) {
        return value == null ? "" : value.toString();
    }

    private static String random(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buffer);
    }

    private static String challenge(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String form(Map<String, String> values) {
        return values.entrySet().stream()
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "="
                        + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
    }

    /** A sign-in that did not finish, with a sentence for the person it failed for. */
    public static class Failed extends RuntimeException {
        public Failed(String message) {
            super(message);
        }
    }
}
