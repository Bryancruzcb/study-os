package com.studyos.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * The live demo's lock. Uploading a PDF and grading a short answer both spend API credit and the
 * app has no accounts, so on a public host every /api call has to carry the code the owner shared.
 * With no code configured, the local default, nothing is registered and nothing changes. /api/ping
 * stays open for the host's health check, which cannot send a header.
 *
 * <p>It is an interceptor rather than a servlet filter so the lock is matched by the same path
 * parser that picks the controller: a spelling that still reaches an /api handler, such as
 * {@code /%61pi/courses}, cannot slip past a prefix check on the raw URI.
 */
@Configuration
public class AccessCodeConfig implements WebMvcConfigurer {
    public static final String HEADER = "X-Access-Code";
    private final byte[] code;

    public AccessCodeConfig(@Value("${app.access-code:}") String code) {
        this.code = code.strip().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        if (code.length == 0) return;
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
                    throws IOException {
                String given = request.getHeader(HEADER);
                if (given != null && MessageDigest.isEqual(code, given.getBytes(StandardCharsets.UTF_8))) {
                    return true;
                }
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json");
                response.getWriter().write("{\"error\":\"access code required\"}");
                return false;
            }
        }).addPathPatterns("/api/**").excludePathPatterns("/api/ping");
    }
}
