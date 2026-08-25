package dev.yade.ced.auth;

/**
 * What an account is allowed to be.
 *
 * Three, and no permission system beyond them. A permission table would be
 * machinery for a product that has one privileged operation - deleting somebody
 * else's account - and would still answer the same three questions.
 */
public enum Role {

    /** Signed up, owns their runs, sees nobody else's. */
    USER,

    /** A USER, plus the administration endpoints. */
    ADMIN,

    /**
     * No address, no password, expires.
     *
     * A visitor who wants their runs kept for the afternoon without deciding
     * whether they want an account. Their runs are theirs and nobody else's,
     * and both go when the account does.
     */
    GUEST;

    public String authority() {
        return "ROLE_" + name();
    }
}
