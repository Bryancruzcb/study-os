package com.studyos;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindingResult;
import org.springframework.validation.method.MethodValidationResult;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Every failed call answers {"error": "<a sentence for the page>"}, the shape the sign-in endpoints
 * already send, so the page shows what went wrong instead of a status and a URL. Spring Boot leaves
 * an exception's message out of its own error body, which is why a reason such as "Pick at least one
 * concept." never reached the page before this.
 *
 * <p>A request the code turned down on purpose (a 4xx ResponseStatusException with a reason) keeps
 * its reason, because that was written for the student. Spring's own request failures (a malformed
 * body, a missing parameter, an upload over the limit) get a sentence for their status, and a
 * validation failure keeps its message only when the message was written as a sentence. A 5xx never
 * says what broke: the details go to the log, and the page gets one generic sentence.
 */
@RestControllerAdvice
public class ApiErrors extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

    static final String SERVER_PROBLEM = "Study OS hit a problem on the server. Try again in a moment.";
    static final String SOMETHING_WENT_WRONG = "Something went wrong. Try again.";

    /* anything no closer handler claimed is a bug or an outage, never something the student did */
    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> unexpected(Exception ex, WebRequest request) {
        return handleExceptionInternal(ex, null, new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
    }

    /* every handler, Spring's and the one above, ends here, so this is the one place the body is made */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                             HttpStatusCode status, WebRequest request) {
        if (status.is5xxServerError()) {
            log.error("{} failed with {}", request.getDescription(false), status.value(), ex);
        }
        return super.handleExceptionInternal(ex, Map.of("error", sentence(ex, status)), headers, status, request);
    }

    static String sentence(Exception ex, HttpStatusCode status) {
        if (status.is5xxServerError()) return SERVER_PROBLEM;
        if (ex instanceof ResponseStatusException refused && refused.getReason() != null
                && !refused.getReason().isBlank()) {
            return refused.getReason();
        }
        return validationSentence(ex).orElse(forStatus(status.value()));
    }

    /* "Give the exam a name." passes through; a stock message such as "must not be blank" does not */
    private static Optional<String> validationSentence(Exception ex) {
        List<? extends MessageSourceResolvable> errors =
            ex instanceof BindingResult bound ? bound.getAllErrors()
            : ex instanceof MethodValidationResult checked ? checked.getAllErrors()
            : List.of();
        return errors.stream()
            .map(MessageSourceResolvable::getDefaultMessage)
            .filter(ApiErrors::readsAsSentence)
            .findFirst();
    }

    static boolean readsAsSentence(String message) {
        if (message == null || message.isBlank()) return false;
        String text = message.strip();
        char last = text.charAt(text.length() - 1);
        return Character.isUpperCase(text.charAt(0)) && (last == '.' || last == '?' || last == '!');
    }

    /* the same sentences the page falls back on in frontend/src/errors.ts, so both read alike */
    static String forStatus(int status) {
        return switch (status) {
            case 400 -> "That request wasn't valid.";
            case 401 -> "Your sign-in ended. Sign in again.";
            case 403 -> "You don't have access to that.";
            case 404 -> "That isn't there any more. It may have been deleted.";
            case 409 -> "That changed while you were working. Reload and try again.";
            case 413 -> "That file is too big to upload (the limit is 32 MB).";
            case 429 -> "Too many requests. Wait a moment and try again.";
            default -> SOMETHING_WENT_WRONG;
        };
    }
}
