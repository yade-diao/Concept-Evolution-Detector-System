package dev.yade.ced.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.yade.ced.auth.Role;
import dev.yade.ced.auth.User;
import java.time.Instant;
import java.util.UUID;

/**
 * What an administrator is shown about an account.
 *
 * Not the password hash, and not a way to read anyone's runs - the listing
 * carries how many there are, which is what a decision about an account needs,
 * and stops there. An administrator here is for removing accounts, not for
 * reading over their shoulder.
 */
public final class AdminDtos {

    private AdminDtos() {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record UserRow(
            UUID id,
            String name,
            Role role,
            long runs,
            Instant createdAt,
            Instant expiresAt) {

        public static UserRow of(User user, long runs) {
            return new UserRow(user.getId(), user.displayName(), user.getRole(), runs,
                    user.getCreatedAt(), user.getExpiresAt());
        }
    }
}
