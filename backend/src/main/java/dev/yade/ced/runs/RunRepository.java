package dev.yade.ced.runs;

import dev.yade.ced.auth.User;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RunRepository extends JpaRepository<Run, UUID> {

    /**
     * Always by id AND owner, never by id alone.
     *
     * Fetching by id and then comparing the owner works, but it leaves a path
     * where someone forgets the comparison. Making ownership part of the query
     * means the only way to load a run is to already know whose it is, and a
     * miss is indistinguishable from "no such run" — which is what the API
     * should say, since a 403 confirms that the id exists.
     */
    Optional<Run> findByIdAndOwner(UUID id, User owner);

    Page<Run> findByOwnerOrderByCreatedAtDesc(User owner, Pageable pageable);

    long deleteByIdAndOwner(UUID id, User owner);
}
