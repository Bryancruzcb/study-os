package com.studyos;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;

import com.studyos.auth.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

// the page's routes are public under the real rules, not under Spring Boot's lock-everything default
@WebMvcTest(AppRoutesController.class)
@Import(SecurityConfig.class)
class AppRoutesControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void aReloadedPageGetsTheApp() throws Exception {
        mvc.perform(get("/courses/3/bank/12")).andExpect(forwardedUrl("/index.html"));
        mvc.perform(get("/eval")).andExpect(forwardedUrl("/index.html"));
    }
}
