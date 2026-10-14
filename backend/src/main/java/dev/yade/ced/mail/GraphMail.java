package dev.yade.ced.mail;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Mail out through Microsoft Graph's sendMail, as a mailbox in the
 * deployment's own Microsoft 365 tenant.
 *
 * The alternative to an SMTP relay for a host that has no domain of its own:
 * the mailbox's onmicrosoft.com address is already authenticated by Microsoft,
 * and Exchange Online no longer accepts basic-auth SMTP submission, so Graph
 * with an application token is the route that keeps working.
 *
 * The application needs Mail.Send as an application permission, which by
 * itself lets it send as any mailbox in the tenant; restrict it to the one
 * sending mailbox in Exchange (RBAC for Applications) rather than relying on
 * this class to only ever name that one.
 */
@Component
public class GraphMail {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper json;
    private final String tenantId;
    private final String clientId;
    private final String clientSecret;

    private String token;
    private Instant tokenExpires = Instant.EPOCH;

    public GraphMail(ObjectMapper json,
                     @Value("${ced.microsoft.tenant-id:}") String tenantId,
                     @Value("${ced.microsoft.client-id:}") String clientId,
                     @Value("${ced.microsoft.client-secret:}") String clientSecret) {
        this.json = json;
        this.tenantId = tenantId;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    public boolean configured() {
        return !tenantId.isBlank() && !clientId.isBlank() && !clientSecret.isBlank();
    }

    public void send(String from, String recipient, String subject, String body)
            throws IOException, InterruptedException {
        Map<String, Object> message = Map.of(
                "message", Map.of(
                        "subject", subject,
                        "body", Map.of("contentType", "Text", "content", body),
                        "toRecipients", List.of(Map.of("emailAddress", Map.of("address", recipient)))),
                // A no-reply mailbox has no one reading its Sent folder.
                "saveToSentItems", false);

        HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                        .uri(URI.create("https://graph.microsoft.com/v1.0/users/"
                                + URLEncoder.encode(from, StandardCharsets.UTF_8) + "/sendMail"))
                        .timeout(Duration.ofSeconds(15))
                        .header("Authorization", "Bearer " + token())
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(message)))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 202) {
            throw new IOException("Graph answered " + response.statusCode() + ": " + response.body());
        }
    }

    /**
     * An application token, reused until five minutes before it expires. They
     * last about an hour, and asking for one per message would double the
     * round trips of every send.
     */
    private synchronized String token() throws IOException, InterruptedException {
        Instant now = Instant.now();
        if (token != null && now.isBefore(tokenExpires.minus(Duration.ofMinutes(5)))) {
            return token;
        }
        String form = "client_id=" + URLEncoder.encode(clientId, StandardCharsets.UTF_8)
                + "&client_secret=" + URLEncoder.encode(clientSecret, StandardCharsets.UTF_8)
                + "&scope=" + URLEncoder.encode("https://graph.microsoft.com/.default",
                                                StandardCharsets.UTF_8)
                + "&grant_type=client_credentials";
        HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                        .uri(URI.create("https://login.microsoftonline.com/" + tenantId
                                + "/oauth2/v2.0/token"))
                        .timeout(Duration.ofSeconds(15))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .POST(HttpRequest.BodyPublishers.ofString(form))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        Map<?, ?> answer = json.readValue(response.body(), Map.class);
        if (response.statusCode() != 200 || !(answer.get("access_token") instanceof String value)) {
            throw new IOException("No Graph token: " + (answer.containsKey("error_description")
                    ? answer.get("error_description") : response.statusCode()));
        }
        long seconds = answer.get("expires_in") instanceof Number n ? n.longValue() : 3600;
        token = value;
        tokenExpires = now.plusSeconds(seconds);
        return token;
    }
}
