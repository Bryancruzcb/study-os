package com.studyos.exam;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.studyos.auth.Owned;
import com.studyos.auth.SignedInMvc;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@WebMvcTest(ExamController.class)
@Import(SignedInMvc.class)
class ExamControllerTest {
    @Autowired MockMvc mvc;
    @MockBean ExamPlanner planner;
    @MockBean Owned owned;

    @Test
    void anotherAccountsExamCannotBeDeleted() throws Exception {
        when(owned.exam(SignedInMvc.ME.id(), 4L)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(delete("/api/exams/4")).andExpect(status().isNotFound());
        verifyNoInteractions(planner);
    }

    static final ExamPlanner.ExamView MIDTERM = new ExamPlanner.ExamView(4L, "Midterm", LocalDate.of(2026, 9, 26),
        List.of(11L, 12L), "upcoming", new ExamPlanner.Plan(14, 3, LocalDate.of(2026, 9, 22), 22, 18, 2, 5));

    @Test
    void examsAreServedWithWhatTodayHoldsForThem() throws Exception {
        when(planner.exams(1L)).thenReturn(List.of(MIDTERM));
        mvc.perform(get("/api/courses/1/exams"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].name").value("Midterm"))
            .andExpect(jsonPath("$[0].date").value("2026-09-26"))
            .andExpect(jsonPath("$[0].lectureIds[1]").value(12))
            .andExpect(jsonPath("$[0].status").value("upcoming"))
            .andExpect(jsonPath("$[0].plan.lastNewDay").value("2026-09-22"))
            .andExpect(jsonPath("$[0].plan.newToday").value(2))
            .andExpect(jsonPath("$[0].plan.reviewsToday").value(5));
    }

    @Test
    void theLecturesAnExamCanCoverAreListed() throws Exception {
        when(planner.lectures(1L)).thenReturn(List.of(new ExamPlanner.LectureView(11L, "Lecture 1.pdf", 9)));
        mvc.perform(get("/api/courses/1/lectures"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(11))
            .andExpect(jsonPath("$[0].filename").value("Lecture 1.pdf"))
            .andExpect(jsonPath("$[0].concepts").value(9));
    }

    @Test
    void creatingAnExamHandsOverItsNameDateAndLectures() throws Exception {
        var request = new ExamPlanner.ExamRequest("Midterm", LocalDate.of(2026, 9, 26), List.of(11L, 12L));
        when(planner.create(1L, request)).thenReturn(MIDTERM);
        mvc.perform(post("/api/courses/1/exams").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Midterm\",\"date\":\"2026-09-26\",\"lectureIds\":[11,12]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(4));
    }

    @Test
    void updatingAnExamHandsOverTheChange() throws Exception {
        var request = new ExamPlanner.ExamRequest("Midterm", LocalDate.of(2026, 9, 29), List.of(11L));
        when(planner.update(4L, request)).thenReturn(MIDTERM);
        mvc.perform(put("/api/exams/4").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Midterm\",\"date\":\"2026-09-29\",\"lectureIds\":[11]}"))
            .andExpect(status().isOk());
        verify(planner).update(4L, request);
    }

    @Test
    void deletingAnExamAnswersWithNoContent() throws Exception {
        mvc.perform(delete("/api/exams/4")).andExpect(status().isNoContent());
        verify(planner).delete(4L);
    }
}
