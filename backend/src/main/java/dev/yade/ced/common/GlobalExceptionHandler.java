package dev.yade.ced.common;

import dev.yade.ced.auth.AuthService;
import dev.yade.ced.datasets.DatasetService;
import dev.yade.ced.runs.RunService;
import dev.yade.ced.runs.IllegalRunTransition;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Every failure leaves as an ApiError with a status that says what kind it is.
 *
 * The statuses are the contract, so they are chosen deliberately:
 *   400 the request is malformed or out of range — fix it and retry
 *   401 no valid token
 *   404 no such thing, or none you can see
 *   409 the request is fine but the run is in the wrong state — retrying will not help
 *   422 is deliberately unused; a client cannot act differently on it than 400
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> onValidation(MethodArgumentNotValidException e) {
        // Name every offending field at once. Returning the first means a caller
        // with three mistakes discovers them one round trip at a time.
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(f -> "%s: %s".formatted(f.getField(), f.getDefaultMessage()))
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(ApiError.of(detail.isBlank() ? "Invalid request." : detail));
    }

    @ExceptionHandler(NotFound.class)
    public ResponseEntity<ApiError> onNotFound(NotFound e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError.of(e.getMessage()));
    }

    @ExceptionHandler(IllegalRunTransition.class)
    public ResponseEntity<ApiError> onIllegalTransition(IllegalRunTransition e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of(e.getMessage()));
    }

    @ExceptionHandler(AuthService.EmailAlreadyRegistered.class)
    public ResponseEntity<ApiError> onDuplicateEmail(AuthService.EmailAlreadyRegistered e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of(e.getMessage()));
    }

    @ExceptionHandler(AuthService.InvalidCredentials.class)
    public ResponseEntity<ApiError> onBadCredentials(AuthService.InvalidCredentials e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiError.of(e.getMessage()));
    }

    /**
     * Both of these are "the state you are in does not allow that", which is a
     * conflict rather than a bad request: the same call would have worked
     * before the account was claimed, or after a run was deleted.
     */
    @ExceptionHandler({AuthService.NotAGuest.class, RunService.QuotaExceeded.class,
                       DatasetService.QuotaExceeded.class, DatasetService.NameTaken.class})
    public ResponseEntity<ApiError> onConflictingState(RuntimeException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of(e.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> onIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(ApiError.of(e.getMessage()));
    }

    /** No such resource, or none this caller may see — the API does not distinguish. */
    public static class NotFound extends RuntimeException {
        public NotFound(String message) {
            super(message);
        }
    }
}
