package com.studyos.auth;

import com.studyos.repo.AppUserRepo;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * How a username and a password are checked: against the app_user table, with bcrypt. The provider
 * runs the hash even for a username that does not exist, so a missing account answers no faster
 * than a wrong password.
 */
@Configuration
public class AccountsConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    UserDetailsService userDetailsService(AppUserRepo users) {
        return username -> users.findByUsername(username)
            .map(user -> User.withUsername(user.username).password(user.passwordHash).authorities(List.of()).build())
            .orElseThrow(() -> new UsernameNotFoundException("no such account"));
    }

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService userDetails, PasswordEncoder passwords) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetails);
        provider.setPasswordEncoder(passwords);
        return new ProviderManager(provider);
    }
}
