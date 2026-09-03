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
    public record SelfGradeRequest(boolean correct) {}

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
        if (req.answerText() != null) {
            return studyService.answerShort(req.questionId(), req.answerText());
        }
        throw new IllegalArgumentException("answerIndex or answerText required");
    }

    @PostMapping("/attempts/{id}/override")
    public Attempt override(@PathVariable Long id) {
        return studyService.override(id);
    }

    @PostMapping("/attempts/{id}/self-grade")
    public Attempt selfGrade(@PathVariable Long id, @RequestBody SelfGradeRequest req) {
        return studyService.selfGrade(id, req.correct());
    }
}
