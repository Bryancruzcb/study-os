package com.studyos.study;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.auth.Owned;
import com.studyos.auth.SignedIn;
import com.studyos.domain.Attempt;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/study")
public class StudyController {
    private final StudyService studyService;
    private final ObjectMapper mapper;
    private final Owned owned;

    public StudyController(StudyService studyService, ObjectMapper mapper, Owned owned) {
        this.studyService = studyService;
        this.mapper = mapper;
        this.owned = owned;
    }

    public record AnswerRequest(Long questionId, Integer answerIndex, String answerText) {}
    public record SelfGradeRequest(boolean correct) {}

    @GetMapping("/next")
    public ResponseEntity<QuestionView> next(@AuthenticationPrincipal SignedIn me, @RequestParam Long courseId) {
        owned.course(me.id(), courseId);
        return studyService.next(courseId)
            .map(q -> ResponseEntity.ok(QuestionView.from(q, mapper)))
            .orElse(ResponseEntity.noContent().build());
    }

    @PostMapping("/answer")
    public AnswerResult answer(@AuthenticationPrincipal SignedIn me, @RequestBody AnswerRequest req) {
        owned.question(me.id(), req.questionId());
        if (req.answerIndex() != null) {
            return AnswerResult.from(studyService.answerMc(req.questionId(), req.answerIndex()), mapper);
        }
        if (req.answerText() != null) {
            return AnswerResult.from(studyService.answerShort(req.questionId(), req.answerText()), mapper);
        }
        throw new IllegalArgumentException("answerIndex or answerText required");
    }

    @PostMapping("/attempts/{id}/override")
    public Attempt override(@AuthenticationPrincipal SignedIn me, @PathVariable Long id) {
        owned.attempt(me.id(), id);
        return studyService.override(id);
    }

    @PostMapping("/attempts/{id}/self-grade")
    public Attempt selfGrade(@AuthenticationPrincipal SignedIn me, @PathVariable Long id,
                             @RequestBody SelfGradeRequest req) {
        owned.attempt(me.id(), id);
        return studyService.selfGrade(id, req.correct());
    }
}
