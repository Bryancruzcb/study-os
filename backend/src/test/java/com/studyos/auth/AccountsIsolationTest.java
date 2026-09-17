package com.studyos.auth;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.studyos.ai.AiClient;
import com.studyos.domain.*;
import com.studyos.repo.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

/**
 * Two accounts against a real database, with the real ownership checks. Every endpoint that takes an
 * id is tried with the other account's ids and has to answer 404 without changing anything, and the
 * lists and the eval report have to leave the other account's rows out. The controller tests mock
 * Owned, so this is where the queries behind it meet the endpoints.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@Tag("jpa")
class AccountsIsolationTest {
    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired CourseRepo courses;
    @Autowired MaterialRepo materials;
    @Autowired ConceptRepo concepts;
    @Autowired QuestionRepo questions;
    @Autowired ReviewStateRepo reviewStates;
    @Autowired AttemptRepo attempts;
    @Autowired ExamRepo exams;
    // nothing here may reach the provider, and a mock proves it
    @MockBean AiClient ai;

    AppUser alice;
    AppUser bob;
    Course aliceCourse;
    Course bobCourse;
    Question aliceQuestion;
    Attempt aliceAttempt;
    Exam aliceExam;
    Material aliceLecture;

    @BeforeEach
    void twoAccountsAndOneCourseFullOfAlicesWork() {
        alice = authService.signup("alice", "alice-password", null);
        bob = authService.signup("bob", "bob-password", null);
        aliceCourse = course(alice, "CS 149");
        bobCourse = course(bob, "CS 158A");

        aliceLecture = new Material();
        aliceLecture.course = aliceCourse;
        aliceLecture.filename = "Lecture 1.pdf";
        aliceLecture.fileHash = "isolation-lecture";
        aliceLecture.status = MaterialStatus.INGESTED;
        materials.save(aliceLecture);
        Concept concept = new Concept();
        concept.course = aliceCourse;
        concept.material = aliceLecture;
        concept.name = "threads";
        concepts.save(concept);
        aliceQuestion = new Question();
        aliceQuestion.concept = concept;
        aliceQuestion.type = QuestionType.MC;
        aliceQuestion.prompt = "What does a thread share with the other threads of its process?";
        aliceQuestion.optionsJson = "[\"the address space\",\"the stack\"]";
        aliceQuestion.correctIndex = 0;
        // labeled and failing a check, so it is listed in alice's report and must not be in bob's
        aliceQuestion.labelAnswerable = true;
        aliceQuestion.labelCorrectAnswer = false;
        aliceQuestion.labelUnambiguous = true;
        questions.save(aliceQuestion);
        reviewStates.save(ReviewState.initial(concept, LocalDate.now()));
        aliceAttempt = new Attempt();
        aliceAttempt.question = aliceQuestion;
        aliceAttempt.verdict = Verdict.INCORRECT;
        aliceAttempt.score = 0.0;
        aliceAttempt.createdAt = Instant.now();
        attempts.save(aliceAttempt);
        aliceExam = new Exam();
        aliceExam.course = aliceCourse;
        aliceExam.name = "Midterm";
        aliceExam.date = LocalDate.now().plusDays(30);
        aliceExam.lectures.add(aliceLecture);
        exams.save(aliceExam);
    }

    @Test
    void everyEndpointAnswers404ToAnotherAccountsIdsAndChangesNothing() throws Exception {
        long c = aliceCourse.id;
        long q = aliceQuestion.id;
        long a = aliceAttempt.id;
        long e = aliceExam.id;
        long m = aliceLecture.id;
        String exam = "{\"name\":\"Final\",\"date\":\"2026-12-10\",\"lectureIds\":[]}";
        List<MockHttpServletRequestBuilder> probes = List.of(
            get("/api/courses/{id}/bank", c),
            multipart("/api/courses/{id}/materials", c).file(new MockMultipartFile(
                "file", "deck.pdf", "application/pdf", "%PDF-1.7".getBytes(StandardCharsets.UTF_8))),
            post("/api/questions/{id}/retire", q),
            post("/api/questions/{id}/restore", q),
            post("/api/questions/{id}/label", q).contentType(APPLICATION_JSON)
                .content("{\"answerable\":false,\"correctAnswer\":false,\"unambiguous\":false}"),
            get("/api/dashboard").param("courseId", String.valueOf(c)),
            get("/api/courses/{id}/lectures", c),
            get("/api/courses/{id}/exams", c),
            post("/api/courses/{id}/exams", c).contentType(APPLICATION_JSON).content(exam),
            put("/api/exams/{id}", e).contentType(APPLICATION_JSON).content(exam),
            delete("/api/exams/{id}", e),
            delete("/api/materials/{id}", m),
            get("/api/study/next").param("courseId", String.valueOf(c)),
            get("/api/courses/{id}/quiz", c),
            get("/api/courses/{id}/quiz/progress", c),
            put("/api/courses/{id}/quiz/progress", c).contentType(APPLICATION_JSON)
                .content("{\"order\":[1],\"answers\":{},\"finished\":false}"),
            delete("/api/courses/{id}/quiz/progress", c),
            get("/api/questions/{id}/review", q),
            post("/api/study/answer").contentType(APPLICATION_JSON).content("{\"questionId\":" + q + ",\"answerIndex\":0}"),
            post("/api/study/attempts/{id}/override", a),
            post("/api/study/attempts/{id}/self-grade", a).contentType(APPLICATION_JSON).content("{\"correct\":true}"));

        for (MockHttpServletRequestBuilder probe : probes) {
            mvc.perform(probe.with(as(bob)).with(csrf()))
                .andExpect(result -> assertEquals(404, result.getResponse().getStatus(),
                    () -> result.getRequest().getMethod() + " " + result.getRequest().getRequestURI()));
        }

        Question untouched = questions.findById(q).orElseThrow();
        assertEquals(QuestionStatus.ACTIVE, untouched.status);
        assertEquals(Boolean.TRUE, untouched.labelAnswerable);
        assertEquals("Midterm", exams.findById(e).orElseThrow().name);
        assertTrue(materials.findByCourseIdAndFileHash(c, "isolation-lecture").isPresent());
        assertEquals(1, attempts.findByQuestionConceptId(aliceQuestion.concept.id).size());
        verifyNoInteractions(ai);
    }

    @Test
    void theListsAndTheReportLeaveTheOtherAccountOut() throws Exception {
        mvc.perform(get("/api/courses/overview").with(as(bob)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].id", contains(bobCourse.id.intValue())));
        mvc.perform(get("/api/courses").with(as(bob)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].id", contains(bobCourse.id.intValue())));
        mvc.perform(get("/api/eval/report").with(as(bob)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.labeled").value(0))
            .andExpect(jsonPath("$.needsReview", hasSize(0)));

        mvc.perform(get("/api/eval/report").with(as(alice)))
            .andExpect(jsonPath("$.labeled").value(1))
            .andExpect(jsonPath("$.needsReview[0].questionId").value(aliceQuestion.id.intValue()));
    }

    @Test
    void theOwnerStillReachesEverything() throws Exception {
        mvc.perform(get("/api/courses/{id}/bank", aliceCourse.id).with(as(alice)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].questions[0].id").value(aliceQuestion.id.intValue()));
        mvc.perform(get("/api/dashboard").param("courseId", String.valueOf(aliceCourse.id)).with(as(alice)))
            .andExpect(status().isOk());
        mvc.perform(get("/api/courses/{id}/exams", aliceCourse.id).with(as(alice)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(aliceExam.id.intValue()));
        mvc.perform(get("/api/study/next").param("courseId", String.valueOf(aliceCourse.id)).with(as(alice)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(aliceQuestion.id.intValue()));
        mvc.perform(get("/api/courses/{id}/quiz", aliceCourse.id).with(as(alice)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(aliceQuestion.id.intValue()));
        mvc.perform(get("/api/courses/{id}/quiz/progress", aliceCourse.id).with(as(alice)))
            .andExpect(status().isNoContent());
        mvc.perform(put("/api/courses/{id}/quiz/progress", aliceCourse.id).with(as(alice)).with(csrf())
                .contentType(APPLICATION_JSON)
                .content("{\"order\":[" + aliceQuestion.id + "],\"answers\":{},\"finished\":false}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.order[0]").value(aliceQuestion.id.intValue()));
        mvc.perform(get("/api/courses/{id}/quiz/progress", aliceCourse.id).with(as(alice)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.order[0]").value(aliceQuestion.id.intValue()));
        mvc.perform(get("/api/questions/{id}/review", aliceQuestion.id).with(as(alice)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(aliceQuestion.id.intValue()));
    }

    private Course course(AppUser owner, String name) {
        Course course = new Course();
        course.name = name;
        course.term = "Fall 2026";
        course.owner = owner;
        return courses.save(course);
    }

    private static RequestPostProcessor as(AppUser user) {
        return authentication(UsernamePasswordAuthenticationToken.authenticated(
            new SignedIn(user.id, user.username), null, List.of()));
    }
}
