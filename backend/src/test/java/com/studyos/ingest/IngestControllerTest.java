package com.studyos.ingest;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.studyos.domain.*;
import com.studyos.repo.*;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(IngestController.class)
class IngestControllerTest {
    @Autowired MockMvc mvc;
    @MockBean IngestService ingestService;
    @MockBean CourseRepo courseRepo;
    @MockBean ConceptRepo conceptRepo;
    @MockBean QuestionRepo questionRepo;

    @Test
    void uploadDelegatesToService() throws Exception {
        Course course = new Course();
        course.id = 1L;
        course.name = "Networks";
        Material m = new Material();
        m.status = MaterialStatus.INGESTED;
        m.course = course;
        when(ingestService.ingest(eq(1L), eq("w1.pdf"), any())).thenReturn(m);
        mvc.perform(multipart("/api/courses/1/materials")
                .file(new MockMultipartFile("file", "w1.pdf", "application/pdf", new byte[] {1})))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("INGESTED"))
            .andExpect(jsonPath("$.course").doesNotExist());
    }

    @Test
    void bankReturnsConceptsWithQuestions() throws Exception {
        // Back-references wired the way JPA loads them, so serialization would
        // recurse Question -> Concept -> Course/Material without @JsonIgnore.
        Course course = new Course();
        course.id = 1L;
        course.name = "Networks";
        Material material = new Material();
        material.course = course;
        Concept c = new Concept();
        c.id = 5L;
        c.name = "TCP";
        c.course = course;
        c.material = material;
        Question q = new Question();
        q.id = 9L;
        q.type = QuestionType.MC;
        q.concept = c;
        when(conceptRepo.findByCourseIdOrderByIdAsc(1L)).thenReturn(List.of(c));
        when(questionRepo.findByConceptIdOrderByIdAsc(5L)).thenReturn(List.of(q));
        mvc.perform(get("/api/courses/1/bank"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].name").value("TCP"))
            .andExpect(jsonPath("$[0].questions[0].id").value(9))
            .andExpect(jsonPath("$[0].questions[0].concept").doesNotExist());
    }

    @Test
    void retireSetsStatus() throws Exception {
        Question q = new Question();
        when(questionRepo.findById(9L)).thenReturn(Optional.of(q));
        mvc.perform(post("/api/questions/9/retire")).andExpect(status().isOk());
        verify(questionRepo).save(argThat(saved -> saved.status == QuestionStatus.RETIRED));
    }
}
