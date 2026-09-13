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
}
