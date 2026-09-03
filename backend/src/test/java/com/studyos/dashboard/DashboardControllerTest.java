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

@WebMvcTest(DashboardController.class)
class DashboardControllerTest {
    @TestConfiguration
    static class FixedClock {
        @Bean Clock clock() { return Clock.fixed(Instant.parse("2026-09-01T12:00:00Z"), ZoneOffset.UTC); }
    }

    @Autowired MockMvc mvc;
    @MockBean ConceptRepo conceptRepo;
    @MockBean AttemptRepo attemptRepo;
    @MockBean ReviewStateRepo reviewStateRepo;

    @Test
    void aggregatesPerConceptStats() throws Exception {
        Concept c = new Concept();
        c.id = 5L;
        c.name = "TCP";
        ReviewState rs = ReviewState.initial(c, LocalDate.of(2026, 9, 1));
        rs.streak = 1;
        Attempt good = new Attempt();
        good.verdict = Verdict.CORRECT;
        Attempt bad = new Attempt();
        bad.verdict = Verdict.INCORRECT;
        when(conceptRepo.findByCourseIdOrderByIdAsc(1L)).thenReturn(List.of(c));
        when(reviewStateRepo.findByConceptId(5L)).thenReturn(Optional.of(rs));
        when(attemptRepo.findByQuestionConceptId(5L)).thenReturn(List.of(good, bad));
        when(reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(eq(1L), any()))
            .thenReturn(List.of(rs));
        mvc.perform(get("/api/dashboard").param("courseId", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dueToday").value(1))
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
        when(reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(eq(1L), any()))
            .thenReturn(List.of(rs));
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
        when(reviewStateRepo.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(eq(1L), any()))
            .thenReturn(List.of(rs));
        mvc.perform(get("/api/dashboard").param("courseId", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.concepts[0].attempts").value(0))
            .andExpect(jsonPath("$.concepts[0].neverAttempted").value(true));
    }
}
