# ced-api

The persistence side of the Concept Evolution Detector: accounts, and the runs
that belong to them.

It does not compute anything. The analysis runs in the browser, on the analyst's
own machine; this service holds the accounts, the datasets, and the record of
what was run — the shape of the stream, the parameters, the progress and the
outcome.

## What it is for

A run takes minutes and a browser tab is a fragile place to keep the only copy of
the result. This service is where a result outlives the tab: addressable, listed
newest-first, and carrying the parameters that produced it, so two results can be
compared months later.

## Running it

```bash
export CED_JWT_SECRET=$(openssl rand -base64 48)
docker compose up -d db          # or point CED_DB_URL at your own PostgreSQL
./mvnw spring-boot:run
```

There is no default signing secret. One committed to a repository is one every
deployment shares, so the application refuses to start without `CED_JWT_SECRET`
rather than falling back to a value an attacker can read here.

```bash
./mvnw verify                    # needs Docker: Testcontainers starts PostgreSQL
```

## The API

All of it is under `/api/v1`, and everything but `auth` needs a bearer token.

| | | |
|---|---|---|
| `POST` | `/auth/register` | → 201 with a token |
| `POST` | `/auth/login` | → 200 with a token |
| `POST` | `/runs` | start a run; the window count is derived, not accepted |
| `GET` | `/runs` | my runs, newest first |
| `GET` | `/runs/{id}` | one run, with its result if it has one |
| `PATCH` | `/runs/{id}/progress` | how many windows are done |
| `POST` | `/runs/{id}/result` | the outcome, once |
| `DELETE` | `/runs/{id}` | |

A run is `RUNNING`, then `SUCCEEDED` or `FAILED`, and a finished run is final.

## Decisions worth knowing

**Another user's run is 404, not 403.** A 403 confirms the id exists, which is
the one thing someone guessing ids wants to learn. The repository only offers
`findByIdAndOwner`, so there is no code path that loads a run without knowing
whose it is.

**A result can be submitted once.** A client that retried after a timeout it
could not tell apart from a failure would otherwise replace a good result with a
second one, silently. The second attempt is a 409.

**Progress is monotonic.** Two in-flight reports can arrive out of order, and
applying the older one makes the bar jump backwards.

**The window count is derived from the stream length, not taken from the
client.** A caller reporting its own total could show a bar reaching 100% having
analysed a third of the stream.

**And it is derived from the feature count, not the sample count.** A feature
stream holds its samples fixed and gains columns over time, so a window is a
block of columns. Deriving from samples — which this service did until the two
halves were wired together and disagreed — refuses every benchmark in the
repository, since they hold tens of samples against thousands of features. The
rule matches the Python side exactly, halves-to-even included, because a result
computed under a different count is rejected for reporting the wrong number of
cluster counts.

**Parameters live on the run, not on the server.** The previous design kept one
mutable set for the whole process, so two people tuning at once tuned each
other's runs and a stored result carried no record of its own inputs.

**A wrong password and an unknown address are answered identically, and take the
same time.** Returning early on an unknown address skips the hash comparison, and
the difference between "no hash computed" and "bcrypt computed" is measurable
from outside — which puts the disclosure back through the clock.

**The schema is owned by migrations, and Hibernate only validates against it.**
`ddl-auto=validate` turns a drift between an entity and a table into a startup
failure naming the column, rather than an altered production schema.

## Stack

Java 21, Spring Boot 4.1, Spring Security 7, PostgreSQL, Flyway, Testcontainers.
Thirty integration tests through the real HTTP stack; none of them mock the
database, the filter chain, or each other.
