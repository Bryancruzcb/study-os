package com.studyos.dashboard;

import com.studyos.domain.Attempt;
import com.studyos.domain.Verdict;
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

    public DashboardController(ConceptRepo conceptRepo, AttemptRepo attemptRepo,
                               ReviewStateRepo reviewStateRepo, Clock clock) {
        this.conceptRepo = conceptRepo;
        this.attemptRepo = attemptRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.clock = clock;
    }

    public record ConceptStats(Long conceptId, String name, int streak, int attempts, long correct,
                               LocalDate dueDate, boolean neverAttempted) {}
    public record Dashboard(int dueToday, List<ConceptStats> concepts) {}

    @GetMapping("/api/dashboard")
    public Dashboard dashboard(@RequestParam Long courseId) {
        LocalDate today = LocalDate.now(clock);
        int dueToday = reviewStateRepo
            .findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(courseId, today).size();
        List<ConceptStats> stats = conceptRepo.findByCourseId(courseId).stream().map(c -> {
            var rs = reviewStateRepo.findByConceptId(c.id).orElseThrow();
            List<Attempt> attempts = attemptRepo.findByQuestionConceptId(c.id);
            long correct = attempts.stream().filter(a -> a.verdict == Verdict.CORRECT).count();
            return new ConceptStats(c.id, c.name, rs.streak, attempts.size(), correct,
                rs.dueDate, attempts.isEmpty());
        }).toList();
        return new Dashboard(dueToday, stats);
    }
}
