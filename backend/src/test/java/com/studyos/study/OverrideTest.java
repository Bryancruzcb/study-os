package com.studyos.study;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.studyos.ai.FakeAiClient;
import com.studyos.domain.*;
import com.studyos.repo.*;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class OverrideTest {
    QuestionRepo questionRepo = mock(QuestionRepo.class);
    AttemptRepo attemptRepo = mock(AttemptRepo.class);
    ReviewStateRepo reviewStateRepo = mock(ReviewStateRepo.class);
    Clock clock = Clock.fixed(Instant.parse("2026-09-01T12:00:00Z"), ZoneOffset.UTC);
    StudyService service;

    Concept concept = new Concept();
    ReviewState rs;
    Question q = new Question();
    Attempt attempt = new Attempt();

    @BeforeEach
    void setUp() {
        concept.id = 5L;
        rs = ReviewState.initial(concept, LocalDate.of(2026, 9, 1));
        q.concept = concept;
        q.type = QuestionType.SHORT_ANSWER;
        attempt.id = 3L;
        attempt.question = q;
        attempt.createdAt = Instant.parse("2026-09-01T12:00:00Z");
        when(reviewStateRepo.findByConceptId(5L)).thenReturn(Optional.of(rs));
        when(attemptRepo.findById(3L)).thenReturn(Optional.of(attempt));
        when(attemptRepo.findTopByQuestionConceptIdOrderByCreatedAtDesc(5L)).thenReturn(Optional.of(attempt));
        when(attemptRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(reviewStateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        service = new StudyService(questionRepo, attemptRepo, reviewStateRepo, clock,
            new GradingService(new FakeAiClient()));
    }

    @Test
    void overrideFlipsVerdictAndRecomputesFromSnapshot() {
        // grader said INCORRECT and the schedule was punished: interval 1, ease 2.3
        attempt.verdict = Verdict.INCORRECT;
        attempt.graderVerdict = Verdict.INCORRECT;
        attempt.prevInterval = 1;
        attempt.prevEase = 2.5;
        attempt.prevStreak = 0;
        attempt.prevDueDate = LocalDate.of(2026, 9, 1);
        rs.intervalDays = 1;
        rs.ease = 2.3;
        rs.streak = 0;

        Attempt out = service.override(3L);

        assertEquals(Verdict.CORRECT, out.verdict);
        assertTrue(out.overridden);
        // reverted to snapshot then re-applied as correct: round(1 * 2.5) = 3
        assertEquals(3, rs.intervalDays);
        assertEquals(2.5, rs.ease, 1e-9);
        assertEquals(1, rs.streak);
    }

    @Test
    void overrideRejectsPending() {
        attempt.verdict = Verdict.PENDING;
        assertThrows(IllegalStateException.class, () -> service.override(3L));
    }

    @Test
    void selfGradeResolvesPendingAndAppliesSchedule() {
        attempt.verdict = Verdict.PENDING;
        Attempt out = service.selfGrade(3L, true);
        assertEquals(Verdict.CORRECT, out.verdict);
        assertEquals(1.0, out.score, 1e-9);
        assertEquals(1, out.prevInterval);
        assertEquals(3, rs.intervalDays);
    }

    @Test
    void selfGradeRejectsResolved() {
        attempt.verdict = Verdict.CORRECT;
        assertThrows(IllegalStateException.class, () -> service.selfGrade(3L, false));
    }

    @Test
    void overrideMarksDisagreementWithGrader() {
        // the grader said CORRECT; the human knows better
        attempt.verdict = Verdict.CORRECT;
        attempt.graderVerdict = Verdict.CORRECT;
        attempt.prevInterval = 1;
        attempt.prevEase = 2.5;
        attempt.prevStreak = 0;
        attempt.prevDueDate = LocalDate.of(2026, 9, 1);
        rs.intervalDays = 3;
        rs.streak = 1;

        Attempt out = service.override(3L);

        assertEquals(Verdict.INCORRECT, out.verdict);
        assertEquals(Verdict.CORRECT, out.graderVerdict); // the grader's call survives the flip
        assertTrue(out.overridden);
    }

    @Test
    void doubleOverrideClearsTheDisagreementFlag() {
        attempt.verdict = Verdict.CORRECT;
        attempt.graderVerdict = Verdict.CORRECT;
        attempt.prevInterval = 1;
        attempt.prevEase = 2.5;
        attempt.prevStreak = 0;
        attempt.prevDueDate = LocalDate.of(2026, 9, 1);

        service.override(3L);               // flips away from the grader
        Attempt out = service.override(3L); // and back to it

        assertEquals(Verdict.CORRECT, out.verdict);
        assertEquals(out.graderVerdict, out.verdict);
        assertFalse(out.overridden);
    }

    @Test
    void overrideRejectsOlderAttempt() {
        attempt.verdict = Verdict.INCORRECT;
        attempt.graderVerdict = Verdict.INCORRECT;
        attempt.prevInterval = 1;
        attempt.prevEase = 2.5;
        attempt.prevStreak = 0;
        attempt.prevDueDate = LocalDate.of(2026, 9, 1);
        Attempt newer = new Attempt();
        newer.id = 4L;
        newer.question = q;
        newer.createdAt = Instant.parse("2026-09-01T13:00:00Z");
        when(attemptRepo.findTopByQuestionConceptIdOrderByCreatedAtDesc(5L)).thenReturn(Optional.of(newer));

        assertThrows(IllegalStateException.class, () -> service.override(3L));
        assertEquals(Verdict.INCORRECT, attempt.verdict); // untouched
    }

    @Test
    void pendingGraderVerdictIsNotADisagreement() {
        // the grader failed and produced no judgement, so there is nothing to disagree with
        attempt.verdict = Verdict.PENDING;
        attempt.graderVerdict = Verdict.PENDING;

        service.selfGrade(3L, true);   // human resolves it as correct
        Attempt out = service.override(3L); // and then changes their mind

        assertEquals(Verdict.INCORRECT, out.verdict);
        assertFalse(out.overridden);
        // reverted to the snapshot then re-applied as incorrect
        assertEquals(1, rs.intervalDays);
        assertEquals(2.3, rs.ease, 1e-9);
        assertEquals(0, rs.streak);
    }

    @Test
    void selfGradedAttemptIsNotMarkedOverridden() {
        attempt.verdict = Verdict.PENDING; // no grader judged it, so graderVerdict stays null
        Attempt out = service.selfGrade(3L, true);
        assertEquals(Verdict.CORRECT, out.verdict);
        assertNull(out.graderVerdict);
        assertFalse(out.overridden);
    }

    @Test
    void overrideClearsAStaleFlagWhenNoGraderJudged() {
        // a row already flagged as a disagreement even though no grader ever judged it
        attempt.verdict = Verdict.CORRECT;
        attempt.graderVerdict = null;
        attempt.overridden = true;
        attempt.prevInterval = 1;
        attempt.prevEase = 2.5;
        attempt.prevStreak = 0;
        attempt.prevDueDate = LocalDate.of(2026, 9, 1);

        Attempt out = service.override(3L);

        assertEquals(Verdict.INCORRECT, out.verdict);
        assertFalse(out.overridden); // nothing to disagree with, so the flag cannot stand
    }
}
