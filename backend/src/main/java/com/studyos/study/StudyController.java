package com.studyos.study;

import com.studyos.domain.Attempt;
import com.studyos.domain.Question;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/study")
public class StudyController {
    private final StudyService studyService;

    public StudyController(StudyService studyService) {
        this.studyService = studyService;
    }

    public record AnswerRequest(Long questionId, Integer answerIndex, String answerText) {}

    @GetMapping("/next")
    public ResponseEntity<Question> next(@RequestParam Long courseId) {
        return studyService.next(courseId)
            .map(ResponseEntity::ok)
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
