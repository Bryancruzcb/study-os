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
    void nextReturnsQuestionViewWithoutAnswerKey() throws Exception {
        Question q = new Question();
        q.id = 9L;
        q.type = QuestionType.MC;
        q.prompt = "Steps in the TCP handshake?";
        q.optionsJson = "[\"1\",\"2\",\"3\",\"4\"]";
        q.correctIndex = 2;
        q.sourcePages = "3";
        when(studyService.next(1L)).thenReturn(Optional.of(q));
        mvc.perform(get("/api/study/next").param("courseId", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(9))
            .andExpect(jsonPath("$.type").value("MC"))
            .andExpect(jsonPath("$.prompt").value("Steps in the TCP handshake?"))
            .andExpect(jsonPath("$.options[0]").value("1"))
            .andExpect(jsonPath("$.options.length()").value(4))
            .andExpect(jsonPath("$.sourcePages").value("3"))
            .andExpect(jsonPath("$.correctIndex").doesNotExist())
            .andExpect(jsonPath("$.modelAnswer").doesNotExist());
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
