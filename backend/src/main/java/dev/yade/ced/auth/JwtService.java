package dev.yade.ced.auth;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Issues and reads access tokens.
 *
 * The subject is the user id, not the email: an address can change, and a token
 * that names one would keep working against the old identity or stop working
 * against the new one. The id never changes.
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final Duration lifetime;

    public JwtService(
            @Value("${ced.jwt.secret}") String secret,
            @Value("${ced.jwt.lifetime:PT2H}") Duration lifetime) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        // HS256 needs at least 256 bits of key. A short secret is a configuration
        // mistake that would otherwise surface as a signature nobody can forge
        // and nobody can verify either — so it fails at startup, loudly.
        if (bytes.length < 32) {
            throw new IllegalStateException(
                    "ced.jwt.secret must be at least 32 bytes; got " + bytes.length
                            + ". Generate one with: openssl rand -base64 48");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.lifetime = lifetime;
    }

    public String issue(UUID userId, Instant now) {
        return Jwts.builder()
                .subject(userId.toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(lifetime)))
                .signWith(key)
                .compact();
    }

    /**
     * The user id a token names, or empty if it names none this server will
     * accept. Every failure — bad signature, expired, malformed, a subject that
     * is not a UUID — collapses to the same empty result, because a caller
     * deciding whether to authenticate has the same answer for all of them and
     * distinguishing them in a response tells an attacker which part to fix.
     */
    public Optional<UUID> readSubject(String token) {
        try {
            String subject = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload()
                    .getSubject();
            return Optional.of(UUID.fromString(subject));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    public long lifetimeSeconds() {
        return lifetime.toSeconds();
    }
}
