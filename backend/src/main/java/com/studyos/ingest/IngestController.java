package com.studyos.ingest;

import com.studyos.domain.*;
import com.studyos.repo.*;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class IngestController {
    private final IngestService ingestService;
    private final CourseRepo courseRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;

    public IngestController(IngestService ingestService, CourseRepo courseRepo,
                            ConceptRepo conceptRepo, QuestionRepo questionRepo) {
        this.ingestService = ingestService;
        this.courseRepo = courseRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
    }

    public record CourseRequest(String name, String term) {}
    public record ConceptWithQuestions(Long id, String name, String summary, String sourcePages,
                                       List<Question> questions) {}

    @PostMapping("/courses")
    public Course createCourse(@RequestBody CourseRequest req) {
        Course c = new Course();
        c.name = req.name();
        c.term = req.term();
        return courseRepo.save(c);
    }

    @GetMapping("/courses")
    public List<Course> courses() {
        return courseRepo.findAll();
    }

    @PostMapping("/courses/{courseId}/materials")
    public Material upload(@PathVariable Long courseId, @RequestParam("file") MultipartFile file)
            throws IOException {
        return ingestService.ingest(courseId, file.getOriginalFilename(), file.getBytes());
    }

    @GetMapping("/courses/{courseId}/bank")
    public List<ConceptWithQuestions> bank(@PathVariable Long courseId) {
        return conceptRepo.findByCourseIdOrderByIdAsc(courseId).stream()
            .map(c -> new ConceptWithQuestions(c.id, c.name, c.summary, c.sourcePages,
                questionRepo.findByConceptIdOrderByIdAsc(c.id)))
            .toList();
    }

    @PostMapping("/questions/{id}/retire")
    public Map<String, String> retire(@PathVariable Long id) {
        Question q = questionRepo.findById(id).orElseThrow();
        q.status = QuestionStatus.RETIRED;
        questionRepo.save(q);
        return Map.of("status", "retired");
    }
}
