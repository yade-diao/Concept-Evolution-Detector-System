package dev.yade.ced.feedback;

import dev.yade.ced.auth.User;
import dev.yade.ced.common.GlobalExceptionHandler.NotFound;
import dev.yade.ced.mail.MailSender;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sending feedback, and reading it.
 *
 * Anyone may send - signed out, guest, account - because requiring an account
 * first is how you stop hearing about the thing that is broken. Reading is for
 * the administrator, at /api/v1/admin/messages, which is where the security
 * rules already put administration.
 */
@RestController
public class FeedbackController {

    private final MessageRepository messages;
    private final MailSender mail;
    private final String adminEmail;

    public FeedbackController(MessageRepository messages, MailSender mail,
                              @Value("${ced.admin-email:}") String adminEmail) {
        this.messages = messages;
        this.mail = mail;
        this.adminEmail = adminEmail;
    }

    public record Send(
            @Size(max = 320) @Email String replyTo,
            @NotBlank @Size(max = 200) String subject,
            @NotBlank @Size(max = 5000) String body) {
    }

    public record MessageView(
            UUID id, MessageKind kind, String from, String replyTo, String subject, String body,
            Instant readAt, Instant createdAt) {

        static MessageView of(Message message) {
            return new MessageView(message.getId(), message.getKind(), message.getSenderName(),
                    message.getReplyTo(), message.getSubject(), message.getBody(),
                    message.getReadAt(), message.getCreatedAt());
        }
    }

    /**
     * How many are waiting, for the badge in the header.
     *
     * Its own endpoint rather than a count taken from the list, because the
     * header asks for it on every page and the list is bodies - up to five
     * thousand characters each, for a number.
     */
    public record Unread(long count) {
    }

    @PostMapping("/api/v1/feedback")
    @ResponseStatus(HttpStatus.CREATED)
    public void send(@AuthenticationPrincipal User me, @Valid @RequestBody Send request) {
        messages.save(Message.of(me, request.replyTo(), request.subject(), request.body()));

        // Also pushed to the administrator's address when a relay exists, so a
        // report does not wait for somebody to open the page. It is a
        // notification, not the record: the record is the row above, which is
        // why a failure here is ignored.
        if (!adminEmail.isBlank() && mail.canDeliver()) {
            mail.send(adminEmail, "[CED] " + request.subject(),
                    (request.replyTo() == null ? "" : "Reply to: " + request.replyTo() + "\n\n")
                            + request.body());
        }
    }

    @GetMapping("/api/v1/admin/messages")
    public List<MessageView> list(@org.springframework.web.bind.annotation.RequestParam(
            defaultValue = "100") int size) {
        return messages.findAllByOrderByCreatedAtDesc(PageRequest.of(0, Math.clamp(size, 1, 500)))
                .stream().map(MessageView::of).toList();
    }

    @GetMapping("/api/v1/admin/messages/unread")
    public Unread unread() {
        return new Unread(messages.countByReadAtIsNull());
    }

    /**
     * Clear the lot.
     *
     * The badge is a prompt to look, and once someone has looked, marking eight
     * notices one at a time is a chore that ends in the badge being ignored.
     */
    @PatchMapping("/api/v1/admin/messages/read")
    public Unread markAllRead() {
        var unread = messages.findAllByReadAtIsNull();
        unread.forEach(Message::markRead);
        messages.saveAll(unread);
        return new Unread(0);
    }

    @PatchMapping("/api/v1/admin/messages/{id}/read")
    public MessageView markRead(@PathVariable UUID id) {
        Message message = messages.findById(id)
                .orElseThrow(() -> new NotFound("No message with id " + id + "."));
        message.markRead();
        return MessageView.of(messages.save(message));
    }

    @DeleteMapping("/api/v1/admin/messages/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        messages.deleteById(id);
    }
}
