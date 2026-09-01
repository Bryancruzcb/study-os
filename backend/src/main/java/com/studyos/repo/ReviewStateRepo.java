package com.studyos.repo;

import com.studyos.domain.ReviewState;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewStateRepo extends JpaRepository<ReviewState, Long> {
    Optional<ReviewState> findByConceptId(Long conceptId);
    List<ReviewState> findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(Long courseId, LocalDate date);
}
