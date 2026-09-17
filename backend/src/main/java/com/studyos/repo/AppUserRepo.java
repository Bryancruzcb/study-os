package com.studyos.repo;

import com.studyos.domain.AppUser;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepo extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByUsername(String username);
    boolean existsByUsername(String username);
    Optional<AppUser> findByResetTokenHash(String resetTokenHash);
}
