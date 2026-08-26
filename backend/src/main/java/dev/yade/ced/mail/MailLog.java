package dev.yade.ced.mail;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * One attempt to send something.
 *
 * The body is deliberately absent. When a verification code does not arrive,
 * what is needed is whether the relay accepted it, for which address, and why
 * not - and a log that also held the code would undo the point of storing the
 * code hashed one table over.
 */
@Entity
@Table(name = "mail_log")
public class MailLog {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String recipient;

    @Column(nullable = false)
    private String subject;

    @Column(nullable = false)
    private boolean delivered;

    @Column
    private String detail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected MailLog() {
        // for JPA
    }

    public static MailLog of(String recipient, String subject, boolean delivered, String detail) {
        MailLog entry = new MailLog();
        entry.id = UUID.randomUUID();
        entry.recipient = recipient;
        entry.subject = subject;
        entry.delivered = delivered;
        entry.detail = detail;
        entry.createdAt = Instant.now();
        return entry;
    }

    public UUID getId() {
        return id;
    }

    public String getRecipient() {
        return recipient;
    }

    public String getSubject() {
        return subject;
    }

    public boolean isDelivered() {
        return delivered;
    }

    public String getDetail() {
        return detail;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
