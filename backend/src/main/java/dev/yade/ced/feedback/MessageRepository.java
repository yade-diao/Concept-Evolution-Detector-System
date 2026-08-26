package dev.yade.ced.feedback;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageRepository extends JpaRepository<Message, UUID> {

    List<Message> findAllByOrderByCreatedAtDesc(Pageable pageable);

    long countByReadAtIsNull();
}
