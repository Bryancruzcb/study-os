package com.studyos.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.studyos.PingController;
import java.net.URI;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(PingController.class)
@Import(AccessCodeConfigTest.Probe.class)
@TestPropertySource(properties = "app.access-code=open-sesame")
class AccessCodeConfigTest {
    @RestController
    static class Probe {
        @GetMapping("/api/probe")
        Map<String, String> probe() {
            return Map.of("status", "ok");
        }
    }

    @Autowired MockMvc mvc;

    @Test
    void aCallWithoutTheCodeIsTurnedAway() throws Exception {
        mvc.perform(get("/api/probe")).andExpect(status().isUnauthorized());
    }

    @Test
    void aWrongCodeIsTurnedAway() throws Exception {
        mvc.perform(get("/api/probe").header(AccessCodeConfig.HEADER, "open-sesame!"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void theRightCodeGoesThrough() throws Exception {
        mvc.perform(get("/api/probe").header(AccessCodeConfig.HEADER, "open-sesame"))
            .andExpect(status().isOk());
    }

    @Test
    void theHealthCheckNeedsNoCode() throws Exception {
        mvc.perform(get("/api/ping")).andExpect(status().isOk());
    }

    @Test
    void anEncodedSpellingOfAnApiPathIsStillLocked() throws Exception {
        mvc.perform(get(URI.create("/%61pi/probe"))).andExpect(status().isUnauthorized());
    }
}
