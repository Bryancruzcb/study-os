package com.studyos.auth;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.AppUser;
import com.studyos.repo.AppUserRepo;
import com.studyos.repo.CourseRepo;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, AccountsConfig.class, AuthService.class})
@TestPropertySource(properties = "app.invite-code=let-me-in")
class AuthControllerTest {
    @TestConfiguration
    static class FixedClock {
        @Bean Clock clock() { return Clock.fixed(Instant.parse("2026-09-13T12:00:00Z"), ZoneOffset.UTC); }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired PasswordEncoder passwords;
    @MockBean AppUserRepo users;
    @MockBean CourseRepo courses;

    @BeforeEach
    void savingHandsOutAnId() {
        when(users.saveAndFlush(any())).thenAnswer(inv -> {
            AppUser user = inv.getArgument(0);
            user.id = 7L;
            return user;
        });
    }

    @Test
    void signingUpSignsInAndTheSessionKnowsTheAccount() throws Exception {
        MvcResult result = signup(Map.of("username", "  Bryan ", "password", "correct horse", "inviteCode", "let-me-in"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("bryan"))
            .andReturn();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);

        mvc.perform(get("/api/auth/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("bryan"));
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void aBadUsernameOrAShortPasswordIsTurnedAwayWithASentence() throws Exception {
        signup(Map.of("username", "b!", "password", "correct horse", "inviteCode", "let-me-in"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(containsString("username")));
        signup(Map.of("username", "bryan", "password", "short", "inviteCode", "let-me-in"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(containsString("password")));
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void aTakenUsernameIsA409() throws Exception {
        when(users.existsByUsername("bryan")).thenReturn(true);
        signup(Map.of("username", "bryan", "password", "correct horse", "inviteCode", "let-me-in"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("That username is taken."));
    }

    @Test
    void aWrongOrMissingInviteIsA403AndCreatesNothing() throws Exception {
        signup(Map.of("username", "bryan", "password", "correct horse", "inviteCode", "guess"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("That invite code was not accepted."));
        signup(Map.of("username", "bryan", "password", "correct horse"))
            .andExpect(status().isForbidden());
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void theConfigTellsTheFormToAskForAnInvite() throws Exception {
        mvc.perform(get("/api/auth/config"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.inviteRequired").value(true));
    }

    @Test
    void aWrongPasswordAndAMissingAccountGetTheSame401() throws Exception {
        when(users.findByUsername("bryan")).thenReturn(Optional.of(account("bryan", "correct horse")));
        login("Bryan", "wrong horse")
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("Wrong username or password."));
        login("nobody", "correct horse")
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("Wrong username or password."));
    }

    @Test
    void signingInThenOut() throws Exception {
        when(users.findByUsername("bryan")).thenReturn(Optional.of(account("bryan", "correct horse")));
        MvcResult in = login("Bryan", "correct horse")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("bryan"))
            .andReturn();
        MockHttpSession session = (MockHttpSession) in.getRequest().getSession(false);
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());

        mvc.perform(post("/api/auth/logout").with(csrf()).session(session)).andExpect(status().isNoContent());
        assertTrue(session.isInvalid());
    }

    @Test
    void aSignInWithoutTheCsrfTokenIsRefused() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("username", "bryan", "password", "correct horse"))))
            .andExpect(status().isForbidden());
    }

    private AppUser account(String username, String password) {
        AppUser user = new AppUser();
        user.id = 7L;
        user.username = username;
        user.passwordHash = passwords.encode(password);
        return user;
    }

    private ResultActions signup(Map<String, String> body) throws Exception {
        return mvc.perform(post("/api/auth/signup").with(csrf())
            .contentType(APPLICATION_JSON).content(mapper.writeValueAsString(body)));
    }

    private ResultActions login(String username, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("username", username, "password", password))));
    }
}
