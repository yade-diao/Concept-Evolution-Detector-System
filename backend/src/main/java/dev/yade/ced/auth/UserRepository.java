package dev.yade.ced.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Case-insensitive, to match the unique index. Looking up with an exact
     * match while the index is case-insensitive is how a registration succeeds
     * and the subsequent login fails.
     */
    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);
}
