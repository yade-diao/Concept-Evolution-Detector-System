package dev.yade.ced.common;

import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * A ceiling on how often one address may try to authenticate.
 *
 * The authentication endpoints are the only ones anyone can reach without
 * already having a token, which makes them the only ones worth grinding: a
 * password list against /login, or an unbounded run of /register filling the
 * users table. BCrypt at cost 10 also means every attempt costs the server
 * 50-100ms of CPU, so on a one-core machine a few hundred attempts a minute is
 * a denial of service whether or not any of them succeed.
 *
 * A token bucket per client address, in memory. In memory is the right size for
 * this: there is one instance, and a limiter that survives restarts would need a
 * datastore to protect a server that has no state worth protecting for the
 * seconds a restart takes.
 *
 * The address comes from `request.getRemoteAddr()`, which is the real client
 * only because `server.forward-headers-strategy=framework` is set and the API is
 * reachable exclusively through the deployment's proxy - nothing else can route
 * to it, so nothing else can put a chosen address in those headers.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final String PROTECTED_PREFIX = "/api/v1/auth";

    /** Above this many tracked addresses, the idle ones are dropped. */
    private static final int MAX_TRACKED = 10_000;

    private final boolean enabled;
    private final int perMinute;
    private final ObjectMapper json;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public RateLimitFilter(@Value("${ced.rate-limit.enabled:true}") boolean enabled,
                           @Value("${ced.rate-limit.auth-per-minute:20}") int perMinute,
                           ObjectMapper json) {
        this.enabled = enabled;
        this.perMinute = perMinute;
        this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !enabled || !request.getRequestURI().startsWith(PROTECTED_PREFIX);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String client = request.getRemoteAddr();
        if (bucketFor(client).tryConsume(System.nanoTime())) {
            chain.doFilter(request, response);
            return;
        }

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", "60");
        json.writeValue(response.getOutputStream(), ApiError.of(
                "Too many attempts from this address. Wait a minute and try again."));
    }

    private Bucket bucketFor(String client) {
        if (buckets.size() > MAX_TRACKED) {
            long stale = System.nanoTime() - 10L * 60 * 1_000_000_000L;
            buckets.values().removeIf(bucket -> bucket.idleSince(stale));
        }
        return buckets.computeIfAbsent(client, key -> new Bucket(perMinute));
    }

    /**
     * Tokens that refill continuously rather than resetting on the minute.
     *
     * A fixed window lets twice the limit through across its edge - the whole
     * allowance at 59 seconds and the whole allowance again at 61 - which is
     * exactly the burst the limit exists to prevent.
     */
    private static final class Bucket {

        private final double capacity;
        private final double perNano;
        private double tokens;
        private long lastRefill;

        Bucket(int perMinute) {
            this.capacity = perMinute;
            this.perNano = perMinute / 60_000_000_000d;
            this.tokens = perMinute;
            this.lastRefill = System.nanoTime();
        }

        synchronized boolean tryConsume(long now) {
            tokens = Math.min(capacity, tokens + (now - lastRefill) * perNano);
            lastRefill = now;
            if (tokens < 1) return false;
            tokens -= 1;
            return true;
        }

        synchronized boolean idleSince(long instant) {
            return lastRefill < instant;
        }
    }
}
