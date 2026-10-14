-- Accounts that sign in with Microsoft instead of a password.
--
-- They are known by the issuing tenant and the object id inside it, not by the
-- email claim: in a multi-tenant directory the address is whatever that
-- tenant's administrator typed, and keying an account on it would let any
-- tenant claim any address. The email is still stored, for display and for the
-- unique index, but it never decides who someone is.

alter table users add column microsoft_id text;

create unique index users_microsoft_id_key on users (microsoft_id);

-- A non-guest now has an email and at least one way in: a password, a
-- Microsoft identity, or both.
alter table users drop constraint users_credentials_by_role;
alter table users add constraint users_credentials_by_role check (
    (role = 'GUEST' and email is null and password_hash is null and microsoft_id is null
        and expires_at is not null)
 or (role <> 'GUEST' and email is not null
        and (password_hash is not null or microsoft_id is not null)
        and expires_at is null)
);
