package com.studyos.repo;

import com.studyos.domain.Question;
import com.studyos.domain.QuestionStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface QuestionRepo extends JpaRepository<Question, Long> {
    List<Question> findByConceptIdAndStatus(Long conceptId, QuestionStatus status);
    Optional<Question> findByIdAndConceptCourseOwnerId(Long id, Long ownerId);
    // one account's labeled questions, for its eval report
    List<Question> findByConceptCourseOwnerIdAndLabelAnswerableIsNotNull(Long ownerId);
    // the bank list is a long sequential labeling pass, so it must not reshuffle when a
    // question is retired or labelled: Postgres returns physical order without an ORDER BY
    List<Question> findByConceptIdOrderByIdAsc(Long conceptId);
    // the overview counts what can still be asked, so retired questions stay out of it
    long countByConceptCourseIdAndStatus(Long courseId, QuestionStatus status);

    // the concepts that still have a question in the given status; an exam plan only paces ones it can ask
    @Query("select distinct q.concept.id from Question q where q.concept.course.id = ?1 and q.status = ?2")
    List<Long> findConceptIdsByCourseIdAndStatus(Long courseId, QuestionStatus status);

    // the quiz reads a whole course at once, so each question's concept and lecture come back in the
    // same query instead of a select per concept; lecture order, and the page does the shuffling
    @Query("select q from Question q join fetch q.concept c join fetch c.material m "
        + "where c.course.id = ?1 and q.status = ?2 order by m.id, c.id, q.id")
    List<Question> findForQuiz(Long courseId, QuestionStatus status);
    void deleteByConceptMaterialId(Long materialId);
}
