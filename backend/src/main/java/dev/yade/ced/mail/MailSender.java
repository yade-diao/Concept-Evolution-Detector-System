package dev.yade.ced.mail;

/**
 * Sending one message, and recording that it was sent.
 *
 * An interface with two implementations because the deployment has two honest
 * states. With relay credentials configured, mail goes out over port 587 - the
 * only way it can, since Azure blocks outbound 25 on every virtual machine and
 * this host could not deliver directly if it tried. Without them, the message
 * is written to the log and to the mail log the administrator can read, so
 * registration still works end to end for a deployment nobody has given an
 * account to yet.
 *
 * That fallback is not a stub. It is the difference between "you cannot try
 * this without signing up for a mail provider first" and "you can, and the code
 * is on the administrator's messages page".
 */
public interface MailSender {

    /**
     * @return true when the message was handed to a relay, false when it was
     *         only recorded. Never throws: a failure to send is a thing the
     *         caller reports, not a thing that unwinds a registration.
     */
    boolean send(String recipient, String subject, String body);

    /** Whether a relay is configured, so the interface can say what will happen. */
    boolean canDeliver();
}
