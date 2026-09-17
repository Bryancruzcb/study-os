package com.studyos.quiz;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.auth.Owned;
import com.studyos.auth.SignedIn;
import com.studyos.domain.Course;
import com.studyos.domain.QuestionStatus;
import com.studyos.domain.QuizProgress;
import com.studyos.repo.QuestionRepo;
import com.studyos.repo.QuizProgressRepo;
import com.studyos.study.QuestionView;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Quiz mode: every question a course can still ask, from every lecture and topic, in one list the page
 * shuffles into a quiz, a question's answer with its explanations once it has been answered, and the
 * saved run so another browser can pick the quiz up. A quiz is practice, so nothing here records an
 * attempt or moves a review date.
 */
@RestController
@RequestMapping("/api")
public class QuizController {
    private final QuestionRepo questionRepo;
    private final QuizProgressRepo progressRepo;
    private final ObjectMapper mapper;
    private final Owned owned;

    public QuizController(QuestionRepo questionRepo, QuizProgressRepo progressRepo,
                          ObjectMapper mapper, Owned owned) {
        this.questionRepo = questionRepo;
        this.progressRepo = progressRepo;
        this.mapper = mapper;
        this.owned = owned;
    }

    @GetMapping("/courses/{courseId}/quiz")
    public List<QuestionView> quiz(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId) {
        owned.course(me.id(), courseId);
        return questionRepo.findForQuiz(courseId, QuestionStatus.ACTIVE).stream()
            .map(q -> QuestionView.from(q, mapper))
            .toList();
    }

    @GetMapping("/questions/{id}/review")
    public QuestionReview review(@AuthenticationPrincipal SignedIn me, @PathVariable Long id) {
        return QuestionReview.from(owned.question(me.id(), id), mapper);
    }

    /* the saved run for this course, or 204 when none has been started yet */
    @GetMapping("/courses/{courseId}/quiz/progress")
    public ResponseEntity<QuizRunView> progress(@AuthenticationPrincipal SignedIn me,
                                                @PathVariable Long courseId) {
        owned.course(me.id(), courseId);
        return progressRepo.findByCourseId(courseId)
            .map(row -> ResponseEntity.ok(QuizRunView.from(row, mapper)))
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /* create or replace the run; one row per course, so a retake overwrites the previous one */
    @PutMapping("/courses/{courseId}/quiz/progress")
    public QuizRunView saveProgress(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId,
                                    @RequestBody QuizRunView body) {
        Course course = owned.course(me.id(), courseId);
        QuizProgress row = progressRepo.findByCourseId(courseId).orElseGet(QuizProgress::new);
        row.course = course;
        body.writeInto(row, mapper);
        progressRepo.save(row);
        return QuizRunView.from(row, mapper);
    }

    @DeleteMapping("/courses/{courseId}/quiz/progress")
    public ResponseEntity<Void> clearProgress(@AuthenticationPrincipal SignedIn me,
                                              @PathVariable Long courseId) {
        owned.course(me.id(), courseId);
        progressRepo.findByCourseId(courseId).ifPresent(progressRepo::delete);
        return ResponseEntity.noContent().build();
    }
}
