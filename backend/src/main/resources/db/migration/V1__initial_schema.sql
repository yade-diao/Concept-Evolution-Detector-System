-- Users, and the runs that belong to them.
--
-- Written as a migration rather than generated from the entities. Hibernate's
-- ddl-auto can produce a schema, but it produces whatever the entities happen to
-- say today, which means the shape of production data is decided by a field
-- someone renamed. A migration is reviewable, and the column comments below are
-- the constraints that the Java types cannot express.

create table users (
    id            uuid        primary key,
    email         text        not null,
    password_hash text        not null,
    created_at    timestamptz not null default now()
);

-- Case-insensitively unique: addresses are compared by the person typing them,
-- not by the byte. A plain unique index would let Alice@x.com and alice@x.com
-- both register and then race for the same identity.
create unique index users_email_key on users (lower(email));

create table runs (
    id           uuid        primary key,
    owner_id     uuid        not null references users (id) on delete cascade,
    state        text        not null,
    dataset_name text        not null,

    -- Shape of the stream the client analysed. Recorded because a result read
    -- months later means nothing without knowing what it was computed over.
    samples      integer     not null check (samples >= 2),
    features     integer     not null check (features >= 1),

    -- The parameters that produced this result, stored with it. The previous
    -- design kept one mutable set of parameters for the whole server, so a
    -- result carried no record of its own inputs and two results could not be
    -- compared.
    kernel_type          smallint         not null check (kernel_type between 1 and 5),
    sigma                double precision not null check (sigma > 0),
    neighbour_fraction   double precision not null check (neighbour_fraction > 0 and neighbour_fraction <= 1),
    similarity_threshold double precision not null check (similarity_threshold >= 0 and similarity_threshold <= 1),
    window_size          integer          not null check (window_size >= 2),

    windows_total integer not null check (windows_total >= 1),
    windows_done  integer not null default 0 check (windows_done >= 0),
    constraint runs_progress_within_total check (windows_done <= windows_total),

    -- Set together when the run succeeds. jsonb rather than side tables: these
    -- are read back whole, never queried by element, and a shape that only the
    -- algorithm defines does not want a schema of its own.
    best_rand_index double precision,
    cluster_counts  jsonb,
    events          jsonb,

    -- Set instead when it fails. A run cannot be both, and cannot be neither
    -- once it has finished.
    error text,

    created_at  timestamptz not null default now(),
    finished_at timestamptz,

    constraint runs_state_valid check (state in ('RUNNING', 'SUCCEEDED', 'FAILED')),
    constraint runs_finished_has_outcome check (
        (state = 'RUNNING'   and finished_at is null and error is null and best_rand_index is null)
     or (state = 'SUCCEEDED' and finished_at is not null and error is null and best_rand_index is not null)
     or (state = 'FAILED'    and finished_at is not null and error is not null)
    )
);

-- Listing is always "my runs, newest first", which is the whole index.
create index runs_owner_created_idx on runs (owner_id, created_at desc);
