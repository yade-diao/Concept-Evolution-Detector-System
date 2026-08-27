package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

/**
 * The administrator's inbox as the notification channel.
 *
 * No relay is configured for the suite, which is the deployment's real state:
 * nothing can be mailed out, so the events that would have been mail have to
 * land somewhere an administrator will see them. These tests hold that channel
 * to the two things that make it worth anything - the event is recorded, and
 * the count says there is something to read.
 */
class NoticeApiTest extends ApiTestBase {

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> inbox(String admin) {
        ResponseEntity<List> read = as(admin, HttpMethod.GET, "/api/v1/admin/messages", List.class);
        assertThat(read.getStatusCode().value()).isEqualTo(200);
        return read.getBody();
    }

    private long unread(String admin) {
        ResponseEntity<Map> count =
                as(admin, HttpMethod.GET, "/api/v1/admin/messages/unread", Map.class);
        assertThat(count.getStatusCode().value()).isEqualTo(200);
        return ((Number) count.getBody().get("count")).longValue();
    }

    @Test
    void registering_tells_the_administrator_who_arrived() {
        String admin = adminToken();
        String email = "arrival-" + UUID.randomUUID() + "@example.com";
        assertThat(http.postForEntity("/api/v1/auth/register",
                Map.of("email", email, "password", "correct-horse-battery"), Map.class)
                .getStatusCode().value()).isEqualTo(201);

        assertThat(inbox(admin))
                .as("a notice naming the new account")
                .anySatisfy(message -> {
                    assertThat(message.get("kind")).isEqualTo("NOTICE");
                    assertThat((String) message.get("subject")).contains(email);
                    // With no relay the address was never confirmed, and the
                    // notice has to say so rather than let it be assumed.
                    assertThat((String) message.get("body")).contains("not confirmed");
                });
    }

    /**
     * A notice carries no correspondent: there is nobody behind it to write
     * back to, and showing one would invite a reply into a void.
     */
    @Test
    void a_notice_has_no_sender_and_feedback_does() {
        String admin = adminToken();
        assertThat(http.postForEntity("/api/v1/feedback",
                Map.of("replyTo", "someone@example.com", "subject", "a note",
                        "body", "the third window looks wrong"), Void.class)
                .getStatusCode().value()).isEqualTo(201);

        List<Map<String, Object>> messages = inbox(admin);
        assertThat(messages).anySatisfy(message -> {
            assertThat(message.get("kind")).isEqualTo("FEEDBACK");
            assertThat(message.get("replyTo")).isEqualTo("someone@example.com");
        });
        assertThat(messages).filteredOn(m -> "NOTICE".equals(m.get("kind")))
                .isNotEmpty()
                .allSatisfy(message -> assertThat(message.get("replyTo")).isNull());
    }

    @Test
    void the_count_is_what_is_unread_and_can_be_cleared_in_one_go() {
        String admin = adminToken();
        http.postForEntity("/api/v1/feedback",
                Map.of("subject", "another note", "body", "and another thing"), Void.class);

        assertThat(unread(admin)).isPositive();

        ResponseEntity<Map> cleared =
                as(admin, HttpMethod.PATCH, "/api/v1/admin/messages/read", Map.class);
        assertThat(cleared.getStatusCode().value()).isEqualTo(200);
        assertThat(((Number) cleared.getBody().get("count")).longValue()).isZero();
        assertThat(unread(admin)).isZero();
    }

    @Test
    void the_count_is_not_readable_without_the_role() {
        assertThat(as(token, HttpMethod.GET, "/api/v1/admin/messages/unread", Map.class)
                .getStatusCode().value()).isEqualTo(403);
        assertThat(as(guestToken(), HttpMethod.GET, "/api/v1/admin/messages/unread", Map.class)
                .getStatusCode().value()).isEqualTo(403);
    }
}
