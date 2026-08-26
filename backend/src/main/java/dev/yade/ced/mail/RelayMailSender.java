package dev.yade.ced.mail;

import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mail out through a relay on port 587, or into the log if there is none.
 *
 * Written against JavaMail directly rather than through a starter, because what
 * is needed is one authenticated submission over STARTTLS and the starter's
 * value is the configuration surface around that.
 *
 * Every send is recorded either way, in its own transaction: the log of what
 * was attempted has to survive whatever the caller's transaction decides to do
 * afterwards, or a registration that rolls back takes the evidence with it.
 */
@Component
public class RelayMailSender implements MailSender {

    private static final Logger log = LoggerFactory.getLogger(RelayMailSender.class);

    private final MailLogRepository entries;
    private final String host;
    private final int port;
    private final String username;
    private final String password;
    private final String from;

    public RelayMailSender(MailLogRepository entries,
                           @Value("${ced.mail.host:}") String host,
                           @Value("${ced.mail.port:587}") int port,
                           @Value("${ced.mail.username:}") String username,
                           @Value("${ced.mail.password:}") String password,
                           @Value("${ced.mail.from:}") String from) {
        this.entries = entries;
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;
        this.from = from;
    }

    @Override
    public boolean canDeliver() {
        return !host.isBlank() && !from.isBlank();
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean send(String recipient, String subject, String body) {
        if (!canDeliver()) {
            // Not an error: a deployment with no relay is a deployment where the
            // administrator reads the code off the messages page. Say so once,
            // at the level someone watching the logs will see.
            log.info("No mail relay configured. Message to {} recorded but not sent: {}",
                    recipient, subject);
            entries.save(MailLog.of(recipient, subject, false, "no relay configured"));
            return false;
        }

        try {
            deliver(recipient, subject, body);
            entries.save(MailLog.of(recipient, subject, true, null));
            return true;
        } catch (Exception e) {
            // A relay that refuses is the caller's problem to report, not an
            // exception to unwind a registration with: the account can still be
            // created, and the code re-sent.
            log.warn("Mail to {} failed: {}", recipient, e.toString());
            entries.save(MailLog.of(recipient, subject, false, e.toString()));
            return false;
        }
    }

    private void deliver(String recipient, String subject, String body) throws Exception {
        Properties properties = new Properties();
        properties.put("mail.smtp.host", host);
        properties.put("mail.smtp.port", String.valueOf(port));
        properties.put("mail.smtp.auth", String.valueOf(!username.isBlank()));
        // STARTTLS rather than implicit TLS: 587 is the submission port and it
        // begins in the clear by definition. `required` so a relay that does not
        // offer it fails loudly instead of sending the password in plaintext.
        properties.put("mail.smtp.starttls.enable", "true");
        properties.put("mail.smtp.starttls.required", "true");
        properties.put("mail.smtp.connectiontimeout", "10000");
        properties.put("mail.smtp.timeout", "10000");
        properties.put("mail.smtp.writetimeout", "10000");

        var session = jakarta.mail.Session.getInstance(properties,
                username.isBlank() ? null : new jakarta.mail.Authenticator() {
                    @Override
                    protected jakarta.mail.PasswordAuthentication getPasswordAuthentication() {
                        return new jakarta.mail.PasswordAuthentication(username, password);
                    }
                });

        var message = new jakarta.mail.internet.MimeMessage(session);
        message.setFrom(new jakarta.mail.internet.InternetAddress(from));
        message.setRecipients(jakarta.mail.Message.RecipientType.TO, recipient);
        message.setSubject(subject, "UTF-8");
        message.setText(body, "UTF-8");
        jakarta.mail.Transport.send(message);
    }
}
