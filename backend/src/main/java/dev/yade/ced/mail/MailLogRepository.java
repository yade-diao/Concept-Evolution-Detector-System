package dev.yade.ced.mail;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MailLogRepository extends JpaRepository<MailLog, UUID> {

    List<MailLog> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
