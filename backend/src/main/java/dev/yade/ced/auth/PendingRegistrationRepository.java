package dev.yade.ced.auth;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface PendingRegistrationRepository extends JpaRepository<PendingRegistration, String> {

    Optional<PendingRegistration> findByEmailIgnoreCase(String email);

    /** Codes that were never used. Nothing refers to them once they expire. */
    @Modifying
    @Query("delete from PendingRegistration p where p.expiresAt <= :now")
    int deleteExpired(Instant now);
}
