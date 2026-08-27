package dev.yade.ced.feedback;

/**
 * Who put a message in the administrator's inbox.
 *
 * The inbox holds both, and the distinction is the one a reader makes first:
 * {@code FEEDBACK} is somebody asking for something and may deserve a reply;
 * {@code NOTICE} is the server reporting that something happened and deserves
 * only to be read.
 */
public enum MessageKind {
    FEEDBACK,
    NOTICE
}
