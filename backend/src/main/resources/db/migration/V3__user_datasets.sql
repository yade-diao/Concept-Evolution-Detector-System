-- Datasets an account uploaded.
--
-- The bytes live here, in the row. A dataset is a few megabytes and the quota
-- is 25 MB per account, so the whole store fits in the database an order of
-- magnitude below where object storage would start to pay for itself - and a
-- bytea column cannot get out of step with a filesystem the way a path can.
--
-- Uploading is optional and always second: the browser can read a file, cache
-- it locally and run on it without the server ever seeing it. This table is for
-- the visitor who wants the same file on their other machine.

create table datasets (
    id         uuid        primary key,
    owner_id   uuid        not null references users (id) on delete cascade,

    -- What the person called it, and the name the browser addresses it by.
    -- Unique per owner: two files with the same name in one account is a
    -- mistake nobody meant to make.
    name       text        not null check (length(name) between 1 and 120),

    samples    integer     not null check (samples >= 2),
    features   integer     not null check (features >= 2),
    classes    integer     not null check (classes >= 1),

    -- Row-major float64 feature matrix and the label vector, as the client
    -- parsed them. Stored rather than the original file: the parse already
    -- happened in the browser, the formats it accepts are its business, and a
    -- second parser on the server is a second place for them to disagree.
    features_blob bytea    not null,
    labels_blob   bytea    not null,
    size_bytes    bigint   not null check (size_bytes > 0),

    created_at timestamptz not null default now()
);

create unique index datasets_owner_name_key on datasets (owner_id, lower(name));

-- The quota is a sum over this index, asked on every upload.
create index datasets_owner_idx on datasets (owner_id, created_at desc);
