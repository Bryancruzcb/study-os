package com.studyos.quiz;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.studyos.domain.*;
import com.studyos.repo.QuestionRepo;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(QuizController.class)
class QuizControllerTest {
    @Autowired MockMvc mvc;
    @MockBean QuestionRepo questionRepo;

    private static Question question(long id, QuestionType type) {
        Question q = new Question();
        q.id = id;
        q.type = type;
        q.sourcePages = "3";
        q.concept = new Concept();
        q.concept.id = 4L;
        q.concept.name = "TCP handshake";
        q.concept.material = new Material();
        q.concept.material.id = 7L;
        q.concept.material.filename = "Lecture 3.pdf";
        return q;
    }

    private static Question explainedMc() {
        Question q = question(9L, QuestionType.MC);
        q.prompt = "How many segments open a TCP connection?";
        q.optionsJson = "[\"1\",\"2\",\"3\",\"4\"]";
        q.correctIndex = 2;
        q.explanation = "Slide 3 shows SYN, SYN-ACK and ACK before any data moves.";
        q.optionExplanationsJson = "[\"One segment is only the SYN on slide 3.\",\"Two stops before the ACK.\","
            + "\"SYN, SYN-ACK and ACK are the three on slide 3.\",\"Slide 3 never shows a fourth.\"]";
        q.diagram = "sequenceDiagram\n  Client->>Server: SYN";
        return q;
    }

    @Test
    void theQuizListsEveryActiveQuestionWithItsLectureAndNeverTheKey() throws Exception {
        Question shortAnswer = question(10L, QuestionType.SHORT_ANSWER);
        shortAnswer.prompt = "Describe the handshake.";
        shortAnswer.modelAnswer = "SYN, SYN-ACK, ACK";
        when(questionRepo.findForQuiz(2L, QuestionStatus.ACTIVE)).thenReturn(List.of(explainedMc(), shortAnswer));

        mvc.perform(get("/api/courses/2/quiz"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].id").value(9))
            .andExpect(jsonPath("$[0].topic").value("TCP handshake"))
            .andExpect(jsonPath("$[0].lecture").value("Lecture 3.pdf"))
            .andExpect(jsonPath("$[0].lectureId").value(7))
            .andExpect(jsonPath("$[0].options.length()").value(4))
            .andExpect(jsonPath("$[0].correctIndex").doesNotExist())
            .andExpect(jsonPath("$[0].explanation").doesNotExist())
            .andExpect(jsonPath("$[1].type").value("SHORT_ANSWER"))
            .andExpect(jsonPath("$[1].modelAnswer").doesNotExist());
    }

    @Test
    void theReviewCarriesTheKeyAndWhyEveryAnswerIsRightOrWrong() throws Exception {
        when(questionRepo.findById(9L)).thenReturn(Optional.of(explainedMc()));

        mvc.perform(get("/api/questions/9/review"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(9))
            .andExpect(jsonPath("$.correctIndex").value(2))
            .andExpect(jsonPath("$.explanation").value("Slide 3 shows SYN, SYN-ACK and ACK before any data moves."))
            .andExpect(jsonPath("$.optionExplanations.length()").value(4))
            .andExpect(jsonPath("$.optionExplanations[2]").value("SYN, SYN-ACK and ACK are the three on slide 3."))
            .andExpect(jsonPath("$.diagram").value("sequenceDiagram\n  Client->>Server: SYN"));
    }

    @Test
    void aQuestionNobodyHasExplainedStillReviewsWithItsKey() throws Exception {
        Question q = question(10L, QuestionType.SHORT_ANSWER);
        q.modelAnswer = "SYN, SYN-ACK, ACK";
        q.rubric = "- names all three segments";
        when(questionRepo.findById(10L)).thenReturn(Optional.of(q));

        mvc.perform(get("/api/questions/10/review"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.modelAnswer").value("SYN, SYN-ACK, ACK"))
            .andExpect(jsonPath("$.rubric").value("- names all three segments"))
            .andExpect(jsonPath("$.explanation").value(nullValue()))
            .andExpect(jsonPath("$.optionExplanations.length()").value(0))
            .andExpect(jsonPath("$.diagram").value(nullValue()));
    }

    @Test
    void anUnknownQuestionIsNotFound() throws Exception {
        when(questionRepo.findById(404L)).thenReturn(Optional.empty());
        mvc.perform(get("/api/questions/404/review")).andExpect(status().isNotFound());
    }
}
