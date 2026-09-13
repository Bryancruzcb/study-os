package com.studyos.evalx;

import com.studyos.auth.Owned;
import com.studyos.auth.SignedIn;
import com.studyos.domain.Question;
import com.studyos.repo.QuestionRepo;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class EvalController {
    private final EvalService evalService;
    private final QuestionRepo questionRepo;
    private final Owned owned;

    public EvalController(EvalService evalService, QuestionRepo questionRepo, Owned owned) {
        this.evalService = evalService;
        this.questionRepo = questionRepo;
        this.owned = owned;
    }

    public record LabelRequest(boolean answerable, boolean correctAnswer, boolean unambiguous) {}

    @PostMapping("/questions/{id}/label")
    public Question label(@AuthenticationPrincipal SignedIn me, @PathVariable Long id,
                          @RequestBody LabelRequest req) {
        owned.question(me.id(), id);
        Question q = questionRepo.findById(id).orElseThrow();
        q.labelAnswerable = req.answerable();
        q.labelCorrectAnswer = req.correctAnswer();
        q.labelUnambiguous = req.unambiguous();
        return questionRepo.save(q);
    }

    @GetMapping("/eval/report")
    public EvalService.EvalReport report(@AuthenticationPrincipal SignedIn me) {
        return evalService.report(me.id());
    }
}
