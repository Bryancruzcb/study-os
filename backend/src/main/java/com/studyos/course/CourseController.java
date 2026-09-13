package com.studyos.course;

import com.studyos.auth.SignedIn;
import com.studyos.domain.QuestionStatus;
import com.studyos.exam.ExamPlanner;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.QuestionRepo;
import com.studyos.repo.ReviewStateRepo;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * One row per course with the numbers the home tiles and the course head show. Due today
 * is a review state due today or earlier on a concept that still has an ACTIVE question,
 * which is exactly what the study queue will serve. Three count queries per course is fine
 * at a handful of courses; a grouped query can replace them when there are enough courses
 * for it to matter. An exam plan moves due dates, so each course is planned up to today
 * before it is counted.
 */
@RestController
public class CourseController {
    private final CourseRepo courseRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final Clock clock;
    private final ExamPlanner examPlanner;

    public CourseController(CourseRepo courseRepo, ConceptRepo conceptRepo, QuestionRepo questionRepo,
                            ReviewStateRepo reviewStateRepo, Clock clock, ExamPlanner examPlanner) {
        this.courseRepo = courseRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.clock = clock;
        this.examPlanner = examPlanner;
    }

    public record CourseOverview(Long id, String name, String term, long concepts, long questions,
                                 long dueToday) {}

    @GetMapping("/api/courses/overview")
    public List<CourseOverview> overview(@AuthenticationPrincipal SignedIn me) {
        LocalDate today = LocalDate.now(clock);
        List<CourseOverview> rows = new ArrayList<>();
        // this account's courses in id order, so the newest course is the last tile and the order never shuffles
        for (var c : courseRepo.findByOwnerIdOrderByIdAsc(me.id())) {
            examPlanner.ensureToday(c.id);
            rows.add(new CourseOverview(c.id, c.name, c.term,
                conceptRepo.countByCourseId(c.id),
                questionRepo.countByConceptCourseIdAndStatus(c.id, QuestionStatus.ACTIVE),
                reviewStateRepo.countDueByConceptCourseIdWithQuestionStatus(c.id, today, QuestionStatus.ACTIVE)));
        }
        return rows;
    }
}
