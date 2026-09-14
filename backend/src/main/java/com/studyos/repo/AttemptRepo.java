package com.studyos.repo;

import com.studyos.domain.Attempt;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.studyos.domain.Verdict;
import org.springframework.data.jpa.repository.Query;

public interface AttemptRepo extends JpaRepository<Attempt, Long> {
    Optional<Attempt> findTopByQuestionIdOrderByCreatedAtDesc(Long questionId);
    List<Attempt> findByQuestionConceptId(Long conceptId);
    Optional<Attempt> findTopByQuestionConceptIdOrderByCreatedAtDesc(Long conceptId);
    Optional<Attempt> findByIdAndQuestionConceptCourseOwnerId(Long id, Long ownerId);
    // every attempt a grader judged in one account's courses, including the failures it recorded as PENDING
    List<Attempt> findByQuestionConceptCourseOwnerIdAndGraderVerdictIsNotNull(Long ownerId);

    // the concepts in a course with a graded answer; the caller passes PENDING, which grades nothing
    @Query("select distinct a.question.concept.id from Attempt a"
        + " where a.question.concept.course.id = ?1 and a.verdict <> ?2")
    List<Long> findGradedConceptIdsByCourseId(Long courseId, Verdict notGraded);
}
