package com.studyos.repo;

import com.studyos.domain.Attempt;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AttemptRepo extends JpaRepository<Attempt, Long> {
    Optional<Attempt> findTopByQuestionIdOrderByCreatedAtDesc(Long questionId);
    List<Attempt> findByQuestionConceptId(Long conceptId);
    Optional<Attempt> findTopByQuestionConceptIdOrderByCreatedAtDesc(Long conceptId);
    // every attempt a grader judged, including the failures it recorded as PENDING
    List<Attempt> findByGraderVerdictIsNotNull();
}
