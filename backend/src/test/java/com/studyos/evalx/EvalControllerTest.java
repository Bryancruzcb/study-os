package com.studyos.evalx;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.studyos.domain.Question;
import com.studyos.repo.QuestionRepo;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(EvalController.class)
class EvalControllerTest {
    @Autowired MockMvc mvc;
    @MockBean EvalService evalService;
    @MockBean QuestionRepo questionRepo;

    @Test
    void labelStoresAllThreeLabels() throws Exception {
        Question q = new Question();
        q.id = 7L;
        when(questionRepo.findById(7L)).thenReturn(Optional.of(q));
        when(questionRepo.save(any(Question.class))).thenAnswer(i -> i.getArgument(0));
        mvc.perform(post("/api/questions/7/label")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"answerable\":true,\"correctAnswer\":true,\"unambiguous\":false}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.labelAnswerable").value(true))
            .andExpect(jsonPath("$.labelCorrectAnswer").value(true))
            .andExpect(jsonPath("$.labelUnambiguous").value(false));
        verify(questionRepo).save(q);
    }

    @Test
    void reportIsServedAsJson() throws Exception {
        when(evalService.report()).thenReturn(new EvalService.EvalReport(2, 1.0, 0.5, 0.5, 4, 0.75));
        mvc.perform(get("/api/eval/report"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.labeled").value(2))
            .andExpect(jsonPath("$.pctCorrectAnswer").value(0.5))
            .andExpect(jsonPath("$.gradedShortAnswers").value(4))
            .andExpect(jsonPath("$.graderAgreement").value(0.75));
    }
}
