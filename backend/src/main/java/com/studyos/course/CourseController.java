package com.studyos.course;

import com.studyos.domain.QuestionStatus;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.QuestionRepo;
import com.studyos.repo.ReviewStateRepo;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * One row per course with the numbers the home tiles and the course head show. Three
 * count queries per course is fine at a handful of courses; a grouped query can replace
 * them when there are enough courses for it to matter.
 */
@RestController
public class CourseController {
    private final CourseRepo courseRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final Clock clock;

    public CourseController(CourseRepo courseRepo, ConceptRepo conceptRepo, QuestionRepo questionRepo,
                            ReviewStateRepo reviewStateRepo, Clock clock) {
        this.courseRepo = courseRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.clock = clock;
    }

    public record CourseOverview(Long id, String name, String term, long concepts, long questions,
                                 long dueToday) {}

    @GetMapping("/api/courses/overview")
    public List<CourseOverview> overview() {
        LocalDate today = LocalDate.now(clock);
        // id order, so the newest course is the last tile and the order never shuffles
        return courseRepo.findAll(Sort.by("id")).stream()
            .map(c -> new CourseOverview(c.id, c.name, c.term,
                conceptRepo.countByCourseId(c.id),
                questionRepo.countByConceptCourseIdAndStatus(c.id, QuestionStatus.ACTIVE),
                reviewStateRepo.countByConceptCourseIdAndDueDateLessThanEqual(c.id, today)))
            .toList();
    }
}
