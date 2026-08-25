-- Roles, and accounts that expire.
--
-- Two things the first schema could not say.
--
-- A **guest** has no address and no password. It exists so that a visitor who
-- has not signed up can still keep the runs they started, and it is deleted -
-- with its runs, by the cascade already on runs.owner_id - once it expires.
-- Giving a guest a fabricated address instead would have been less code and a
-- lie in the data: nothing would distinguish it from an account someone owns.
--
-- An **administrator** is an ordinary account with one extra authority. The
-- role lives here rather than in the token, so taking it away takes effect on
-- the next request rather than whenever the token happens to expire.

alter table users
    add column role       text not null default 'USER',
    add column expires_at timestamptz;

alter table users alter column email drop not null;
alter table users alter column password_hash drop not null;

alter table users
    add constraint users_role_valid check (role in ('USER', 'ADMIN', 'GUEST')),
    -- A guest has neither credential and must expire; anyone else has both and
    -- must not. Written as a constraint because this is exactly the invariant a
    -- later code path forgets - an "upgrade this guest" that sets the email and
    -- leaves expires_at would otherwise produce an account that silently
    -- deletes itself a week after someone chose a password for it.
    add constraint users_credentials_by_role check (
        (role = 'GUEST' and email is null and password_hash is null and expires_at is not null)
     or (role <> 'GUEST' and email is not null and password_hash is not null and expires_at is null)
    );

-- The purge asks for what has expired and nothing else reads this column.
create index users_expires_at_idx on users (expires_at) where expires_at is not null;
