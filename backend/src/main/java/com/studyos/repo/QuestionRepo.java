package com.studyos.repo;

import com.studyos.domain.Question;
import com.studyos.domain.QuestionStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionRepo extends JpaRepository<Question, Long> {
    List<Question> findByConceptIdAndStatus(Long conceptId, QuestionStatus status);
    List<Question> findByConceptId(Long conceptId);
}
