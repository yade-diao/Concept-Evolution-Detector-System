package dev.yade.ced.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A person who owns runs.
 *
 * The password is never held in this object in any form but its hash, and the
 * hash is not exposed by any DTO. That is enforced by the absence of a getter
 * shaped like one rather than by a serialisation annotation, so a future
 * response record cannot pick it up by mapping fields automatically.
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    /** Stored as typed; compared case-insensitively, which the unique index enforces. */
    @Column(nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected User() {
        // for JPA
    }

    public User(UUID id, String email, String passwordHash, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
