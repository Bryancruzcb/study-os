package com.studyos.repo;

import com.studyos.domain.Material;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.studyos.domain.MaterialStatus;
import java.util.List;

public interface MaterialRepo extends JpaRepository<Material, Long> {
    Optional<Material> findByCourseIdAndFileHash(Long courseId, String fileHash);

    // the lectures an exam can cover, in the order they were uploaded
    List<Material> findByCourseIdAndStatusOrderByIdAsc(Long courseId, MaterialStatus status);
}
