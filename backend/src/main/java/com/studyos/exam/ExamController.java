package com.studyos.exam;

import com.studyos.auth.Owned;
import com.studyos.auth.SignedIn;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ExamController {
    private final ExamPlanner planner;
    private final Owned owned;

    public ExamController(ExamPlanner planner, Owned owned) {
        this.planner = planner;
        this.owned = owned;
    }

    /* the lectures an exam can cover, for the form that picks them */
    @GetMapping("/courses/{courseId}/lectures")
    public List<ExamPlanner.LectureView> lectures(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId) {
        owned.course(me.id(), courseId);
        return planner.lectures(courseId);
    }

    @GetMapping("/courses/{courseId}/exams")
    public List<ExamPlanner.ExamView> exams(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId) {
        owned.course(me.id(), courseId);
        return planner.exams(courseId);
    }

    @PostMapping("/courses/{courseId}/exams")
    public ExamPlanner.ExamView create(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId,
                                       @RequestBody ExamPlanner.ExamRequest request) {
        owned.course(me.id(), courseId);
        return planner.create(courseId, request);
    }

    @PutMapping("/exams/{id}")
    public ExamPlanner.ExamView update(@AuthenticationPrincipal SignedIn me, @PathVariable Long id,
                                       @RequestBody ExamPlanner.ExamRequest request) {
        owned.exam(me.id(), id);
        return planner.update(id, request);
    }

    @DeleteMapping("/exams/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal SignedIn me, @PathVariable Long id) {
        owned.exam(me.id(), id);
        planner.delete(id);
        return ResponseEntity.noContent().build();
    }
}
