package com.studyos.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

/**
 * Every /api call except the health check and the sign-in endpoints needs a session. The page and its
 * routes stay public, so the sign-in form can load. Nothing here reads a repository, so a controller
 * test can import this on its own.
 *
 * <p>The patterns are matched by Spring MVC's own path matching, the same matching that picks the
 * controller, so a spelling that still reaches an /api handler, such as {@code /%61pi/courses},
 * cannot get around the rule.
 *
 * <p>CSRF follows the single-page-app pattern: the token rides in a readable XSRF-TOKEN cookie and
 * comes back in an X-XSRF-TOKEN header. A page on another site can neither read that cookie nor set
 * that header.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, CookieCsrfTokenRepository csrfTokens) throws Exception {
        http
            .authorizeHttpRequests(requests -> requests
                .requestMatchers("/api/ping", "/api/auth/**").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll())
            .csrf(csrf -> csrf
                .csrfTokenRepository(csrfTokens)
                .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
            .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
            // a 401 the page can act on, not a redirect to a login page or a browser password prompt
            .exceptionHandling(errors -> errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .requestCache(AbstractHttpConfigurer::disable);
        return http.build();
    }

    @Bean
    CookieCsrfTokenRepository csrfTokenRepository() {
        // readable by the page's script on purpose: the page copies the token into a header
        return CookieCsrfTokenRepository.withHttpOnlyFalse();
    }
}
