package com.studyos.study;

import com.studyos.domain.*;
import com.studyos.repo.*;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StudyService {
    private final QuestionRepo questionRepo;
    private final AttemptRepo attemptRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final Clock clock;

    public StudyService(QuestionRepo questionRepo, AttemptRepo attemptRepo,
                        ReviewStateRepo reviewStateRepo, Clock clock) {
        this.questionRepo = questionRepo;
        this.attemptRepo = attemptRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.clock = clock;
    }

    public Optional<Question> next(Long courseId) {
        LocalDate today = LocalDate.now(clock);
        List<ReviewState> due =
            reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(courseId, today);
        for (ReviewState rs : due) {
            List<Question> candidates = questionRepo.findByConceptIdAndStatus(rs.concept.id, QuestionStatus.ACTIVE);
            Optional<Question> pick = candidates.stream()
                .min(Comparator.comparing(q -> attemptRepo.findTopByQuestionIdOrderByCreatedAtDesc(q.id)
                    .map(a -> a.createdAt)
                    .orElse(Instant.EPOCH)));
            if (pick.isPresent()) return pick;
        }
        return Optional.empty();
    }

    @Transactional
    public Attempt answerMc(Long questionId, int answerIndex) {
        Question q = questionRepo.findById(questionId).orElseThrow();
        if (q.type != QuestionType.MC) throw new IllegalArgumentException("not an MC question");
        boolean correct = q.correctIndex != null && q.correctIndex == answerIndex;
        Attempt a = new Attempt();
        a.question = q;
        a.givenAnswer = String.valueOf(answerIndex);
        a.verdict = correct ? Verdict.CORRECT : Verdict.INCORRECT;
        a.score = correct ? 1.0 : 0.0;
        a.createdAt = Instant.now(clock);
        applySchedule(a, correct);
        return attemptRepo.save(a);
    }

    /** Snapshot the concept's ReviewState onto the attempt, then apply SM-2. Reused by grading paths. */
    void applySchedule(Attempt a, boolean correct) {
        ReviewState rs = reviewStateRepo.findByConceptId(a.question.concept.id).orElseThrow();
        a.prevInterval = rs.intervalDays;
        a.prevEase = rs.ease;
        a.prevStreak = rs.streak;
        a.prevDueDate = rs.dueDate;
        Sm2Scheduler.apply(rs, correct, LocalDate.now(clock));
        reviewStateRepo.save(rs);
    }
}
