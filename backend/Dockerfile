# The API as a container, built from source so the image never depends on a jar
# someone built on a laptop.
#
# Tests are not run here. They need Docker themselves - the suite is integration
# tests against a real PostgreSQL through Testcontainers - and a build that ran
# them again would run them in an environment less like production than the CI
# job that already did. `backend.yml` runs the tests and only then builds this.

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /build

# Dependencies first, so a source-only change does not re-download the world.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -DskipTests package \
    && mv target/*.jar app.jar

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jre AS runtime

WORKDIR /app

# curl is here for the health check below and nothing else; the JRE image ships
# without it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Nothing here needs root, and a JVM that cannot write outside /tmp is one less
# thing to think about if the API is ever wrong about an upload path.
RUN useradd --create-home --shell /usr/sbin/nologin ced
USER ced

COPY --from=build --chown=ced:ced /build/app.jar app.jar

EXPOSE 8080

# The container tells the orchestrator when it is actually ready, rather than
# when the process started: Flyway migrations run before the port opens, and a
# proxy that routes to it too early answers 502 to a real user.
#
# /actuator/health and not one of its probes: SecurityConfig permits that exact
# path, and the sub-paths need a token the health check does not have.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["sh", "-c", "curl -fsS http://localhost:8080/actuator/health || exit 1"]

# Container memory, not the host's: without this the JVM sizes its heap from the
# machine and a 1 GB droplet is killed by the OOM reaper instead of throwing.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
