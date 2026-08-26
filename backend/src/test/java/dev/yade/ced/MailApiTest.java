package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import dev.yade.ced.mail.MailSender;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

/**
 * Registration by code, and the feedback that comes back.
 *
 * The relay is replaced by one that keeps what it was asked to send, which is
 * how the test reads the code: the same way the recipient would, out of the
 * message body. Nothing exposes it otherwise - the code is stored hashed and the
 * mail log deliberately does not carry bodies.
 */
@Import(MailApiTest.WithRelay.class)
class MailApiTest extends ApiTestBase {

    @TestConfiguration
    static class WithRelay {
        @Bean
        @Primary
        RecordingMailSender recordingMailSender() {
            return new RecordingMailSender();
        }
    }

    static class RecordingMailSender implements MailSender {
        volatile String lastRecipient;
        volatile String lastBody;

        @Override
        public boolean send(String recipient, String subject, String body) {
            lastRecipient = recipient;
            lastBody = body;
            return true;
        }

        @Override
        public boolean canDeliver() {
            // Configured, as far as the application is concerned - which is what
            // makes registration ask for a code.
            return true;
        }
    }

    private final Pattern sixDigits = Pattern.compile("\\b(\\d{6})\\b");

    @org.springframework.beans.factory.annotation.Autowired
    RecordingMailSender relay;

    /**
     * The suite's shared setup registers a user; here that answers with a code,
     * so this is how it gets finished.
     */
    @Override
    protected Token completeWithCode(String email) {
        ResponseEntity<Map> verified = http.postForEntity("/api/v1/auth/verify",
                Map.of("email", email, "code", codeFromMail()), Map.class);
        assertThat(verified.getStatusCode().value()).isEqualTo(201);
        Map<String, Object> body = verified.getBody();
        return new Token((String) body.get("accessToken"), (String) body.get("tokenType"),
                ((Number) body.get("expiresInSeconds")).longValue());
    }

    private String codeFromMail() {
        Matcher matcher = sixDigits.matcher(relay.lastBody);
        assertThat(matcher.find()).as("the message carries a six-digit code").isTrue();
        return matcher.group(1);
    }

    @Test
    void registering_sends_a_code_and_creates_nothing_yet() {
        String email = "code-" + UUID.randomUUID() + "@example.com";
        ResponseEntity<Map> asked = http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class);

        assertThat(asked.getStatusCode().value()).isEqualTo(202);
        assertThat(asked.getBody().get("token")).isNull();
        assertThat(asked.getBody().get("awaitingCodeFor")).isEqualTo(email);
        assertThat(relay.lastRecipient).isEqualTo(email);

        // The address cannot sign in yet: there is no account behind it.
        assertThat(http.postForEntity("/api/v1/auth/login",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class)
                .getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void the_code_completes_the_registration() {
        String email = "ok-" + UUID.randomUUID() + "@example.com";
        http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class);

        ResponseEntity<Map> verified = http.postForEntity("/api/v1/auth/verify",
                Map.of("email", email, "code", codeFromMail()), Map.class);
        assertThat(verified.getStatusCode().value()).isEqualTo(201);
        assertThat(verified.getBody().get("accessToken")).isNotNull();

        assertThat(http.postForEntity("/api/v1/auth/login",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class)
                .getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void a_wrong_code_is_refused_and_the_account_is_not_created() {
        String email = "wrong-" + UUID.randomUUID() + "@example.com";
        http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class);

        assertThat(http.postForEntity("/api/v1/auth/verify",
                Map.of("email", email, "code", "000000"), Map.class)
                .getStatusCode().value()).isEqualTo(401);
        assertThat(http.postForEntity("/api/v1/auth/login",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class)
                .getStatusCode().value()).isEqualTo(401);
    }

    // Five wrong answers and the registration is gone: the right code stops
    // working too, so guessing has a budget rather than a rate.
    @Test
    void a_run_of_wrong_codes_ends_the_registration() {
        String email = "burned-" + UUID.randomUUID() + "@example.com";
        http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class);
        String real = codeFromMail();

        for (int i = 0; i < 5; i++) {
            http.postForEntity("/api/v1/auth/verify",
                    Map.of("email", email, "code", "111111"), Map.class);
        }

        assertThat(http.postForEntity("/api/v1/auth/verify",
                Map.of("email", email, "code", real), Map.class)
                .getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void anyone_can_send_feedback_and_only_an_administrator_reads_it() {
        assertThat(http.postForEntity("/api/v1/feedback",
                Map.of("subject", "a note", "body", "the third window looks wrong"), Void.class)
                .getStatusCode().value()).isEqualTo(201);

        assertThat(as(token, HttpMethod.GET, "/api/v1/admin/messages", Map.class)
                .getStatusCode().value()).isEqualTo(403);

        ResponseEntity<List> read = as(adminToken(), HttpMethod.GET, "/api/v1/admin/messages",
                List.class);
        assertThat(read.getStatusCode().value()).isEqualTo(200);
        assertThat(read.getBody()).isNotEmpty();
    }

    @Test
    void the_mail_log_says_whether_a_relay_is_configured() {
        ResponseEntity<Map> overview = as(adminToken(), HttpMethod.GET, "/api/v1/admin/mail",
                Map.class);
        assertThat(overview.getStatusCode().value()).isEqualTo(200);
        assertThat(overview.getBody().get("relayConfigured")).isEqualTo(true);
    }
}
