package com.studyos.repo;

import com.studyos.domain.ReviewState;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReviewStateRepo extends JpaRepository<ReviewState, Long> {
    Optional<ReviewState> findByConceptId(Long conceptId);
    List<ReviewState> findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(Long courseId, LocalDate date);

    // One row per day from `from` onwards that already has something scheduled. Ingest places a
    // whole payload from this single read; asking per candidate day would be a query per day.
    @Query("select rs.dueDate as dueDate, count(rs) as total from ReviewState rs"
        + " where rs.concept.course.id = ?1 and rs.dueDate >= ?2 group by rs.dueDate")
    List<DueDateCount> findDueDateCountsByConceptCourseIdAndDueDateGreaterThanEqual(
        Long courseId, LocalDate from);

    interface DueDateCount {
        LocalDate getDueDate();
        long getTotal();
    }
}
