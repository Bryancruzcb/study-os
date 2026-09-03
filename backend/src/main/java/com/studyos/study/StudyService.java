package com.studyos.study;

import com.studyos.domain.*;
import com.studyos.repo.*;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StudyService {
    private final QuestionRepo questionRepo;
    private final AttemptRepo attemptRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final Clock clock;
    private final GradingService gradingService;

    public StudyService(QuestionRepo questionRepo, AttemptRepo attemptRepo,
                        ReviewStateRepo reviewStateRepo, Clock clock, GradingService gradingService) {
        this.questionRepo = questionRepo;
        this.attemptRepo = attemptRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.clock = clock;
        this.gradingService = gradingService;
    }

    public Optional<Question> next(Long courseId) {
        LocalDate today = LocalDate.now(clock);
        List<ReviewState> due =
            reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(courseId, today);
        for (ReviewState rs : due) {
            List<Question> candidates = questionRepo.findByConceptIdAndStatus(rs.concept.id, QuestionStatus.ACTIVE);
            Map<Long, Instant> lastAttemptAt = new HashMap<>();
            for (Question q : candidates) {
                lastAttemptAt.put(q.id, attemptRepo.findTopByQuestionIdOrderByCreatedAtDesc(q.id)
                    .map(a -> a.createdAt)
                    .orElse(Instant.EPOCH));
            }
            Optional<Question> pick = candidates.stream()
                .min(Comparator.comparing(q -> lastAttemptAt.get(q.id)));
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

    @Transactional
    public Attempt answerShort(Long questionId, String answerText) {
        Question q = questionRepo.findById(questionId).orElseThrow();
        if (q.type != QuestionType.SHORT_ANSWER) throw new IllegalArgumentException("not a short-answer question");
        GradingService.GradeOutcome out = gradingService.gradeShortAnswer(q, answerText);
        Attempt a = new Attempt();
        a.question = q;
        a.givenAnswer = answerText;
        a.verdict = out.verdict();
        a.graderVerdict = out.verdict();
        a.score = out.score();
        a.feedback = out.feedback();
        a.graderRaw = out.graderRaw();
        a.createdAt = Instant.now(clock);
        if (out.verdict() != Verdict.PENDING) {
            applySchedule(a, out.verdict() == Verdict.CORRECT);
        }
        return attemptRepo.save(a);
    }

    @Transactional
    public Attempt override(Long attemptId) {
        Attempt a = attemptRepo.findById(attemptId).orElseThrow();
        if (a.verdict == Verdict.PENDING) throw new IllegalStateException("resolve PENDING via self-grade");
        Long conceptId = a.question.concept.id;
        Attempt latest = attemptRepo.findTopByQuestionConceptIdOrderByCreatedAtDesc(conceptId).orElseThrow();
        // the snapshot only reverts the newest schedule update, so an older attempt cannot be undone
        if (!latest.id.equals(a.id)) {
            throw new IllegalStateException("only the concept's most recent attempt can be overridden");
        }
        ReviewState rs = reviewStateRepo.findByConceptId(conceptId).orElseThrow();
        // revert to the snapshot taken when this attempt's schedule update was applied
        rs.intervalDays = a.prevInterval;
        rs.ease = a.prevEase;
        rs.streak = a.prevStreak;
        rs.dueDate = a.prevDueDate;
        boolean flipped = a.verdict == Verdict.INCORRECT; // new verdict is the flip
        a.verdict = flipped ? Verdict.CORRECT : Verdict.INCORRECT;
        a.score = flipped ? 1.0 : 0.0;
        // only a real grader judgment can be disagreed with (PENDING means the grader
        // produced none); the assignment is total, so agreement always clears the flag
        a.overridden = a.graderVerdict != null && a.graderVerdict != Verdict.PENDING
            && a.verdict != a.graderVerdict;
        Sm2Scheduler.apply(rs, flipped, LocalDate.now(clock));
        reviewStateRepo.save(rs);
        return attemptRepo.save(a);
    }

    @Transactional
    public Attempt selfGrade(Long attemptId, boolean correct) {
        Attempt a = attemptRepo.findById(attemptId).orElseThrow();
        if (a.verdict != Verdict.PENDING) throw new IllegalStateException("only PENDING attempts can be self-graded");
        a.verdict = correct ? Verdict.CORRECT : Verdict.INCORRECT;
        a.score = correct ? 1.0 : 0.0;
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
