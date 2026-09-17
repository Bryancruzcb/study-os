package com.studyos.auth;

import com.studyos.domain.AppUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

/**
 * Sign-up, sign-in and sign-out for the page's own form. Signing in here does by hand what a login
 * filter would do: a fresh session id, the identity saved into the session, and a new CSRF token.
 * Password reset is the same form's forgot and set-new-password steps, with a one-time token.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final AuthenticationManager authenticationManager;
    private final CsrfAuthenticationStrategy csrfRotation;
    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();
    private final SecurityContextLogoutHandler logoutHandler = new SecurityContextLogoutHandler();

    public AuthController(AuthService authService, AuthenticationManager authenticationManager,
                          CookieCsrfTokenRepository csrfTokens) {
        this.authService = authService;
        this.authenticationManager = authenticationManager;
        this.csrfRotation = new CsrfAuthenticationStrategy(csrfTokens);
    }

    public record Credentials(String username, String password) {}
    public record Signup(String username, String password, String inviteCode) {}
    public record Forgot(String username, String inviteCode) {}
    public record Reset(String token, String password) {}

    /* whether the sign-up form has to ask for an invite code */
    @GetMapping("/config")
    public Map<String, Boolean> config() {
        return Map.of("inviteRequired", authService.inviteRequired());
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, String>> me(@AuthenticationPrincipal SignedIn me) {
        if (me == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(Map.of("username", me.username()));
    }

    @PostMapping("/signup")
    public Map<String, String> signup(@RequestBody Signup body, HttpServletRequest request,
                                      HttpServletResponse response) {
        AppUser user = authService.signup(body.username(), body.password(), body.inviteCode());
        return signIn(new SignedIn(user.id, user.username), request, response);
    }

    @PostMapping("/login")
    public Map<String, String> login(@RequestBody Credentials body, HttpServletRequest request,
                                     HttpServletResponse response) {
        String username = AuthService.normalize(body.username());
        try {
            authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(username, body.password()));
        } catch (AuthenticationException e) {
            // one sentence for a wrong password and a missing account, so a guess learns neither
            throw new AuthProblem(HttpStatus.UNAUTHORIZED, "Wrong username or password.");
        }
        return signIn(authService.signedIn(username), request, response);
    }

    @PostMapping("/forgot-password")
    public Map<String, String> forgot(@RequestBody Forgot body) {
        String token = authService.requestReset(body.username(), body.inviteCode());
        return Map.of("resetToken", token);
    }

    @PostMapping("/reset-password")
    public Map<String, String> reset(@RequestBody Reset body, HttpServletRequest request,
                                     HttpServletResponse response) {
        AppUser user = authService.resetPassword(body.token(), body.password());
        return signIn(authService.signedIn(user), request, response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        logoutHandler.logout(request, response, SecurityContextHolder.getContext().getAuthentication());
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(AuthProblem.class)
    public ResponseEntity<Map<String, String>> problem(AuthProblem problem) {
        return ResponseEntity.status(problem.status).body(Map.of("error", problem.getMessage()));
    }

    private Map<String, String> signIn(SignedIn who, HttpServletRequest request, HttpServletResponse response) {
        // a new session id, so an id someone planted before sign-in is worth nothing after it
        if (request.getSession(false) != null) request.changeSessionId();
        var authentication = UsernamePasswordAuthenticationToken.authenticated(who, null, List.of());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        // the token issued to the signed-out page is replaced, and loading the new one writes its cookie
        csrfRotation.onAuthentication(authentication, request, response);
        CsrfToken fresh = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (fresh != null) fresh.getToken();
        return Map.of("username", who.username());
    }
}
