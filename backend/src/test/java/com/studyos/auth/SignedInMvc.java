package com.studyos.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.List;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcBuilderCustomizer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

/**
 * For controller tests: the real security rules, with every request made by one signed-in account and
 * carrying a valid CSRF token, so a test only has to say what it is about. Whether a row belongs to
 * that account is the controller test's mocked Owned; AccountsIsolationTest checks the real one.
 */
@TestConfiguration
@Import(SecurityConfig.class)
public class SignedInMvc {
    public static final SignedIn ME = new SignedIn(7L, "bryan");

    @Bean
    MockMvcBuilderCustomizer signedIn() {
        return builder -> builder.defaultRequest(get("/")
            .with(authentication(UsernamePasswordAuthenticationToken.authenticated(ME, null, List.of())))
            .with(csrf()));
    }
}
