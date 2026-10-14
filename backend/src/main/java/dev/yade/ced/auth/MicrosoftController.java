package dev.yade.ced.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The two halves of "Sign in with Microsoft", and what the sign-in page needs
 * to know before it offers it.
 *
 * Both halves are top-level browser navigations, not API calls, so they answer
 * with redirects. The token is handed to the page in the URL fragment, which
 * the browser never sends to a server or puts in a Referer.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class MicrosoftController {

    private static final String COOKIE = "ced_ms";
    private static final String COOKIE_PATH = "/api/v1/auth/microsoft";

    private final MicrosoftSignIn microsoft;
    private final AuthService auth;

    public MicrosoftController(MicrosoftSignIn microsoft, AuthService auth) {
        this.microsoft = microsoft;
        this.auth = auth;
    }

    /** Which ways in this deployment has, so the page offers only those. */
    @GetMapping("/options")
    public Map<String, Boolean> options() {
        return Map.of("microsoft", microsoft.enabled(),
                      "verifiesEmail", auth.verificationRequired());
    }

    @GetMapping("/microsoft/start")
    public ResponseEntity<Void> start() {
        if (!microsoft.enabled()) {
            return ResponseEntity.notFound().build();
        }
        MicrosoftSignIn.Started started = microsoft.start();
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, started.url())
                .header(HttpHeaders.SET_COOKIE, cookie(started.cookie(), 600).toString())
                .build();
    }

    @GetMapping("/microsoft/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            @RequestParam(name = "error_description", required = false) String description,
            @CookieValue(name = COOKIE, required = false) String remembered) {
        String fragment;
        if (error != null) {
            // Cancelling on Microsoft's page is the common case and not worth
            // their error text, which is written for developers.
            fragment = "microsoft-error=" + encode("access_denied".equals(error)
                    ? "The Microsoft sign-in was cancelled."
                    : "Microsoft could not sign you in.");
        } else {
            try {
                MicrosoftSignIn.Identity who = microsoft.finish(code, state, remembered);
                AuthDtos.Token token = auth.signInWithMicrosoft(who.id(), who.email());
                fragment = "microsoft=" + encode(token.accessToken())
                        + "&expires=" + token.expiresInSeconds()
                        + "&email=" + encode(who.email());
            } catch (MicrosoftSignIn.Failed e) {
                fragment = "microsoft-error=" + encode(e.getMessage());
            } catch (AuthService.EmailAlreadyRegistered e) {
                fragment = "microsoft-error=" + encode("That address already has an account "
                        + "here with a password. Sign in with the password instead.");
            }
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, "/signin#" + fragment)
                .header(HttpHeaders.SET_COOKIE, cookie("", 0).toString())
                .build();
    }

    /**
     * Lax, not Strict: the callback is a top-level navigation from Microsoft's
     * domain, and Strict would leave the cookie behind on exactly that request.
     */
    private static ResponseCookie cookie(String value, long seconds) {
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true).secure(true).sameSite("Lax")
                .path(COOKIE_PATH).maxAge(seconds).build();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
