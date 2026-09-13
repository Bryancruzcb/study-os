package com.studyos.exam;

import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ExamController {
    private final ExamPlanner planner;

    public ExamController(ExamPlanner planner) {
        this.planner = planner;
    }

    /* the lectures an exam can cover, for the form that picks them */
    @GetMapping("/courses/{courseId}/lectures")
    public List<ExamPlanner.LectureView> lectures(@PathVariable Long courseId) {
        return planner.lectures(courseId);
    }

    @GetMapping("/courses/{courseId}/exams")
    public List<ExamPlanner.ExamView> exams(@PathVariable Long courseId) {
        return planner.exams(courseId);
    }

    @PostMapping("/courses/{courseId}/exams")
    public ExamPlanner.ExamView create(@PathVariable Long courseId, @RequestBody ExamPlanner.ExamRequest request) {
        return planner.create(courseId, request);
    }

    @PutMapping("/exams/{id}")
    public ExamPlanner.ExamView update(@PathVariable Long id, @RequestBody ExamPlanner.ExamRequest request) {
        return planner.update(id, request);
    }

    @DeleteMapping("/exams/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        planner.delete(id);
        return ResponseEntity.noContent().build();
    }
}
