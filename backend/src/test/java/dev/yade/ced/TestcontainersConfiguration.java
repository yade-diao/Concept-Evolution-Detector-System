package dev.yade.ced;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		// Pinned. "latest" makes the test suite depend on whatever was published
		// this morning, so a green run and a red one can differ by a database
		// nobody chose to upgrade.
		return new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
	}

}
