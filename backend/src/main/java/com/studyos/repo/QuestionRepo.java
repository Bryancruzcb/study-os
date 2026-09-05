package com.studyos.repo;

import com.studyos.domain.Question;
import com.studyos.domain.QuestionStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionRepo extends JpaRepository<Question, Long> {
    List<Question> findByConceptIdAndStatus(Long conceptId, QuestionStatus status);
    // the bank list is a long sequential labeling pass, so it must not reshuffle when a
    // question is retired or labelled: Postgres returns physical order without an ORDER BY
    List<Question> findByConceptIdOrderByIdAsc(Long conceptId);
    // the overview counts what can still be asked, so retired questions stay out of it
    long countByConceptCourseIdAndStatus(Long courseId, QuestionStatus status);
}
