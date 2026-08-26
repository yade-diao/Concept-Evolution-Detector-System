package dev.yade.ced.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

/**
 * An address that has asked for an account and not yet proved it can read mail
 * there.
 *
 * A separate table from users because it is not an account: it cannot sign in,
 * owns nothing, and would otherwise have to be excluded from every query that
 * means "a person". When the code is confirmed the row becomes a user and this
 * one is deleted.
 *
 * The code is held as a SHA-256 hash. Six digits and fifteen minutes is not
 * something an attacker brute-forces out of a hash - the attempt counter is
 * what stops that - so the hash is for a different reason: a copy of this table
 * should not be a list of live codes for addresses about to become accounts.
 */
@Entity
@Table(name = "pending_registrations")
public class PendingRegistration {

    /** How many wrong codes before the registration has to be started again. */
    public static final int MAX_ATTEMPTS = 5;

    @Id
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "code_hash", nullable = false)
    private String codeHash;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PendingRegistration() {
        // for JPA
    }

    public static PendingRegistration of(String email, String passwordHash, String code,
                                         Instant now, Duration lifetime) {
        PendingRegistration pending = new PendingRegistration();
        pending.email = email;
        pending.passwordHash = passwordHash;
        pending.codeHash = hash(code);
        pending.attempts = 0;
        pending.expiresAt = now.plus(lifetime);
        pending.createdAt = now;
        return pending;
    }

    /** Replace the code, for someone who asked for another one. */
    public void reissue(String code, Instant now, Duration lifetime) {
        this.codeHash = hash(code);
        this.attempts = 0;
        this.expiresAt = now.plus(lifetime);
    }

    public boolean matches(String code) {
        return MessageDigest.isEqual(
                hash(code).getBytes(StandardCharsets.UTF_8),
                codeHash.getBytes(StandardCharsets.UTF_8));
    }

    public void recordAttempt() {
        attempts++;
    }

    public boolean isExhausted() {
        return attempts >= MAX_ATTEMPTS;
    }

    public boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    private static String hash(String code) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(code.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
