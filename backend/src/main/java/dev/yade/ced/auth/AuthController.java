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
    public ResponseEntity<AuthDtos.Registration> register(
            @Valid @RequestBody AuthDtos.Register request) {
        AuthDtos.Registration result = auth.register(request);
        // 201 when there is an account, 202 when there is a code in flight: the
        // status says whether anything was created, which is the difference.
        return ResponseEntity
                .status(result.token() != null ? HttpStatus.CREATED : HttpStatus.ACCEPTED)
                .body(result);
    }

    /** Finish a registration with the code that was mailed. */
    @PostMapping("/verify")
    public ResponseEntity<AuthDtos.Token> verify(@Valid @RequestBody AuthDtos.Verify request) {
        return auth.verify(request)
                .map(token -> ResponseEntity.status(HttpStatus.CREATED).body(token))
                .orElseThrow(AuthService.InvalidCode::new);
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
