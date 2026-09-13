package com.studyos;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AppRoutesController.class)
class AppRoutesControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void aReloadedPageGetsTheApp() throws Exception {
        mvc.perform(get("/courses/3/bank/12")).andExpect(forwardedUrl("/index.html"));
        mvc.perform(get("/eval")).andExpect(forwardedUrl("/index.html"));
    }
}
