package com.studyos.study;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.studyos.domain.*;
import com.studyos.repo.*;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StudyServiceTest {
    QuestionRepo questionRepo = mock(QuestionRepo.class);
    AttemptRepo attemptRepo = mock(AttemptRepo.class);
    ReviewStateRepo reviewStateRepo = mock(ReviewStateRepo.class);
    Clock clock = Clock.fixed(Instant.parse("2026-09-01T12:00:00Z"), ZoneOffset.UTC);
    StudyService service;

    Concept concept = new Concept();
    ReviewState rs;
    Question mc = new Question();

    @BeforeEach
    void setUp() {
        concept.id = 5L;
        rs = ReviewState.initial(concept, LocalDate.of(2026, 9, 1));
        mc.id = 9L;
        mc.concept = concept;
        mc.type = QuestionType.MC;
        mc.correctIndex = 2;
        when(reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(eq(1L), any()))
            .thenReturn(List.of(rs));
        when(reviewStateRepo.findByConceptId(5L)).thenReturn(Optional.of(rs));
        when(questionRepo.findByConceptIdAndStatus(5L, QuestionStatus.ACTIVE)).thenReturn(List.of(mc));
        when(questionRepo.findById(9L)).thenReturn(Optional.of(mc));
        when(attemptRepo.findTopByQuestionIdOrderByCreatedAtDesc(any())).thenReturn(Optional.empty());
        when(attemptRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(reviewStateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        service = new StudyService(questionRepo, attemptRepo, reviewStateRepo, clock);
    }

    @Test
    void nextReturnsQuestionForDueConcept() {
        assertEquals(mc, service.next(1L).orElseThrow());
    }

    @Test
    void nextEmptyWhenNothingDue() {
        when(reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(eq(1L), any()))
            .thenReturn(List.of());
        assertTrue(service.next(1L).isEmpty());
    }

    @Test
    void correctMcAnswerAppliesScheduleWithSnapshot() {
        Attempt a = service.answerMc(9L, 2);
        assertEquals(Verdict.CORRECT, a.verdict);
        assertEquals(1.0, a.score, 1e-9);
        assertEquals(1, a.prevInterval);       // snapshot of pre-update state
        assertEquals(2.5, a.prevEase, 1e-9);
        assertEquals(3, rs.intervalDays);      // schedule applied
        assertEquals(1, rs.streak);
    }

    @Test
    void wrongMcAnswerResetsSchedule() {
        Attempt a = service.answerMc(9L, 0);
        assertEquals(Verdict.INCORRECT, a.verdict);
        assertEquals(0.0, a.score, 1e-9);
        assertEquals(1, rs.intervalDays);
        assertEquals(2.3, rs.ease, 1e-9);
    }
}
