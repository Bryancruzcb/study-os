package com.studyos.evalx;

import com.studyos.domain.Question;
import com.studyos.repo.QuestionRepo;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class EvalController {
    private final EvalService evalService;
    private final QuestionRepo questionRepo;

    public EvalController(EvalService evalService, QuestionRepo questionRepo) {
        this.evalService = evalService;
        this.questionRepo = questionRepo;
    }

    public record LabelRequest(boolean answerable, boolean correctAnswer, boolean unambiguous) {}

    @PostMapping("/questions/{id}/label")
    public Question label(@PathVariable Long id, @RequestBody LabelRequest req) {
        Question q = questionRepo.findById(id).orElseThrow();
        q.labelAnswerable = req.answerable();
        q.labelCorrectAnswer = req.correctAnswer();
        q.labelUnambiguous = req.unambiguous();
        return questionRepo.save(q);
    }

    @GetMapping("/eval/report")
    public EvalService.EvalReport report() {
        return evalService.report();
    }
}
