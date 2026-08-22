package dev.yade.ced.auth;

import java.time.Instant;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthService(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    @Transactional
    public AuthDtos.Token register(AuthDtos.Register request) {
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw new EmailAlreadyRegistered();
        }
        User user = users.save(new User(
                UUID.randomUUID(),
                request.email(),
                encoder.encode(request.password()),
                Instant.now()));
        return AuthDtos.Token.bearer(jwt.issue(user.getId(), Instant.now()), jwt.lifetimeSeconds());
    }

    /**
     * A wrong address and a wrong password give the same answer, and take
     * roughly the same time.
     *
     * The same answer, because distinguishing them turns the login form into a
     * way to ask whether an address has an account here. Roughly the same time,
     * because returning early on an unknown address skips the hash comparison —
     * and the difference between "no hash computed" and "bcrypt computed" is
     * measurable from outside, which reintroduces the same disclosure through
     * the clock. Hashing against a throwaway spends the time deliberately.
     */
    @Transactional(readOnly = true)
    public AuthDtos.Token login(AuthDtos.Login request) {
        var found = users.findByEmailIgnoreCase(request.email());
        if (found.isEmpty()) {
            encoder.matches(request.password(), NO_SUCH_USER_HASH);
            throw new InvalidCredentials();
        }
        User user = found.get();
        if (!encoder.matches(request.password(), user.getPasswordHash())) {
            throw new InvalidCredentials();
        }
        return AuthDtos.Token.bearer(jwt.issue(user.getId(), Instant.now()), jwt.lifetimeSeconds());
    }

    /**
     * A valid bcrypt hash of a value nobody knows, used only to spend the time a
     * real comparison would. Its plaintext is irrelevant and is not stored.
     */
    private static final String NO_SUCH_USER_HASH =
            "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    public static class EmailAlreadyRegistered extends RuntimeException {
        public EmailAlreadyRegistered() {
            super("That email address is already registered.");
        }
    }

    public static class InvalidCredentials extends RuntimeException {
        public InvalidCredentials() {
            super("Email or password is incorrect.");
        }
    }
}
