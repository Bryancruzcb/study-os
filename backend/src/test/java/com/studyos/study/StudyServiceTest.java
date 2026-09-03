package com.studyos.study;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.studyos.ai.AiException;
import com.studyos.ai.FakeAiClient;
import com.studyos.ai.GradePayload;
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
    FakeAiClient ai = new FakeAiClient();
    StudyService service;

    Concept concept = new Concept();
    ReviewState rs;
    Question mc = new Question();
    Question sa = new Question();

    @BeforeEach
    void setUp() {
        concept.id = 5L;
        rs = ReviewState.initial(concept, LocalDate.of(2026, 9, 1));
        mc.id = 9L;
        mc.concept = concept;
        mc.type = QuestionType.MC;
        mc.correctIndex = 2;
        sa.id = 13L;
        sa.concept = concept;
        sa.type = QuestionType.SHORT_ANSWER;
        sa.prompt = "Describe the TCP three-way handshake.";
        sa.modelAnswer = "SYN, then SYN-ACK, then ACK";
        sa.rubric = "- names all three segments\n- correct order";
        when(reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(eq(1L), any()))
            .thenReturn(List.of(rs));
        when(reviewStateRepo.findByConceptId(5L)).thenReturn(Optional.of(rs));
        when(questionRepo.findByConceptIdAndStatus(5L, QuestionStatus.ACTIVE)).thenReturn(List.of(mc));
        when(questionRepo.findById(9L)).thenReturn(Optional.of(mc));
        when(questionRepo.findById(13L)).thenReturn(Optional.of(sa));
        when(attemptRepo.findTopByQuestionIdOrderByCreatedAtDesc(any())).thenReturn(Optional.empty());
        when(attemptRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(reviewStateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        service = new StudyService(questionRepo, attemptRepo, reviewStateRepo, clock, new GradingService(ai));
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
    void nextPrefersLeastRecentlyAttemptedQuestion() {
        Question a = new Question();
        a.id = 10L;
        a.concept = concept;
        a.type = QuestionType.MC;
        Question b = new Question();
        b.id = 11L;
        b.concept = concept;
        b.type = QuestionType.MC;
        Attempt aLatest = new Attempt();
        aLatest.createdAt = Instant.parse("2026-08-30T10:00:00Z");
        Attempt bLatest = new Attempt();
        bLatest.createdAt = Instant.parse("2026-08-31T10:00:00Z");
        // b listed first so list order cannot mask the comparator
        when(questionRepo.findByConceptIdAndStatus(5L, QuestionStatus.ACTIVE)).thenReturn(List.of(b, a));
        when(attemptRepo.findTopByQuestionIdOrderByCreatedAtDesc(10L)).thenReturn(Optional.of(aLatest));
        when(attemptRepo.findTopByQuestionIdOrderByCreatedAtDesc(11L)).thenReturn(Optional.of(bLatest));
        assertEquals(a, service.next(1L).orElseThrow());
    }

    @Test
    void nextSkipsDueConceptWithNoActiveQuestions() {
        Concept concept6 = new Concept();
        concept6.id = 6L;
        ReviewState rsEarlier = ReviewState.initial(concept, LocalDate.of(2026, 8, 30));
        ReviewState rsLater = ReviewState.initial(concept6, LocalDate.of(2026, 9, 1));
        Question q6 = new Question();
        q6.id = 12L;
        q6.concept = concept6;
        q6.type = QuestionType.MC;
        when(reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(eq(1L), any()))
            .thenReturn(List.of(rsEarlier, rsLater));
        when(questionRepo.findByConceptIdAndStatus(5L, QuestionStatus.ACTIVE)).thenReturn(List.of());
        when(questionRepo.findByConceptIdAndStatus(6L, QuestionStatus.ACTIVE)).thenReturn(List.of(q6));
        assertEquals(q6, service.next(1L).orElseThrow());
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

    @Test
    void gradedShortAnswerAppliesScheduleWithSnapshot() {
        ai.nextGrade = new GradePayload(true, 0.9, "Good: all three segments named.");
        Attempt a = service.answerShort(13L, "SYN, SYN-ACK, ACK");
        assertEquals(sa, a.question);
        assertEquals("SYN, SYN-ACK, ACK", a.givenAnswer);
        assertEquals(Verdict.CORRECT, a.verdict);
        assertEquals(0.9, a.score, 1e-9);
        assertEquals("Good: all three segments named.", a.feedback);
        assertNotNull(a.graderRaw);
        assertEquals(Instant.parse("2026-09-01T12:00:00Z"), a.createdAt);
        assertEquals(1, a.prevInterval);       // snapshot of pre-update state
        assertEquals(2.5, a.prevEase, 1e-9);
        assertEquals(3, rs.intervalDays);      // schedule applied
        assertEquals(1, rs.streak);
        verify(attemptRepo).save(a);
    }

    @Test
    void pendingShortAnswerLeavesScheduleUntouched() {
        ai.nextError = new AiException("api down");
        Attempt a = service.answerShort(13L, "SYN, SYN-ACK, ACK");
        assertEquals(Verdict.PENDING, a.verdict);
        assertEquals("SYN, SYN-ACK, ACK", a.givenAnswer);
        assertNull(a.score);
        assertNull(a.feedback);
        assertNull(a.graderRaw);
        assertNull(a.prevInterval);            // no snapshot while PENDING
        assertNull(a.prevEase);
        assertNull(a.prevStreak);
        assertNull(a.prevDueDate);
        assertEquals(1, rs.intervalDays);      // schedule untouched
        assertEquals(2.5, rs.ease, 1e-9);
        assertEquals(0, rs.streak);
        assertEquals(LocalDate.of(2026, 9, 1), rs.dueDate);
        verify(reviewStateRepo, never()).save(any());
        verify(attemptRepo).save(a);
    }

    @Test
    void answerShortRejectsMcQuestion() {
        assertThrows(IllegalArgumentException.class, () -> service.answerShort(9L, "SYN, SYN-ACK, ACK"));
        verify(attemptRepo, never()).save(any());
    }

    @Test
    void nextServesShortAnswerQuestions() {
        when(questionRepo.findByConceptIdAndStatus(5L, QuestionStatus.ACTIVE)).thenReturn(List.of(sa));
        assertEquals(sa, service.next(1L).orElseThrow());
    }

    @Test
    void nextQueriesLastAttemptOncePerCandidate() {
        Question a = new Question();
        a.id = 10L;
        a.concept = concept;
        a.type = QuestionType.MC;
        Question b = new Question();
        b.id = 11L;
        b.concept = concept;
        b.type = QuestionType.MC;
        Question c = new Question();
        c.id = 12L;
        c.concept = concept;
        c.type = QuestionType.MC;
        // three candidates: a pairwise min over two only compares once, so two could never re-query
        when(questionRepo.findByConceptIdAndStatus(5L, QuestionStatus.ACTIVE)).thenReturn(List.of(a, b, c));
        service.next(1L);
        verify(attemptRepo, times(1)).findTopByQuestionIdOrderByCreatedAtDesc(10L);
        verify(attemptRepo, times(1)).findTopByQuestionIdOrderByCreatedAtDesc(11L);
        verify(attemptRepo, times(1)).findTopByQuestionIdOrderByCreatedAtDesc(12L);
    }
}
