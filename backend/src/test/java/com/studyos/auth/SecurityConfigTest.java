package com.studyos.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.studyos.AppRoutesController;
import com.studyos.PingController;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest({PingController.class, AppRoutesController.class})
@Import({SecurityConfig.class, SecurityConfigTest.Probe.class})
class SecurityConfigTest {
    @RestController
    static class Probe {
        @GetMapping("/api/probe")
        Map<String, String> read() {
            return Map.of("status", "ok");
        }

        @PostMapping("/api/probe")
        Map<String, String> write() {
            return Map.of("status", "ok");
        }
    }

    static final RequestPostProcessor SIGNED_IN = authentication(
        UsernamePasswordAuthenticationToken.authenticated(new SignedIn(7L, "bryan"), null, List.of()));

    @Autowired MockMvc mvc;

    @Test
    void anApiCallWithoutASessionIsA401ThePageCanActOn() throws Exception {
        mvc.perform(get("/api/probe"))
            .andExpect(status().isUnauthorized())
            // no browser password prompt and no redirect to a login page
            .andExpect(header().doesNotExist("WWW-Authenticate"))
            .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void anEncodedSpellingOfAnApiPathNeedsASessionToo() throws Exception {
        mvc.perform(get(URI.create("/%61pi/probe"))).andExpect(status().isUnauthorized());
    }

    @Test
    void theHealthCheckThePageAndItsRoutesNeedNoSession() throws Exception {
        mvc.perform(get("/api/ping")).andExpect(status().isOk());
        mvc.perform(get("/courses/3/bank")).andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void evenA401PlantsTheCsrfCookieSoThePagesFirstPostCanCarryIt() throws Exception {
        mvc.perform(get("/api/probe"))
            .andExpect(cookie().exists("XSRF-TOKEN"))
            .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
    }

    @Test
    void aWriteHasToSendTheCookiesTokenBackInTheHeader() throws Exception {
        mvc.perform(post("/api/probe").with(SIGNED_IN)).andExpect(status().isForbidden());

        Cookie token = mvc.perform(get("/api/probe").with(SIGNED_IN)).andReturn().getResponse().getCookie("XSRF-TOKEN");
        mvc.perform(post("/api/probe").with(SIGNED_IN).cookie(token).header("X-XSRF-TOKEN", token.getValue()))
            .andExpect(status().isOk());
        mvc.perform(post("/api/probe").with(SIGNED_IN).cookie(token).header("X-XSRF-TOKEN", "not-the-token"))
            .andExpect(status().isForbidden());
    }
}
