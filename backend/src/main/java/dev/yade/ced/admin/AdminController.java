package dev.yade.ced.admin;

import dev.yade.ced.auth.User;
import dev.yade.ced.auth.UserRepository;
import dev.yade.ced.common.GlobalExceptionHandler.NotFound;
import dev.yade.ced.runs.RunRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The two things an administrator can do: see who has an account, and remove
 * one.
 *
 * Reachability is decided in SecurityConfig by the ROLE_ADMIN authority, which
 * comes from the database row on every request - so revoking it takes effect
 * immediately rather than when a token expires.
 */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private static final int MAX_PAGE_SIZE = 200;

    private final UserRepository users;
    private final RunRepository runs;

    public AdminController(UserRepository users, RunRepository runs) {
        this.users = users;
        this.runs = runs;
    }

    @GetMapping("/users")
    public List<AdminDtos.UserRow> list(@RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "50") int size) {
        int bounded = Math.clamp(size, 1, MAX_PAGE_SIZE);
        return users.findAllByOrderByCreatedAtDesc(PageRequest.of(Math.max(0, page), bounded))
                .map(user -> AdminDtos.UserRow.of(user, runs.countByOwner(user)))
                .toList();
    }

    /**
     * Remove an account and everything it owns.
     *
     * Deleting your own is refused. It is the one mistake here with no way back:
     * the administrator is named in the deployment's configuration, so an
     * administrator who deletes themselves has to be re-created by someone with
     * access to the server.
     */
    @DeleteMapping("/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal User me, @PathVariable UUID id) {
        if (me.getId().equals(id)) {
            throw new IllegalArgumentException(
                    "You cannot delete the account you are signed in with.");
        }
        User target = users.findById(id)
                .orElseThrow(() -> new NotFound("No account with id " + id + "."));
        users.delete(target);
    }
}
