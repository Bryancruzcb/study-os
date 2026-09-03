package com.studyos.evalx;

import com.studyos.domain.Attempt;
import com.studyos.domain.Question;
import com.studyos.domain.Verdict;
import com.studyos.repo.AttemptRepo;
import com.studyos.repo.QuestionRepo;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class EvalService {
    private final QuestionRepo questionRepo;
    private final AttemptRepo attemptRepo;

    public EvalService(QuestionRepo questionRepo, AttemptRepo attemptRepo) {
        this.questionRepo = questionRepo;
        this.attemptRepo = attemptRepo;
    }

    public record EvalReport(int labeled, double pctAnswerable, double pctCorrectAnswer,
                             double pctUnambiguous, int gradedShortAnswers, double graderAgreement) {}

    public EvalReport report() {
        List<Question> labeled = questionRepo.findAll().stream()
            .filter(q -> q.labelAnswerable != null).toList();
        int n = labeled.size();
        double a = n == 0 ? 0 : labeled.stream().filter(q -> q.labelAnswerable).count() / (double) n;
        double c = n == 0 ? 0 : labeled.stream().filter(q -> Boolean.TRUE.equals(q.labelCorrectAnswer)).count() / (double) n;
        double u = n == 0 ? 0 : labeled.stream().filter(q -> Boolean.TRUE.equals(q.labelUnambiguous)).count() / (double) n;
        // only a judgement the grader actually produced can be agreed or disagreed with:
        // PENDING means the grader failed, and those rows would count as agreement they never earned
        List<Attempt> graded = attemptRepo.findByGraderVerdictIsNotNull().stream()
            .filter(at -> at.graderVerdict != Verdict.PENDING).toList();
        int g = graded.size();
        double agreement = g == 0 ? 0 : graded.stream().filter(at -> !at.overridden).count() / (double) g;
        return new EvalReport(n, a, c, u, g, agreement);
    }
}
