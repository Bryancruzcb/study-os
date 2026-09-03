package com.studyos.evalx;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.studyos.domain.Attempt;
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
        Question unlabeled = new Question();
        when(questionRepo.findAll()).thenReturn(List.of(
            labeled(true, true, true), labeled(true, false, false), unlabeled));
        when(attemptRepo.findByGraderVerdictIsNotNull()).thenReturn(List.of());
        var r = service.report();
        assertEquals(2, r.labeled());
        assertEquals(1.0, r.pctAnswerable(), 1e-9);
        assertEquals(0.5, r.pctCorrectAnswer(), 1e-9);
        assertEquals(0.5, r.pctUnambiguous(), 1e-9);
    }

    @Test
    void graderAgreementFromOverrides() {
        when(questionRepo.findAll()).thenReturn(List.of());
        Attempt agreed = judged(Verdict.CORRECT, false);
        Attempt overriddenA = judged(Verdict.INCORRECT, true);
        when(attemptRepo.findByGraderVerdictIsNotNull())
            .thenReturn(List.of(agreed, agreed, agreed, overriddenA));
        var r = service.report();
        assertEquals(4, r.gradedShortAnswers());
        assertEquals(0.75, r.graderAgreement(), 1e-9);
    }

    @Test
    void graderFailuresAreNotJudgementsToAgreeWith() {
        when(questionRepo.findAll()).thenReturn(List.of());
        // the grader failed on this one; the human self-graded it, so no judgement was disagreed with
        Attempt graderFailed = judged(Verdict.PENDING, false);
        graderFailed.graderRaw = null;
        when(attemptRepo.findByGraderVerdictIsNotNull()).thenReturn(List.of(
            judged(Verdict.CORRECT, false), judged(Verdict.CORRECT, false),
            judged(Verdict.INCORRECT, true), graderFailed));
        var r = service.report();
        assertEquals(3, r.gradedShortAnswers());          // the PENDING row is not a graded short answer
        assertEquals(2 / 3.0, r.graderAgreement(), 1e-9); // counting it would report 0.75
    }

    @Test
    void emptyDataReportsZerosInsteadOfDividingByZero() {
        when(questionRepo.findAll()).thenReturn(List.of());
        when(attemptRepo.findByGraderVerdictIsNotNull()).thenReturn(List.of());
        var r = service.report();
        assertEquals(0, r.labeled());
        assertEquals(0.0, r.pctAnswerable(), 1e-9);
        assertEquals(0.0, r.pctCorrectAnswer(), 1e-9);
        assertEquals(0.0, r.pctUnambiguous(), 1e-9);
        assertEquals(0, r.gradedShortAnswers());
        assertEquals(0.0, r.graderAgreement(), 1e-9);
    }
}
