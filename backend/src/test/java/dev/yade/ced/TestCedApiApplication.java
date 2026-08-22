package dev.yade.ced;

import org.springframework.boot.SpringApplication;

public class TestCedApiApplication {

	public static void main(String[] args) {
		SpringApplication.from(CedApiApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
