package com.studyos.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.studyos.domain.AppUser;
import com.studyos.domain.Course;
import com.studyos.repo.AppUserRepo;
import com.studyos.repo.CourseRepo;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceTest {
    AppUserRepo users = mock(AppUserRepo.class);
    CourseRepo courses = mock(CourseRepo.class);
    PasswordEncoder passwords = PasswordEncoderFactories.createDelegatingPasswordEncoder();
    Clock clock = Clock.fixed(Instant.parse("2026-09-13T12:00:00Z"), ZoneOffset.UTC);

    @BeforeEach
    void savingHandsOutAnId() {
        when(users.saveAndFlush(any())).thenAnswer(inv -> {
            AppUser user = inv.getArgument(0);
            user.id = 7L;
            return user;
        });
        when(users.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private AuthService service(String inviteCode) {
        return new AuthService(users, courses, passwords, clock, inviteCode);
    }

    @Test
    void withNoInviteCodeConfiguredAnyoneCanSignUpAndOnlyTheHashIsKept() {
        AuthService open = service("");
        assertFalse(open.inviteRequired());
        AppUser user = open.signup("Bryan", "correct horse", null);
        assertEquals("bryan", user.username);
        assertNotEquals("correct horse", user.passwordHash);
        assertTrue(passwords.matches("correct horse", user.passwordHash));
        assertEquals(Instant.parse("2026-09-13T12:00:00Z"), user.createdAt);
    }

    @Test
    void theInviteCodeMustMatchAndSurroundingSpacesDoNotCount() {
        AuthService invited = service("let-me-in");
        assertTrue(invited.inviteRequired());
        assertEquals("bryan", invited.signup("bryan", "correct horse", " let-me-in ").username);
        AuthProblem wrong = assertThrows(AuthProblem.class, () -> invited.signup("friend", "correct horse", "let-me"));
        assertEquals(HttpStatus.FORBIDDEN, wrong.status);
    }

    @Test
    void theFirstAccountAdoptsTheCoursesMadeBeforeAccounts() {
        Course cs47 = new Course();
        Course cs149 = new Course();
        when(users.count()).thenReturn(0L);
        when(courses.findByOwnerIsNull()).thenReturn(List.of(cs47, cs149));

        AppUser user = service("").signup("bryan", "correct horse", null);

        assertSame(user, cs47.owner);
        assertSame(user, cs149.owner);
        verify(courses).saveAll(List.of(cs47, cs149));
    }

    @Test
    void everyLaterAccountStartsEmpty() {
        when(users.count()).thenReturn(1L);
        service("").signup("friend", "correct horse", null);
        verify(courses, never()).findByOwnerIsNull();
        verify(courses, never()).saveAll(any());
    }

    @Test
    void twoSignUpsRacingForOneNameEndInA409NotA500() {
        doThrow(new DataIntegrityViolationException("duplicate key")).when(users).saveAndFlush(any());
        AuthProblem taken = assertThrows(AuthProblem.class, () -> service("").signup("bryan", "correct horse", null));
        assertEquals(HttpStatus.CONFLICT, taken.status);
    }

    @Test
    void requestingAResetStoresOnlyAHashAndReturnsTheRawTokenOnce() {
        AppUser user = existing("bryan", "old password");
        when(users.findByUsername("bryan")).thenReturn(Optional.of(user));

        String token = service("").requestReset("Bryan", null);

        assertNotNull(token);
        assertEquals(64, token.length());
        assertNotNull(user.resetTokenHash);
        assertNotEquals(token, user.resetTokenHash);
        assertEquals(Instant.parse("2026-09-13T13:00:00Z"), user.resetTokenExpiresAt);
        when(users.findByResetTokenHash(user.resetTokenHash)).thenReturn(Optional.of(user));

        AppUser reset = service("").resetPassword(token, "new password");
        assertTrue(passwords.matches("new password", reset.passwordHash));
        assertNull(reset.resetTokenHash);
        assertNull(reset.resetTokenExpiresAt);
    }

    @Test
    void aResetNeedsTheInviteWhenOneIsConfigured() {
        AuthService invited = service("let-me-in");
        AuthProblem wrong = assertThrows(AuthProblem.class, () -> invited.requestReset("bryan", "guess"));
        assertEquals(HttpStatus.FORBIDDEN, wrong.status);
        verify(users, never()).findByUsername(any());
    }

    @Test
    void aMissingAccountOrASpentTokenIsTurnedAway() {
        when(users.findByUsername("nobody")).thenReturn(Optional.empty());
        AuthProblem missing = assertThrows(AuthProblem.class, () -> service("").requestReset("nobody", null));
        assertEquals(HttpStatus.NOT_FOUND, missing.status);

        AuthProblem spent = assertThrows(AuthProblem.class, () -> service("").resetPassword("deadbeef", "new password"));
        assertEquals(HttpStatus.BAD_REQUEST, spent.status);
        assertEquals("That reset code was not accepted.", spent.getMessage());
    }


    @Test
    void anExpiredTokenFromRequestResetIsRefusedAndCleared() {
        AppUser user = existing("bryan", "old password");
        when(users.findByUsername("bryan")).thenReturn(Optional.of(user));
        AuthService svc = service("");
        String token = svc.requestReset("bryan", null);
        user.resetTokenExpiresAt = Instant.parse("2026-09-13T11:00:00Z");
        when(users.findByResetTokenHash(user.resetTokenHash)).thenReturn(Optional.of(user));

        AuthProblem expired = assertThrows(AuthProblem.class, () -> svc.resetPassword(token, "new password"));
        assertEquals(HttpStatus.BAD_REQUEST, expired.status);
        assertNull(user.resetTokenHash);
        assertNull(user.resetTokenExpiresAt);
    }

    private AppUser existing(String username, String password) {
        AppUser user = new AppUser();
        user.id = 7L;
        user.username = username;
        user.passwordHash = passwords.encode(password);
        user.createdAt = Instant.parse("2026-09-13T12:00:00Z");
        return user;
    }
}
