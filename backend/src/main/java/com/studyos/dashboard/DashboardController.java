package com.studyos.dashboard;

import com.studyos.domain.QuestionStatus;
import com.studyos.domain.Attempt;
import com.studyos.domain.Verdict;
import com.studyos.exam.ExamPlanner;
import com.studyos.repo.AttemptRepo;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.ReviewStateRepo;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DashboardController {
    private final ConceptRepo conceptRepo;
    private final AttemptRepo attemptRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final Clock clock;
    private final ExamPlanner examPlanner;

    public DashboardController(ConceptRepo conceptRepo, AttemptRepo attemptRepo,
                               ReviewStateRepo reviewStateRepo, Clock clock, ExamPlanner examPlanner) {
        this.conceptRepo = conceptRepo;
        this.attemptRepo = attemptRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.clock = clock;
        this.examPlanner = examPlanner;
    }

    /** lecture and sourcePages say where the concept came from, so a weak one can be checked against its slides */
    public record ConceptStats(Long conceptId, String name, String lecture, String sourcePages, int streak,
                               int attempts, long correct, LocalDate dueDate, boolean neverAttempted) {}
    public record Dashboard(int dueToday, List<ConceptStats> concepts) {}

    @GetMapping("/api/dashboard")
    public Dashboard dashboard(@RequestParam Long courseId) {
        // an exam plan moves due dates, so the course is planned up to today before anything is counted
        examPlanner.ensureToday(courseId);
        LocalDate today = LocalDate.now(clock);
        // the figure the course head shows: due, and with a question the queue can still ask
        int dueToday = (int) reviewStateRepo
            .countDueByConceptCourseIdWithQuestionStatus(courseId, today, QuestionStatus.ACTIVE);
        List<ConceptStats> stats = conceptRepo.findByCourseIdOrderByIdAsc(courseId).stream().map(c -> {
            var rs = reviewStateRepo.findByConceptId(c.id).orElseThrow();
            // PENDING attempts were never judged, so they say nothing about accuracy
            List<Attempt> graded = attemptRepo.findByQuestionConceptId(c.id).stream()
                .filter(a -> a.verdict != Verdict.PENDING).toList();
            long correct = graded.stream().filter(a -> a.verdict == Verdict.CORRECT).count();
            String lecture = c.material == null ? null : c.material.filename;
            return new ConceptStats(c.id, c.name, lecture, c.sourcePages, rs.streak, graded.size(), correct,
                rs.dueDate, graded.isEmpty());
        }).toList();
        return new Dashboard(dueToday, stats);
    }
}
