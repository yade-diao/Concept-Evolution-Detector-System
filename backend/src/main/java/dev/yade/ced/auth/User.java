package dev.yade.ced.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

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

    /**
     * Stored as typed; compared case-insensitively, which the unique index
     * enforces. Null for a guest, which has no address to be known by.
     */
    @Column
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    /** When a guest and its runs are deleted. Null for every other role. */
    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected User() {
        // for JPA
    }

    private User(UUID id, String email, String passwordHash, Role role,
                 Instant expiresAt, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
    }

    /** Someone who signed up. */
    public static User registered(UUID id, String email, String passwordHash, Role role,
                                  Instant createdAt) {
        if (role == Role.GUEST) {
            throw new IllegalArgumentException("A guest has no email or password.");
        }
        return new User(id, email, passwordHash, role, null, createdAt);
    }

    /**
     * A visitor who wants their runs kept without signing up.
     *
     * The lifetime is short on purpose: this is storage nobody asked to own, so
     * it cleans itself up rather than accumulating until someone notices.
     */
    public static User guest(UUID id, Instant createdAt, Duration lifetime) {
        return new User(id, null, null, Role.GUEST, createdAt.plus(lifetime), createdAt);
    }

    /**
     * Turn this guest into a real account, keeping the runs it already owns.
     *
     * The expiry has to be cleared in the same step as the credentials are set,
     * or the account someone just chose a password for would delete itself a
     * week later - which is what the database constraint refuses to allow.
     */
    public void claim(String email, String passwordHash) {
        if (role != Role.GUEST) {
            throw new IllegalStateException("Only a guest account can be claimed.");
        }
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = Role.USER;
        this.expiresAt = null;
    }

    public void promoteToAdmin() {
        if (role == Role.GUEST) {
            throw new IllegalStateException("A guest cannot be an administrator.");
        }
        this.role = Role.ADMIN;
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

    public Role getRole() {
        return role;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    /**
     * A guest whose time is up.
     *
     * Checked on every authenticated request rather than left to the purge: the
     * purge runs hourly, and an account that is over should stop working the
     * moment it is over, not up to an hour later.
     */
    public boolean isExpired(Instant now) {
        return expiresAt != null && !expiresAt.isAfter(now);
    }

    public Collection<? extends GrantedAuthority> authorities() {
        return List.of(new SimpleGrantedAuthority(role.authority()));
    }

    /** What to call this account in an interface. A guest has no name to show. */
    public String displayName() {
        return email != null ? email : "guest " + id.toString().substring(0, 8);
    }
}
