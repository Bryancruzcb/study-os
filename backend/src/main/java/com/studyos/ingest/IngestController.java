package com.studyos.ingest;

import com.studyos.auth.Owned;
import com.studyos.auth.SignedIn;
import com.studyos.domain.*;
import com.studyos.repo.*;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class IngestController {
    private final IngestService ingestService;
    private final CourseRepo courseRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;
    private final AppUserRepo appUserRepo;
    private final Owned owned;

    public IngestController(IngestService ingestService, CourseRepo courseRepo, ConceptRepo conceptRepo,
                            QuestionRepo questionRepo, AppUserRepo appUserRepo, Owned owned) {
        this.ingestService = ingestService;
        this.courseRepo = courseRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
        this.appUserRepo = appUserRepo;
        this.owned = owned;
    }

    public record CourseRequest(String name, String term) {}
    public record ConceptWithQuestions(Long id, String name, String summary, String sourcePages,
                                       String lecture, List<Question> questions) {}

    @PostMapping("/courses")
    public Course createCourse(@AuthenticationPrincipal SignedIn me, @RequestBody CourseRequest req) {
        Course c = new Course();
        c.name = req.name();
        c.term = req.term();
        c.owner = appUserRepo.getReferenceById(me.id());
        return courseRepo.save(c);
    }

    @GetMapping("/courses")
    public List<Course> courses(@AuthenticationPrincipal SignedIn me) {
        return courseRepo.findByOwnerIdOrderByIdAsc(me.id());
    }

    @PostMapping("/courses/{courseId}/materials")
    public Material upload(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId,
                           @RequestParam("file") MultipartFile file) throws IOException {
        owned.course(me.id(), courseId);
        return ingestService.ingest(courseId, file.getOriginalFilename(), file.getBytes());
    }

    @GetMapping("/courses/{courseId}/bank")
    public List<ConceptWithQuestions> bank(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId) {
        owned.course(me.id(), courseId);
        return conceptRepo.findByCourseIdOrderByIdAsc(courseId).stream()
            .map(c -> new ConceptWithQuestions(c.id, c.name, c.summary, c.sourcePages,
                c.material == null ? null : c.material.filename,
                questionRepo.findByConceptIdOrderByIdAsc(c.id)))
            .toList();
    }

    @PostMapping("/questions/{id}/retire")
    public Map<String, String> retire(@AuthenticationPrincipal SignedIn me, @PathVariable Long id) {
        owned.question(me.id(), id);
        Question q = questionRepo.findById(id).orElseThrow();
        q.status = QuestionStatus.RETIRED;
        questionRepo.save(q);
        return Map.of("status", "retired");
    }

    @PostMapping("/questions/{id}/restore")
    public Map<String, String> restore(@AuthenticationPrincipal SignedIn me, @PathVariable Long id) {
        owned.question(me.id(), id);
        Question q = questionRepo.findById(id).orElseThrow();
        q.status = QuestionStatus.ACTIVE;
        questionRepo.save(q);
        return Map.of("status", "active");
    }
}
