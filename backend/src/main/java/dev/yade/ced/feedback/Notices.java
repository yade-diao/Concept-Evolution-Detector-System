package dev.yade.ced.feedback;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Telling the administrator that something happened.
 *
 * This deployment has no way to send mail on its own - Azure blocks outbound
 * port 25, and a *.cloudapp.azure.com name cannot carry the DNS records a relay
 * would need to sign for it - so a notification that has to leave the machine
 * costs a paid domain and a mail provider. Until it is worth that, the
 * notification does not leave the machine: it is written to the administrator's
 * inbox, and the interface shows an unread count wherever the administrator
 * looks.
 *
 * That is a weaker channel and worth being honest about. Nobody is woken up by
 * it. What it does buy is that the events are recorded, in order, with the
 * inbox that already holds the feedback - so a single page answers "what has
 * happened here", which was the actual point of wanting mail.
 *
 * A notice joins the caller's transaction rather than opening its own: it
 * records a fact about something that happened, so if that something is rolled
 * back the notice about it should go too. The mail log is the opposite case,
 * and is written the opposite way.
 */
@Component
public class Notices {

    private static final Logger log = LoggerFactory.getLogger(Notices.class);

    private final MessageRepository messages;

    public Notices(MessageRepository messages) {
        this.messages = messages;
    }

    public void post(String subject, String body) {
        messages.save(Message.notice(subject, body));
        // Also to the log, which is where someone watching the container looks.
        log.info("Notice: {}", subject);
    }
}
