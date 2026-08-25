package dev.yade.ced.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Turns a bearer token into an authenticated request, or leaves the request
 * anonymous.
 *
 * It never rejects anything. Deciding what anonymous may reach is the filter
 * chain's job, and a filter that returned 401 itself would do it for endpoints
 * that are meant to be open.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer ";

    private final JwtService jwt;
    private final UserRepository users;

    public JwtAuthFilter(JwtService jwt, UserRepository users) {
        this.jwt = jwt;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(PREFIX)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            jwt.readSubject(header.substring(PREFIX.length()))
                    // The user is loaded, not trusted from the token. A token
                    // outlives the account it names, and a deleted user whose
                    // token has not expired must not still be able to act.
                    .flatMap(users::findById)
                    // An expired guest is nobody, even while its token is still
                    // signed and unexpired: the purge runs hourly and an account
                    // that is over should stop working when it is over.
                    .filter(user -> !user.isExpired(Instant.now()))
                    .ifPresent(user -> {
                        // Authorities come from the row, not the token, so a
                        // revoked administrator loses the power on the next
                        // request rather than when the token expires.
                        var auth = new UsernamePasswordAuthenticationToken(
                                user, null, user.authorities());
                        auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    });
        }
        chain.doFilter(request, response);
    }
}
