package dev.yade.ced.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final Duration guestLifetime;
    private final String adminEmail;

    public AuthService(UserRepository users, PasswordEncoder encoder, JwtService jwt,
                       @Value("${ced.guest.lifetime:P7D}") Duration guestLifetime,
                       @Value("${ced.admin-email:}") String adminEmail) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.guestLifetime = guestLifetime;
        this.adminEmail = adminEmail;
    }

    @Transactional
    public AuthDtos.Token register(AuthDtos.Register request) {
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw new EmailAlreadyRegistered();
        }
        Instant now = Instant.now();
        User user = users.save(User.registered(
                UUID.randomUUID(),
                request.email(),
                encoder.encode(request.password()),
                isConfiguredAdmin(request.email()) ? Role.ADMIN : Role.USER,
                now));
        return AuthDtos.Token.bearer(jwt.issue(user.getId(), now), jwt.lifetimeSeconds());
    }

    /**
     * An account with no address, no password, and a week to live.
     *
     * It exists so the answer to "can I keep this run?" is yes without first
     * being an answer to "will you give me your email address?".
     *
     * The token lasts as long as the account, because a guest has no password
     * to sign back in with - a two-hour token would strand the visitor next to
     * runs that are still there. And the account lasts a day, because the token
     * is its only handle: the page keeps it in session storage, so closing the
     * tab loses it for good and the row behind it is already garbage. Claiming
     * the account is the only way to keep any of it.
     */
    @Transactional
    public AuthDtos.Token guest() {
        Instant now = Instant.now();
        User user = users.save(User.guest(UUID.randomUUID(), now, guestLifetime));
        return AuthDtos.Token.bearer(
                jwt.issue(user.getId(), now, guestLifetime), guestLifetime.toSeconds());
    }

    /**
     * Keep what a guest already did, under an account that does not expire.
     *
     * The runs do not move: the row that owns them stops being a guest. Copying
     * them to a new account and deleting the old one would do the same thing to
     * the data and give the runs new identifiers, which anything holding one
     * would then be wrong about.
     */
    @Transactional
    public AuthDtos.Token claim(User guest, AuthDtos.Claim request) {
        if (guest.getRole() != Role.GUEST) {
            throw new NotAGuest();
        }
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw new EmailAlreadyRegistered();
        }
        guest.claim(request.email(), encoder.encode(request.password()));
        if (isConfiguredAdmin(request.email())) {
            guest.promoteToAdmin();
        }
        users.save(guest);
        return AuthDtos.Token.bearer(
                jwt.issue(guest.getId(), Instant.now()), jwt.lifetimeSeconds());
    }

    /**
     * Whether this address is the one named in configuration as the
     * administrator.
     *
     * Configuration rather than a flag anyone can set, and matched on
     * registration rather than granted through an endpoint, so becoming an
     * administrator requires access to the deployment - not to the API.
     */
    boolean isConfiguredAdmin(String email) {
        return !adminEmail.isBlank() && adminEmail.equalsIgnoreCase(email.trim());
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

    public static class NotAGuest extends RuntimeException {
        public NotAGuest() {
            super("This account already has an email address and a password.");
        }
    }
}
