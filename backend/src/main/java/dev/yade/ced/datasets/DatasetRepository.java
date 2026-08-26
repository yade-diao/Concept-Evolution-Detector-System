package dev.yade.ced.datasets;

import dev.yade.ced.auth.User;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DatasetRepository extends JpaRepository<Dataset, UUID> {

    /** Always by id AND owner, so the only way to load one is to know whose it is. */
    Optional<Dataset> findByIdAndOwner(UUID id, User owner);

    List<Dataset> findByOwnerOrderByCreatedAtDesc(User owner);

    boolean existsByOwnerAndNameIgnoreCase(User owner, String name);

    /** What the account is using, for the quota. Zero when it has uploaded none. */
    @Query("select coalesce(sum(d.sizeBytes), 0) from Dataset d where d.owner = :owner")
    long bytesUsedBy(User owner);
}
