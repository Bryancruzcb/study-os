package com.studyos;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * In the deployed image this app also serves the React build. The app's routes live in the
 * browser, so a reload or an opened link on one of them reaches the server first: hand back the
 * page and its router takes over. Locally vite serves the page and this never runs.
 */
@Controller
public class AppRoutesController {
    @GetMapping({"/courses/**", "/eval"})
    public String app() {
        return "forward:/index.html";
    }
}
