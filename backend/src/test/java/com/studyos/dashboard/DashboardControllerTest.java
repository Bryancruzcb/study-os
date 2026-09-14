package com.studyos.dashboard;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.studyos.domain.*;
import com.studyos.repo.*;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.test.web.servlet.MockMvc;
import com.studyos.exam.ExamPlanner;
import com.studyos.auth.Owned;
import com.studyos.auth.SignedInMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@WebMvcTest(DashboardController.class)
@Import(SignedInMvc.class)
class DashboardControllerTest {
    @TestConfiguration
    static class FixedClock {
        @Bean Clock clock() { return Clock.fixed(Instant.parse("2026-09-01T12:00:00Z"), ZoneOffset.UTC); }
    }

    @Autowired MockMvc mvc;
    @MockBean ConceptRepo conceptRepo;
    @MockBean AttemptRepo attemptRepo;
    @MockBean ReviewStateRepo reviewStateRepo;
    @MockBean ExamPlanner examPlanner;
    @MockBean Owned owned;

    @Test
    void anotherAccountsCourseIsNotFoundAndNothingIsRead() throws Exception {
        when(owned.course(SignedInMvc.ME.id(), 2L)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(get("/api/dashboard").param("courseId", "2"))
            .andExpect(status().isNotFound());
        verifyNoInteractions(conceptRepo, reviewStateRepo, examPlanner);
    }

    @Test
    void aggregatesPerConceptStats() throws Exception {
        Concept c = new Concept();
        c.id = 5L;
        c.name = "TCP";
        c.sourcePages = "3,4";
        c.material = new Material();
        c.material.filename = "Lecture 3.pdf";
        ReviewState rs = ReviewState.initial(c, LocalDate.of(2026, 9, 1));
        rs.streak = 1;
        Attempt good = new Attempt();
        good.verdict = Verdict.CORRECT;
        Attempt bad = new Attempt();
        bad.verdict = Verdict.INCORRECT;
        when(conceptRepo.findByCourseIdOrderByIdAsc(1L)).thenReturn(List.of(c));
        when(reviewStateRepo.findByConceptId(5L)).thenReturn(Optional.of(rs));
        when(attemptRepo.findByQuestionConceptId(5L)).thenReturn(List.of(good, bad));
        when(reviewStateRepo.countDueByConceptCourseIdWithQuestionStatus(eq(1L), any(), eq(QuestionStatus.ACTIVE)))
            .thenReturn(1L);
        mvc.perform(get("/api/dashboard").param("courseId", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dueToday").value(1))
            .andExpect(jsonPath("$.concepts[0].lecture").value("Lecture 3.pdf"))
            .andExpect(jsonPath("$.concepts[0].sourcePages").value("3,4"))
            .andExpect(jsonPath("$.concepts[0].attempts").value(2))
            .andExpect(jsonPath("$.concepts[0].correct").value(1))
            .andExpect(jsonPath("$.concepts[0].neverAttempted").value(false));
    }

    @Test
    void pendingAttemptsAreNotCountedAsAccuracy() throws Exception {
        Concept c = new Concept();
        c.id = 5L;
        c.name = "TCP";
        ReviewState rs = ReviewState.initial(c, LocalDate.of(2026, 9, 1));
        Attempt good = new Attempt();
        good.verdict = Verdict.CORRECT;
        Attempt ungraded = new Attempt();
        ungraded.verdict = Verdict.PENDING;
        when(conceptRepo.findByCourseIdOrderByIdAsc(1L)).thenReturn(List.of(c));
        when(reviewStateRepo.findByConceptId(5L)).thenReturn(Optional.of(rs));
        when(attemptRepo.findByQuestionConceptId(5L)).thenReturn(List.of(good, ungraded));
        when(reviewStateRepo.countDueByConceptCourseIdWithQuestionStatus(eq(1L), any(), eq(QuestionStatus.ACTIVE)))
            .thenReturn(1L);
        mvc.perform(get("/api/dashboard").param("courseId", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.concepts[0].attempts").value(1))
            .andExpect(jsonPath("$.concepts[0].correct").value(1))
            .andExpect(jsonPath("$.concepts[0].neverAttempted").value(false));
    }

    @Test
    void conceptWithOnlyPendingAttemptsCountsAsNeverAttempted() throws Exception {
        Concept c = new Concept();
        c.id = 5L;
        c.name = "TCP";
        ReviewState rs = ReviewState.initial(c, LocalDate.of(2026, 9, 1));
        Attempt ungraded = new Attempt();
        ungraded.verdict = Verdict.PENDING;
        when(conceptRepo.findByCourseIdOrderByIdAsc(1L)).thenReturn(List.of(c));
        when(reviewStateRepo.findByConceptId(5L)).thenReturn(Optional.of(rs));
        when(attemptRepo.findByQuestionConceptId(5L)).thenReturn(List.of(ungraded));
        when(reviewStateRepo.countDueByConceptCourseIdWithQuestionStatus(eq(1L), any(), eq(QuestionStatus.ACTIVE)))
            .thenReturn(1L);
        mvc.perform(get("/api/dashboard").param("courseId", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.concepts[0].attempts").value(0))
            .andExpect(jsonPath("$.concepts[0].neverAttempted").value(true));
    }
}
