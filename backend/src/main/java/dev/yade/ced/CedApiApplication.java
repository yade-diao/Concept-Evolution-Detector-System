package dev.yade.ced;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// Scheduling is on for exactly one job: deleting guest accounts once they
// expire. See GuestPurge.
@EnableScheduling
@SpringBootApplication
public class CedApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(CedApiApplication.class, args);
	}

}
