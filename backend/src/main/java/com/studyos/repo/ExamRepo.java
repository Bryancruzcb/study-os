package com.studyos.repo;

import com.studyos.domain.Exam;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ExamRepo extends JpaRepository<Exam, Long> {
    // date order, and id to settle two exams on one day, so the nearest exam always comes first
    List<Exam> findByCourseIdOrderByDateAscIdAsc(Long courseId);

    // the exams still ahead of `after` that cover a lecture, nearest first
    @Query("select e from Exam e join e.lectures l where l.id = ?1 and e.date > ?2 order by e.date asc, e.id asc")
    List<Exam> findUpcomingByLectureId(Long lectureId, LocalDate after);
}
