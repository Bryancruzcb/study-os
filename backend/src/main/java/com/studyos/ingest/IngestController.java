package com.studyos.ingest;

import com.studyos.auth.Owned;
import com.studyos.auth.SignedIn;
import com.studyos.domain.*;
import com.studyos.repo.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class IngestController {
    private final IngestService ingestService;
    private final CourseRepo courseRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;
    private final AppUserRepo appUserRepo;
    private final MaterialPdfRepo materialPdfRepo;
    private final Owned owned;

    public IngestController(IngestService ingestService, CourseRepo courseRepo, ConceptRepo conceptRepo,
                            QuestionRepo questionRepo, AppUserRepo appUserRepo, MaterialPdfRepo materialPdfRepo,
                            Owned owned) {
        this.ingestService = ingestService;
        this.courseRepo = courseRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
        this.appUserRepo = appUserRepo;
        this.materialPdfRepo = materialPdfRepo;
        this.owned = owned;
    }

    public record CourseRequest(String name, String term) {}
    public record ConceptWithQuestions(Long id, String name, String summary, String sourcePages,
                                       String lecture, String lectureTitle, List<Question> questions) {}

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
        return ingestService.accept(courseId, file.getOriginalFilename(), file.getBytes());
    }

    // a set of photos makes one lecture. The client downscales them, so even fifty fit the
    // 33 MB request limit in application.yml
    static final int MIN_PHOTOS = 2;
    static final int MAX_PHOTOS = 50;
    static final int MAX_LECTURE_NAME = 120;

    /**
     * Several photos as one lecture: parts "files" (2 to 50 pictures, in lecture order) and
     * "name". The course is checked before anything else, so a stranger's course answers 404
     * whatever the request holds; then a missing name or a wrong count answers 400.
     */
    @PostMapping("/courses/{courseId}/materials/combined")
    public Material uploadPhotos(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId,
                                 @RequestParam(value = "files", required = false) List<MultipartFile> files,
                                 @RequestParam(value = "name", required = false) String name) throws IOException {
        owned.course(me.id(), courseId);
        String lecture = name == null ? "" : name.strip();
        if (lecture.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the lecture a name.");
        }
        if (lecture.codePointCount(0, lecture.length()) > MAX_LECTURE_NAME) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Keep the lecture name to " + MAX_LECTURE_NAME + " characters.");
        }
        int count = files == null ? 0 : files.size();
        if (count < MIN_PHOTOS || count > MAX_PHOTOS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Send between " + MIN_PHOTOS + " and " + MAX_PHOTOS + " photos; one photo uploads on its own.");
        }
        List<byte[]> photos = new ArrayList<>(count);
        List<String> names = new ArrayList<>(count);
        for (MultipartFile file : files) {
            photos.add(file.getBytes());
            names.add(file.getOriginalFilename());
        }
        return ingestService.acceptPhotos(courseId, lecture, photos, names);
    }

    @GetMapping("/materials/{id}")
    public Material material(@AuthenticationPrincipal SignedIn me, @PathVariable Long id) {
        return owned.material(me.id(), id);
    }

    /**
     * The lecture as the PDF its questions cite, shown in the browser's own viewer, so a quiz can
     * open slide N with {@code #page=N}. A deck uploaded as PowerPoint comes back as the PDF it was
     * turned into, one page per slide. 404 when the lecture is not this account's, or predates
     * keeping the bytes.
     */
    @GetMapping("/materials/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@AuthenticationPrincipal SignedIn me, @PathVariable Long id) {
        Material material = owned.material(me.id(), id);
        MaterialPdf pdf = materialPdfRepo.findById(id).orElse(null);
        if (pdf == null || pdf.bytes == null || pdf.bytes.length == 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, inlineAs(pdfName(material.filename)))
            .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
            .body(pdf.bytes);
    }

    // a plain name stays readable in the header; one with other characters goes out encoded
    private static String inlineAs(String name) {
        ContentDisposition.Builder inline = ContentDisposition.inline();
        boolean plain = name.chars().allMatch(c -> c >= 0x20 && c < 0x7F && c != '"' && c != '\\');
        return (plain ? inline.filename(name) : inline.filename(name, StandardCharsets.UTF_8)).build().toString();
    }

    // "Lecture 3.pptx" is served as "Lecture 3.pdf", since that is what the bytes are now
    static String pdfName(String filename) {
        String name = filename == null || filename.isBlank() ? "lecture" : filename.strip();
        int dot = name.lastIndexOf('.');
        return (dot > 0 ? name.substring(0, dot) : name) + ".pdf";
    }

    @DeleteMapping("/materials/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal SignedIn me, @PathVariable Long id) {
        owned.material(me.id(), id);
        ingestService.deleteLecture(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/courses/{courseId}/bank")
    public List<ConceptWithQuestions> bank(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId) {
        owned.course(me.id(), courseId);
        return conceptRepo.findByCourseIdOrderByIdAsc(courseId).stream()
            .map(c -> new ConceptWithQuestions(c.id, c.name, c.summary, c.sourcePages,
                c.material == null ? null : c.material.filename,
                c.material == null ? null : c.material.title,
                questionRepo.findByConceptIdOrderByIdAsc(c.id)))
            .toList();
    }

    public record GenerateRequest(List<Long> conceptIds, int count, String types) {}

    @PostMapping("/courses/{courseId}/bank/generate")
    public List<Question> generate(@AuthenticationPrincipal SignedIn me, @PathVariable Long courseId,
                                   @RequestBody GenerateRequest req) {
        owned.course(me.id(), courseId);
        return ingestService.generateMore(courseId, req.conceptIds(), req.count(), req.types());
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
