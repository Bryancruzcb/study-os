package com.studyos.study;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.studyos.domain.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(StudyController.class)
class StudyControllerTest {
    @Autowired MockMvc mvc;
    @MockBean StudyService studyService;

    @Test
    void nextReturns204WhenNothingDue() throws Exception {
        when(studyService.next(1L)).thenReturn(Optional.empty());
        mvc.perform(get("/api/study/next").param("courseId", "1"))
            .andExpect(status().isNoContent());
    }

    @Test
    void nextReturnsQuestion() throws Exception {
        Question q = new Question();
        q.id = 9L;
        q.type = QuestionType.MC;
        when(studyService.next(1L)).thenReturn(Optional.of(q));
        mvc.perform(get("/api/study/next").param("courseId", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(9));
    }

    @Test
    void mcAnswerRoutesToService() throws Exception {
        Attempt a = new Attempt();
        a.verdict = Verdict.CORRECT;
        when(studyService.answerMc(9L, 2)).thenReturn(a);
        mvc.perform(post("/api/study/answer")
                .contentType("application/json")
                .content("{\"questionId\":9,\"answerIndex\":2}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.verdict").value("CORRECT"));
    }
}
