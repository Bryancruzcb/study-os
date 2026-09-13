package com.studyos.quiz;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.QuestionStatus;
import com.studyos.repo.QuestionRepo;
import com.studyos.study.QuestionView;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Quiz mode: every question a course can still ask, from every lecture and topic, in one list the page
 * shuffles into a quiz, and a question's answer with its explanations once it has been answered. A quiz
 * is practice, so neither endpoint records an attempt or moves a review date.
 */
@RestController
@RequestMapping("/api")
public class QuizController {
    private final QuestionRepo questionRepo;
    private final ObjectMapper mapper;

    public QuizController(QuestionRepo questionRepo, ObjectMapper mapper) {
        this.questionRepo = questionRepo;
        this.mapper = mapper;
    }

    @GetMapping("/courses/{courseId}/quiz")
    public List<QuestionView> quiz(@PathVariable Long courseId) {
        return questionRepo.findForQuiz(courseId, QuestionStatus.ACTIVE).stream()
            .map(q -> QuestionView.from(q, mapper))
            .toList();
    }

    @GetMapping("/questions/{id}/review")
    public QuestionReview review(@PathVariable Long id) {
        return questionRepo.findById(id)
            .map(q -> QuestionReview.from(q, mapper))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "no question has id " + id));
    }
}
