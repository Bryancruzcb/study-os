package com.studyos.evalx;

import com.studyos.domain.Concept;
import com.studyos.domain.Course;
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
                             double pctUnambiguous, int gradedShortAnswers, double graderAgreement,
                             List<ReviewItem> needsReview) {}

    /**
     * A labeled question that failed at least one check: which checks it failed, and enough of where it
     * lives in a course for the page to link straight to its card in the bank.
     */
    public record ReviewItem(Long questionId, Long courseId, String course, Long conceptId, String concept,
                             String prompt, boolean answerable, boolean correctAnswer, boolean unambiguous) {}

    /** The report over one account's courses: its labeled questions and its graded answers. */
    public EvalReport report(Long ownerId) {
        List<Question> labeled = questionRepo.findByConceptCourseOwnerIdAndLabelAnswerableIsNotNull(ownerId);
        int n = labeled.size();
        double a = n == 0 ? 0 : labeled.stream().filter(q -> q.labelAnswerable).count() / (double) n;
        double c = n == 0 ? 0 : labeled.stream().filter(q -> Boolean.TRUE.equals(q.labelCorrectAnswer)).count() / (double) n;
        double u = n == 0 ? 0 : labeled.stream().filter(q -> Boolean.TRUE.equals(q.labelUnambiguous)).count() / (double) n;
        // only a judgement the grader actually produced can be agreed or disagreed with:
        // PENDING means the grader failed, and those rows would count as agreement they never earned
        List<Attempt> graded = attemptRepo.findByQuestionConceptCourseOwnerIdAndGraderVerdictIsNotNull(ownerId).stream()
            .filter(at -> at.graderVerdict != Verdict.PENDING).toList();
        int g = graded.size();
        double agreement = g == 0 ? 0 : graded.stream().filter(at -> !at.overridden).count() / (double) g;
        List<ReviewItem> needsReview = labeled.stream().map(EvalService::reviewItem)
            .filter(item -> !item.answerable() || !item.correctAnswer() || !item.unambiguous())
            .toList();
        return new EvalReport(n, a, c, u, g, agreement, needsReview);
    }

    /* the same reading of the labels as the rates above: a missing label is not a pass */
    private static ReviewItem reviewItem(Question q) {
        Concept concept = q.concept;
        Course course = concept == null ? null : concept.course;
        return new ReviewItem(q.id, course == null ? null : course.id, course == null ? null : course.name,
            concept == null ? null : concept.id, concept == null ? null : concept.name, q.prompt,
            Boolean.TRUE.equals(q.labelAnswerable), Boolean.TRUE.equals(q.labelCorrectAnswer),
            Boolean.TRUE.equals(q.labelUnambiguous));
    }
}
