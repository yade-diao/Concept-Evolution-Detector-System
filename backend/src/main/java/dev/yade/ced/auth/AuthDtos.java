package dev.yade.ced.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {
    }

    /**
     * A minimum length and no composition rule.
     *
     * Length is the only requirement that reliably buys entropy; "one digit and
     * one symbol" mostly buys Password1! and a user who writes it down. NIST
     * dropped composition rules for the same reason.
     */
    public record Register(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 12, max = 200) String password) {
    }

    public record Login(
            @NotBlank @Size(max = 320) String email,
            @NotBlank @Size(max = 200) String password) {
    }

    /**
     * Turning the guest you already are into an account you keep.
     *
     * The same fields as Register, and a separate type on purpose: the two
     * differ in what happens to the runs that already exist, and a shared
     * record would hide that a claim carries a token whose runs are about to
     * change hands.
     */
    public record Claim(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 12, max = 200) String password) {
    }

    /**
     * Who the token names.
     *
     * The role is not in the token, so a client that wants to know whether to
     * show an administration link has to ask - which is the same reason it is
     * not in the token: the answer comes from the row, and revoking it takes
     * effect immediately.
     */
    public record Me(java.util.UUID id, String name, Role role, java.time.Instant expiresAt) {
    }

    /**
     * `expiresInSeconds` so a client can refresh before a request fails rather
     * than by discovering a 401. The token's own exp claim says the same thing,
     * but reading it means parsing a token the client is not supposed to inspect.
     */
    public record Token(String accessToken, String tokenType, long expiresInSeconds) {
        public static Token bearer(String value, long seconds) {
            return new Token(value, "Bearer", seconds);
        }
    }
}
