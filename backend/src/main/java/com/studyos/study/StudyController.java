package com.studyos.study;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.Attempt;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/study")
public class StudyController {
    private final StudyService studyService;
    private final ObjectMapper mapper;

    public StudyController(StudyService studyService, ObjectMapper mapper) {
        this.studyService = studyService;
        this.mapper = mapper;
    }

    public record AnswerRequest(Long questionId, Integer answerIndex, String answerText) {}

    @GetMapping("/next")
    public ResponseEntity<QuestionView> next(@RequestParam Long courseId) {
        return studyService.next(courseId)
            .map(q -> ResponseEntity.ok(QuestionView.from(q, mapper)))
            .orElse(ResponseEntity.noContent().build());
    }

    @PostMapping("/answer")
    public Attempt answer(@RequestBody AnswerRequest req) {
        if (req.answerIndex() != null) {
            return studyService.answerMc(req.questionId(), req.answerIndex());
        }
        throw new IllegalArgumentException("answerText grading arrives in Task 14");
    }
}
