package com.studyos.repo;

import com.studyos.domain.QuizProgress;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuizProgressRepo extends JpaRepository<QuizProgress, Long> {
    Optional<QuizProgress> findByCourseId(Long courseId);
    Optional<QuizProgress> findByCourseIdAndCourseOwnerId(Long courseId, Long ownerId);
}
