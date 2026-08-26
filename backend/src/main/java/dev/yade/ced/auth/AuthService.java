package dev.yade.ced.auth;

import dev.yade.ced.mail.MailSender;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final PendingRegistrationRepository pending;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final MailSender mail;
    private final Duration guestLifetime;
    private final Duration codeLifetime;
    private final String adminEmail;

    public AuthService(UserRepository users, PendingRegistrationRepository pending,
                       PasswordEncoder encoder, JwtService jwt, MailSender mail,
                       @Value("${ced.guest.lifetime:P1D}") Duration guestLifetime,
                       @Value("${ced.mail.code-lifetime:PT15M}") Duration codeLifetime,
                       @Value("${ced.admin-email:}") String adminEmail) {
        this.users = users;
        this.pending = pending;
        this.encoder = encoder;
        this.jwt = jwt;
        this.mail = mail;
        this.guestLifetime = guestLifetime;
        this.codeLifetime = codeLifetime;
        this.adminEmail = adminEmail;
    }

    /**
     * Whether an address has to be confirmed before it becomes an account.
     *
     * Tied to whether a relay is configured, because the alternative is worse in
     * both directions: demanding a code from a deployment that cannot send one
     * makes registration impossible, and skipping the code when it could have
     * been sent gives away the only thing verification buys.
     */
    public boolean verificationRequired() {
        return mail.canDeliver();
    }

    /**
     * Start a registration.
     *
     * With a relay configured this creates nothing an attacker can use: a
     * pending row and a six-digit code sent to the address. Without one, the
     * account is created immediately and a token returned, because a deployment
     * that cannot send mail must not have a sign-up that cannot be completed.
     */
    @Transactional
    public AuthDtos.Registration register(AuthDtos.Register request) {
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw new EmailAlreadyRegistered();
        }

        Instant now = Instant.now();
        if (!verificationRequired()) {
            User user = createAccount(request.email(), encoder.encode(request.password()), now);
            return AuthDtos.Registration.signedIn(
                    AuthDtos.Token.bearer(jwt.issue(user.getId(), now), jwt.lifetimeSeconds()));
        }

        String code = newCode();
        PendingRegistration row = pending.findByEmailIgnoreCase(request.email()).orElse(null);
        if (row == null) {
            row = PendingRegistration.of(request.email(), encoder.encode(request.password()),
                    code, now, codeLifetime);
        } else {
            // Asking again replaces the code rather than adding one: two live
            // codes for one address is two chances to guess.
            row.reissue(code, now, codeLifetime);
        }
        pending.save(row);

        mail.send(request.email(), "Your code for the Concept Evolution Detector",
                ("Your verification code is %s.\n\nIt is good for %d minutes. If you did not ask "
                 + "for it, nothing has been created and you can ignore this.")
                        .formatted(code, codeLifetime.toMinutes()));

        return AuthDtos.Registration.awaitingCode(request.email(), codeLifetime.toSeconds());
    }

    /**
     * Finish a registration with the code that was sent.
     *
     * A wrong code counts against a small budget and the same answer is given
     * for wrong, expired and never-existed - the caller has the same thing to do
     * about all three, and distinguishing them says whether an address has a
     * registration in flight.
     *
     * Returns empty rather than throwing, and that is not a style choice: an
     * exception thrown from inside the transaction rolls back the attempt it was
     * counting, so the budget silently became infinite. The caller turns the
     * empty into the 401.
     */
    @Transactional
    public Optional<AuthDtos.Token> verify(AuthDtos.Verify request) {
        Instant now = Instant.now();
        var found = pending.findByEmailIgnoreCase(request.email());
        if (found.isEmpty()) return Optional.empty();

        PendingRegistration row = found.get();
        if (row.isExpired(now) || row.isExhausted()) {
            pending.delete(row);
            return Optional.empty();
        }
        if (!row.matches(request.code())) {
            row.recordAttempt();
            pending.save(row);
            return Optional.empty();
        }

        pending.delete(row);
        if (users.existsByEmailIgnoreCase(row.getEmail())) {
            throw new EmailAlreadyRegistered();
        }
        User user = createAccount(row.getEmail(), row.getPasswordHash(), now);
        return Optional.of(AuthDtos.Token.bearer(jwt.issue(user.getId(), now),
                jwt.lifetimeSeconds()));
    }

    private User createAccount(String email, String passwordHash, Instant now) {
        return users.save(User.registered(UUID.randomUUID(), email, passwordHash,
                isConfiguredAdmin(email) ? Role.ADMIN : Role.USER, now));
    }

    /** Six digits, from a source that is not predictable from the last one. */
    private static String newCode() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
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

    public static class InvalidCode extends RuntimeException {
        public InvalidCode() {
            super("That code is wrong or has expired. Ask for another one.");
        }
    }

    public static class NotAGuest extends RuntimeException {
        public NotAGuest() {
            super("This account already has an email address and a password.");
        }
    }
}
