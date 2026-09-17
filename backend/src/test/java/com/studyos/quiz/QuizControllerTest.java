package com.studyos.quiz;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.studyos.auth.Owned;
import com.studyos.auth.SignedInMvc;
import com.studyos.domain.*;
import com.studyos.repo.QuestionRepo;
import com.studyos.repo.QuizProgressRepo;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@WebMvcTest(QuizController.class)
@Import(SignedInMvc.class)
class QuizControllerTest {
    @Autowired MockMvc mvc;
    @MockBean QuestionRepo questionRepo;
    @MockBean QuizProgressRepo progressRepo;
    @MockBean Owned owned;

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

    private static Course course(long id) {
        Course c = new Course();
        c.id = id;
        c.name = "CS 149";
        c.term = "Fall 2026";
        return c;
    }

    private static QuizProgress progress(long courseId) {
        QuizProgress row = new QuizProgress();
        row.id = 1L;
        row.course = course(courseId);
        row.orderJson = "[11,9,10]";
        row.answersJson = "{\"11\":{\"picked\":1,\"text\":\"\",\"correct\":false}}";
        row.finished = false;
        return row;
    }

    @Test
    void anotherAccountsCourseCannotBeRead() throws Exception {
        when(owned.course(SignedInMvc.ME.id(), 2L)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(get("/api/courses/2/quiz")).andExpect(status().isNotFound());
        verifyNoInteractions(questionRepo);
    }

    @Test
    void anotherAccountsQuestionCannotBeReviewed() throws Exception {
        when(owned.question(SignedInMvc.ME.id(), 9L)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(get("/api/questions/9/review")).andExpect(status().isNotFound());
        verifyNoInteractions(questionRepo);
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
        when(owned.question(SignedInMvc.ME.id(), 9L)).thenReturn(explainedMc());

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
        when(owned.question(SignedInMvc.ME.id(), 10L)).thenReturn(q);

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
        when(owned.question(SignedInMvc.ME.id(), 404L)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(get("/api/questions/404/review")).andExpect(status().isNotFound());
    }

    @Test
    void anotherAccountsProgressCannotBeReadOrWritten() throws Exception {
        when(owned.course(SignedInMvc.ME.id(), 2L)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(get("/api/courses/2/quiz/progress")).andExpect(status().isNotFound());
        mvc.perform(put("/api/courses/2/quiz/progress").contentType(MediaType.APPLICATION_JSON)
            .content("{\"order\":[1],\"answers\":{},\"finished\":false}")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/courses/2/quiz/progress")).andExpect(status().isNotFound());
        verifyNoInteractions(progressRepo);
    }

    @Test
    void aCourseWithNoSavedRunAnswers204() throws Exception {
        when(owned.course(SignedInMvc.ME.id(), 2L)).thenReturn(course(2L));
        when(progressRepo.findByCourseId(2L)).thenReturn(Optional.empty());
        mvc.perform(get("/api/courses/2/quiz/progress")).andExpect(status().isNoContent());
    }

    @Test
    void aSavedRunRoundTripsThroughPutAndGet() throws Exception {
        when(owned.course(SignedInMvc.ME.id(), 2L)).thenReturn(course(2L));
        when(progressRepo.findByCourseId(2L)).thenReturn(Optional.empty());
        when(progressRepo.save(any(QuizProgress.class))).thenAnswer(inv -> {
            QuizProgress row = inv.getArgument(0);
            row.id = 5L;
            return row;
        });

        mvc.perform(put("/api/courses/2/quiz/progress").contentType(MediaType.APPLICATION_JSON)
                .content("{\"order\":[11,9],\"answers\":{\"11\":{\"picked\":1,\"text\":\"\",\"correct\":false}},\"finished\":false}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.order.length()").value(2))
            .andExpect(jsonPath("$.order[0]").value(11))
            .andExpect(jsonPath("$.answers.11.picked").value(1))
            .andExpect(jsonPath("$.answers.11.correct").value(false))
            .andExpect(jsonPath("$.finished").value(false));

        ArgumentCaptor<QuizProgress> saved = ArgumentCaptor.forClass(QuizProgress.class);
        verify(progressRepo).save(saved.capture());
        QuizProgress row = saved.getValue();
        assertEquals(2L, row.course.id);
        assertEquals(true, row.orderJson.contains("11"));
        assertFalse(row.finished);

        when(progressRepo.findByCourseId(2L)).thenReturn(Optional.of(progress(2L)));
        mvc.perform(get("/api/courses/2/quiz/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.order[0]").value(11))
            .andExpect(jsonPath("$.answers.11.correct").value(false))
            .andExpect(jsonPath("$.finished").value(false));
    }

    @Test
    void clearingProgressDeletesTheRow() throws Exception {
        when(owned.course(SignedInMvc.ME.id(), 2L)).thenReturn(course(2L));
        QuizProgress row = progress(2L);
        when(progressRepo.findByCourseId(2L)).thenReturn(Optional.of(row));
        mvc.perform(delete("/api/courses/2/quiz/progress")).andExpect(status().isNoContent());
        verify(progressRepo).delete(eq(row));
    }
}
