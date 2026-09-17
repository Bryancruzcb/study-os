package com.studyos.auth;

import com.studyos.domain.AppUser;
import com.studyos.domain.Course;
import com.studyos.repo.AppUserRepo;
import com.studyos.repo.CourseRepo;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final Pattern USERNAME = Pattern.compile("[a-z0-9._-]{3,32}");
    private static final int RESET_TOKEN_BYTES = 32;
    private static final int RESET_HOURS = 1;
    private final AppUserRepo users;
    private final CourseRepo courses;
    private final PasswordEncoder passwords;
    private final Clock clock;
    private final byte[] inviteCode;
    private final SecureRandom random = new SecureRandom();

    public AuthService(AppUserRepo users, CourseRepo courses, PasswordEncoder passwords, Clock clock,
                       @Value("${app.invite-code:}") String inviteCode) {
        this.users = users;
        this.courses = courses;
        this.passwords = passwords;
        this.clock = clock;
        this.inviteCode = inviteCode.strip().getBytes(StandardCharsets.UTF_8);
    }

    /** Uploads and grading spend API credit, so a public host gives out sign-ups by invite only. */
    public boolean inviteRequired() {
        return inviteCode.length > 0;
    }

    /** Usernames are kept trimmed and lowercased, so "Bryan " signs in as "bryan". */
    public static String normalize(String username) {
        return username == null ? "" : username.strip().toLowerCase(Locale.ROOT);
    }

    @Transactional
    public AppUser signup(String username, String password, String invite) {
        // the invite is checked first, so without one nothing can be learned about which names are taken
        requireInvite(invite);
        String name = normalize(username);
        if (!USERNAME.matcher(name).matches()) {
            throw new AuthProblem(HttpStatus.BAD_REQUEST,
                "A username is 3 to 32 letters, numbers, dots, dashes or underscores.");
        }
        requirePassword(password);
        if (users.existsByUsername(name)) {
            throw new AuthProblem(HttpStatus.CONFLICT, "That username is taken.");
        }
        boolean first = users.count() == 0;
        AppUser user = new AppUser();
        user.username = name;
        user.passwordHash = passwords.encode(password);
        user.createdAt = Instant.now(clock);
        try {
            user = users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // two sign-ups racing for one name: the unique column settles it, and the loser hears why
            throw new AuthProblem(HttpStatus.CONFLICT, "That username is taken.");
        }
        if (first) {
            // Courses made before accounts existed belong to nobody. The first account is the person who
            // ran the app alone until now, so it takes them over, and every later account starts empty.
            List<Course> unowned = courses.findByOwnerIsNull();
            for (Course course : unowned) course.owner = user;
            courses.saveAll(unowned);
        }
        return user;
    }

    /**
     * Starts a password reset. On a public host the invite is required first, the same gate as
     * sign-up, so a stranger who only knows a username cannot take the account. The raw token is
     * returned once; only its hash is stored, and it expires in an hour.
     */
    @Transactional
    public String requestReset(String username, String invite) {
        requireInvite(invite);
        String name = normalize(username);
        AppUser user = users.findByUsername(name)
            .orElseThrow(() -> new AuthProblem(HttpStatus.NOT_FOUND, "No account has that username."));
        byte[] raw = new byte[RESET_TOKEN_BYTES];
        random.nextBytes(raw);
        String token = HexFormat.of().formatHex(raw);
        user.resetTokenHash = hashToken(token);
        user.resetTokenExpiresAt = Instant.now(clock).plus(RESET_HOURS, ChronoUnit.HOURS);
        users.save(user);
        return token;
    }

    /**
     * Consumes a reset token and sets a new password. A missing, spent or expired token gets one
     * sentence, so a guess learns nothing about which.
     */
    @Transactional
    public AppUser resetPassword(String token, String password) {
        requirePassword(password);
        if (token == null || token.isBlank()) {
            throw new AuthProblem(HttpStatus.BAD_REQUEST, "That reset code was not accepted.");
        }
        AppUser user = users.findByResetTokenHash(hashToken(token.strip()))
            .orElseThrow(() -> new AuthProblem(HttpStatus.BAD_REQUEST, "That reset code was not accepted."));
        if (user.resetTokenExpiresAt == null || user.resetTokenExpiresAt.isBefore(Instant.now(clock))) {
            user.resetTokenHash = null;
            user.resetTokenExpiresAt = null;
            users.save(user);
            throw new AuthProblem(HttpStatus.BAD_REQUEST, "That reset code was not accepted.");
        }
        user.passwordHash = passwords.encode(password);
        user.resetTokenHash = null;
        user.resetTokenExpiresAt = null;
        return users.save(user);
    }

    /** The session identity of an account whose password was just checked. */
    public SignedIn signedIn(String username) {
        AppUser user = users.findByUsername(normalize(username)).orElseThrow();
        return new SignedIn(user.id, user.username);
    }

    public SignedIn signedIn(AppUser user) {
        return new SignedIn(user.id, user.username);
    }

    private void requireInvite(String invite) {
        if (inviteRequired() && (invite == null
                || !MessageDigest.isEqual(inviteCode, invite.strip().getBytes(StandardCharsets.UTF_8)))) {
            throw new AuthProblem(HttpStatus.FORBIDDEN, "That invite code was not accepted.");
        }
    }

    private static void requirePassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 128) {
            throw new AuthProblem(HttpStatus.BAD_REQUEST, "A password is 8 to 128 characters.");
        }
    }

    private static String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
