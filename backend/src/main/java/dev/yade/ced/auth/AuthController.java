package dev.yade.ced.auth;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthDtos.Token> register(@Valid @RequestBody AuthDtos.Register request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(auth.register(request));
    }

    @PostMapping("/login")
    public AuthDtos.Token login(@Valid @RequestBody AuthDtos.Login request) {
        return auth.login(request);
    }

    /**
     * A session with no account behind it.
     *
     * Nothing is asked for, so nothing is verified; the visitor gets somewhere
     * to keep runs and a week to decide whether they want it to be permanent.
     */
    @PostMapping("/guest")
    public ResponseEntity<AuthDtos.Token> guest() {
        return ResponseEntity.status(HttpStatus.CREATED).body(auth.guest());
    }

    /** Who this token names, and what it may do. */
    @org.springframework.web.bind.annotation.GetMapping("/me")
    public AuthDtos.Me me(@AuthenticationPrincipal User me) {
        return new AuthDtos.Me(me.getId(), me.displayName(), me.getRole(), me.getExpiresAt());
    }

    /** Keep what this guest already ran, under an account that stays. */
    @PostMapping("/claim")
    public AuthDtos.Token claim(@AuthenticationPrincipal User me,
                                @Valid @RequestBody AuthDtos.Claim request) {
        return auth.claim(me, request);
    }
}
