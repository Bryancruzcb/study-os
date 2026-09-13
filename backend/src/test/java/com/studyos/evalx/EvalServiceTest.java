package com.studyos.evalx;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.studyos.domain.Attempt;
import com.studyos.domain.Concept;
import com.studyos.domain.Course;
import com.studyos.domain.Question;
import com.studyos.domain.Verdict;
import com.studyos.repo.AttemptRepo;
import com.studyos.repo.QuestionRepo;
import java.util.List;
import org.junit.jupiter.api.Test;

class EvalServiceTest {
    QuestionRepo questionRepo = mock(QuestionRepo.class);
    AttemptRepo attemptRepo = mock(AttemptRepo.class);
    EvalService service = new EvalService(questionRepo, attemptRepo);

    private Question labeled(boolean a, boolean c, boolean u) {
        Question q = new Question();
        q.labelAnswerable = a;
        q.labelCorrectAnswer = c;
        q.labelUnambiguous = u;
        return q;
    }

    private Attempt judged(Verdict graderVerdict, boolean overridden) {
        Attempt a = new Attempt();
        a.graderRaw = "{}";
        a.graderVerdict = graderVerdict;
        a.overridden = overridden;
        return a;
    }

    @Test
    void reportComputesLabelPercentages() {
        when(questionRepo.findByConceptCourseOwnerIdAndLabelAnswerableIsNotNull(1L)).thenReturn(List.of(
            labeled(true, true, true), labeled(true, false, false)));
        when(attemptRepo.findByQuestionConceptCourseOwnerIdAndGraderVerdictIsNotNull(1L)).thenReturn(List.of());
        var r = service.report(1L);
        assertEquals(2, r.labeled());
        assertEquals(1.0, r.pctAnswerable(), 1e-9);
        assertEquals(0.5, r.pctCorrectAnswer(), 1e-9);
        assertEquals(0.5, r.pctUnambiguous(), 1e-9);
    }

    @Test
    void listsEveryLabeledQuestionThatFailsACheckWithWhereItLives() {
        Course course = new Course();
        course.id = 2L;
        course.name = "CS 149";
        Concept concept = new Concept();
        concept.id = 7L;
        concept.name = "Program counter";
        concept.course = course;
        Question passes = labeled(true, true, true);
        passes.id = 1L;
        passes.concept = concept;
        Question wrongKey = labeled(true, false, true);
        wrongKey.id = 2L;
        wrongKey.prompt = "The address of the next instruction is provided by the ______";
        wrongKey.concept = concept;
        when(questionRepo.findByConceptCourseOwnerIdAndLabelAnswerableIsNotNull(1L)).thenReturn(List.of(passes, wrongKey));
        when(attemptRepo.findByQuestionConceptCourseOwnerIdAndGraderVerdictIsNotNull(1L)).thenReturn(List.of());

        var r = service.report(1L);

        // only a labeled question that fails something is listed; one that passes is not
        assertEquals(1, r.needsReview().size());
        var item = r.needsReview().get(0);
        assertEquals(2L, item.questionId());
        assertEquals(2L, item.courseId());
        assertEquals("CS 149", item.course());
        assertEquals(7L, item.conceptId());
        assertEquals("Program counter", item.concept());
        assertEquals("The address of the next instruction is provided by the ______", item.prompt());
        assertTrue(item.answerable());
        assertFalse(item.correctAnswer());
        assertTrue(item.unambiguous());
    }

    @Test
    void graderAgreementFromOverrides() {
        when(questionRepo.findByConceptCourseOwnerIdAndLabelAnswerableIsNotNull(1L)).thenReturn(List.of());
        Attempt agreed = judged(Verdict.CORRECT, false);
        Attempt overriddenA = judged(Verdict.INCORRECT, true);
        when(attemptRepo.findByQuestionConceptCourseOwnerIdAndGraderVerdictIsNotNull(1L))
            .thenReturn(List.of(agreed, agreed, agreed, overriddenA));
        var r = service.report(1L);
        assertEquals(4, r.gradedShortAnswers());
        assertEquals(0.75, r.graderAgreement(), 1e-9);
    }

    @Test
    void graderFailuresAreNotJudgementsToAgreeWith() {
        when(questionRepo.findByConceptCourseOwnerIdAndLabelAnswerableIsNotNull(1L)).thenReturn(List.of());
        // the grader failed on this one; the human self-graded it, so no judgement was disagreed with
        Attempt graderFailed = judged(Verdict.PENDING, false);
        graderFailed.graderRaw = null;
        when(attemptRepo.findByQuestionConceptCourseOwnerIdAndGraderVerdictIsNotNull(1L)).thenReturn(List.of(
            judged(Verdict.CORRECT, false), judged(Verdict.CORRECT, false),
            judged(Verdict.INCORRECT, true), graderFailed));
        var r = service.report(1L);
        assertEquals(3, r.gradedShortAnswers());          // the PENDING row is not a graded short answer
        assertEquals(2 / 3.0, r.graderAgreement(), 1e-9); // counting it would report 0.75
    }

    @Test
    void emptyDataReportsZerosInsteadOfDividingByZero() {
        when(questionRepo.findByConceptCourseOwnerIdAndLabelAnswerableIsNotNull(1L)).thenReturn(List.of());
        when(attemptRepo.findByQuestionConceptCourseOwnerIdAndGraderVerdictIsNotNull(1L)).thenReturn(List.of());
        var r = service.report(1L);
        assertEquals(0, r.labeled());
        assertEquals(0.0, r.pctAnswerable(), 1e-9);
        assertEquals(0.0, r.pctCorrectAnswer(), 1e-9);
        assertEquals(0.0, r.pctUnambiguous(), 1e-9);
        assertEquals(0, r.gradedShortAnswers());
        assertEquals(0.0, r.graderAgreement(), 1e-9);
        assertEquals(List.of(), r.needsReview());
    }
}
