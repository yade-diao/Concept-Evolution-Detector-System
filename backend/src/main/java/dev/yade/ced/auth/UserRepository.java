package dev.yade.ced.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Case-insensitive, to match the unique index. Looking up with an exact
     * match while the index is case-insensitive is how a registration succeeds
     * and the subsequent login fails.
     */
    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    Page<User> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * Delete the guests whose time is up.
     *
     * Their runs go with them through the cascade on runs.owner_id, which is
     * why this is a delete of users and not a two-step that could stop halfway
     * and leave runs owned by nobody.
     */
    @Modifying
    @Query("delete from User u where u.expiresAt is not null and u.expiresAt <= :now")
    int deleteExpired(Instant now);
}
