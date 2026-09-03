package com.studyos.repo;

import com.studyos.domain.Concept;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConceptRepo extends JpaRepository<Concept, Long> {
    // ordered for the same reason as QuestionRepo.findByConceptIdOrderByIdAsc
    List<Concept> findByCourseIdOrderByIdAsc(Long courseId);
    List<Concept> findByMaterialId(Long materialId);
}
