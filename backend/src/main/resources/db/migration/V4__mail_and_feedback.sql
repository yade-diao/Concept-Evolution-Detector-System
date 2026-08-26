-- Registration by verification code, and the messages that come back.
--
-- Two tables and a log, shaped by one constraint: this server cannot send mail
-- itself. Azure blocks outbound port 25 on every virtual machine, and the
-- deployment's name is a *.cloudapp.azure.com subdomain, which cannot carry MX
-- records - so there is no delivering directly and no receiving at all. Mail
-- goes out through a relay on 587; anything coming back comes back through the
-- application, not through SMTP.

-- A registration that has been asked for but not completed.
--
-- Separate from users on purpose: an address with an unconfirmed code is not an
-- account, and putting it in users would mean a row that cannot sign in, does
-- not count against anything, and has to be excluded from every query that
-- means "a person".
create table pending_registrations (
    email         text        primary key,
    password_hash text        not null,

    -- The code is stored as a SHA-256 hash. It is six digits and lives fifteen
    -- minutes, so this is not about brute force - it is so that a copy of this
    -- table is not a list of live codes for addresses that are about to become
    -- accounts.
    code_hash     text        not null,
    attempts      integer     not null default 0 check (attempts >= 0),
    expires_at    timestamptz not null,
    created_at    timestamptz not null default now()
);

create index pending_registrations_expires_idx on pending_registrations (expires_at);

-- What someone wanted to tell whoever runs this.
create table messages (
    id         uuid        primary key,
    -- Null when it was sent by someone not signed in, which is most of them.
    sender_id  uuid        references users (id) on delete set null,
    -- Optional, and only what they typed: there is no way to verify it and no
    -- promise made about replying to it.
    reply_to   text,
    subject    text        not null check (length(subject) between 1 and 200),
    body       text        not null check (length(body) between 1 and 5000),
    read_at    timestamptz,
    created_at timestamptz not null default now()
);

create index messages_unread_idx on messages (created_at desc) where read_at is null;

-- Every attempt to send something, and what happened.
--
-- Kept because when a verification code does not arrive, this is the only place
-- that can say whether the problem is the relay, the address, or the code never
-- having been generated. The body is never stored - a log of codes would defeat
-- the point of hashing them next door.
create table mail_log (
    id         uuid        primary key,
    recipient  text        not null,
    subject    text        not null,
    delivered  boolean     not null,
    detail     text,
    created_at timestamptz not null default now()
);

create index mail_log_recent_idx on mail_log (created_at desc);
