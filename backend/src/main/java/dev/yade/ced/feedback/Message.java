package dev.yade.ced.feedback;

import dev.yade.ced.auth.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Something a visitor wanted to say.
 *
 * It arrives through the application, not through SMTP, because this deployment
 * cannot receive mail: its name is a *.cloudapp.azure.com subdomain and nobody
 * can point an MX record at it. Rather than pretend otherwise with a
 * mailto: link that goes nowhere anyone reads, the message is stored here and
 * the administrator reads it in the interface.
 *
 * The sender is optional. Most feedback comes from someone who is not signed in,
 * and demanding an account first is how you stop hearing about the bug.
 *
 * The same table also carries what the server has to say - a new account, a
 * guest who kept their work - because that is the other thing that would have
 * been an email and there is nowhere else for it to arrive. A {@link
 * MessageKind} keeps the two apart.
 */
@Entity
@Table(name = "messages")
public class Message {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    private User sender;

    /** What they typed, unverified, with no promise attached to it. */
    @Column(name = "reply_to")
    private String replyTo;

    @Column(nullable = false)
    private String subject;

    @Column(nullable = false)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MessageKind kind;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Message() {
        // for JPA
    }

    /** Something a person wrote, through the form. */
    public static Message of(User sender, String replyTo, String subject, String body) {
        return create(MessageKind.FEEDBACK, sender, replyTo, subject, body);
    }

    /**
     * Something the server is reporting.
     *
     * No sender and no reply address, because there is nobody to reply to: the
     * subject of a notice is an event, not a correspondent.
     */
    public static Message notice(String subject, String body) {
        return create(MessageKind.NOTICE, null, null, subject, body);
    }

    private static Message create(MessageKind kind, User sender, String replyTo,
                                  String subject, String body) {
        Message message = new Message();
        message.id = UUID.randomUUID();
        message.kind = kind;
        message.sender = sender;
        message.replyTo = replyTo;
        message.subject = subject;
        message.body = body;
        message.createdAt = Instant.now();
        return message;
    }

    public void markRead() {
        if (readAt == null) readAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getReplyTo() {
        return replyTo;
    }

    public String getSubject() {
        return subject;
    }

    public String getBody() {
        return body;
    }

    public MessageKind getKind() {
        return kind;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** Who sent it, if anyone signed in did. */
    public String getSenderName() {
        return sender == null ? null : sender.displayName();
    }
}
