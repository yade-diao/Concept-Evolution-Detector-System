package dev.yade.ced.config;

import dev.yade.ced.auth.JwtAuthFilter;
import dev.yade.ced.common.ApiError;
// Spring Boot 4 ships Jackson 3, whose packages moved from com.fasterxml to tools.
import tools.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {

    private final JwtAuthFilter jwtFilter;
    private final ObjectMapper json;

    public SecurityConfig(JwtAuthFilter jwtFilter, ObjectMapper json) {
        this.jwtFilter = jwtFilter;
        this.json = json;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // Cost 10 is BCrypt's default and roughly 50-100ms per hash here, which
        // is the point: it is slow enough to matter to someone testing a stolen
        // password list, and cheap enough that a login is not noticeably slower.
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // No cookies and no session, so there is no ambient authority for
                // a forged cross-site request to ride on. CSRF protection guards
                // exactly that, and enabling it against a bearer-token API only
                // adds a token nobody can send.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Claiming turns the guest you already are into an
                        // account, so it needs the guest's token - it is the one
                        // endpoint under /auth that is not open.
                        .requestMatchers("/api/v1/auth/claim", "/api/v1/auth/me").authenticated()
                        .requestMatchers("/api/v1/auth/**").permitAll()
                        // Anyone may report something. Requiring an account
                        // first is how you stop hearing about what is broken -
                        // and the reader of these is an administrator either way.
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                "/api/v1/feedback").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        // A guest gets the examples and its own runs. Storage
                        // belongs to accounts: 25 MB for anyone who asks, with
                        // no address to ask about it, is not an offer this can
                        // make.
                        .requestMatchers("/api/v1/datasets/**").hasAnyRole("USER", "ADMIN")
                        .requestMatchers("/actuator/health").permitAll()
                        .anyRequest().authenticated())
                // Answer an unauthenticated request in the same shape as every
                // other error. The default is an empty body, which leaves a
                // client parsing JSON with nothing to parse.
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((request, response, ex) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            json.writeValue(response.getOutputStream(),
                                    ApiError.of("Authentication is required. Send a bearer token."));
                        })
                        .accessDeniedHandler((request, response, ex) -> {
                            response.setStatus(HttpStatus.FORBIDDEN.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            json.writeValue(response.getOutputStream(),
                                    ApiError.of("You are not allowed to do that."));
                        }))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
