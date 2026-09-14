package com.studyos.auth;

import com.studyos.domain.AppUser;
import com.studyos.domain.Course;
import com.studyos.repo.AppUserRepo;
import com.studyos.repo.CourseRepo;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
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
    private final AppUserRepo users;
    private final CourseRepo courses;
    private final PasswordEncoder passwords;
    private final Clock clock;
    private final byte[] inviteCode;

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
        if (inviteRequired() && (invite == null
                || !MessageDigest.isEqual(inviteCode, invite.strip().getBytes(StandardCharsets.UTF_8)))) {
            throw new AuthProblem(HttpStatus.FORBIDDEN, "That invite code was not accepted.");
        }
        String name = normalize(username);
        if (!USERNAME.matcher(name).matches()) {
            throw new AuthProblem(HttpStatus.BAD_REQUEST,
                "A username is 3 to 32 letters, numbers, dots, dashes or underscores.");
        }
        if (password == null || password.length() < 8 || password.length() > 128) {
            throw new AuthProblem(HttpStatus.BAD_REQUEST, "A password is 8 to 128 characters.");
        }
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

    /** The session identity of an account whose password was just checked. */
    public SignedIn signedIn(String username) {
        AppUser user = users.findByUsername(normalize(username)).orElseThrow();
        return new SignedIn(user.id, user.username);
    }
}
