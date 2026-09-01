package com.studyos.repo;

import com.studyos.domain.Material;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MaterialRepo extends JpaRepository<Material, Long> {
    Optional<Material> findByFileHash(String fileHash);
}
