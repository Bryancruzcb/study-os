package com.studyos.course;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.studyos.domain.Course;
import com.studyos.domain.QuestionStatus;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.QuestionRepo;
import com.studyos.repo.ReviewStateRepo;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.data.domain.Sort;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CourseController.class)
class CourseControllerTest {
    @TestConfiguration
    static class FixedClock {
        @Bean Clock clock() { return Clock.fixed(Instant.parse("2026-09-01T12:00:00Z"), ZoneOffset.UTC); }
    }

    @Autowired MockMvc mvc;
    @MockBean CourseRepo courseRepo;
    @MockBean ConceptRepo conceptRepo;
    @MockBean QuestionRepo questionRepo;
    @MockBean ReviewStateRepo reviewStateRepo;

    private static Course course(long id, String name, String term) {
        Course c = new Course();
        c.id = id;
        c.name = name;
        c.term = term;
        return c;
    }

    @Test
    void reportsEveryCourseWithItsCountsInIdOrder() throws Exception {
        when(courseRepo.findAll(Sort.by("id"))).thenReturn(List.of(
            course(1L, "CS 47", "Spring 2026"), course(2L, "CS 149", "Fall 2026")));
        when(conceptRepo.countByCourseId(1L)).thenReturn(18L);
        when(conceptRepo.countByCourseId(2L)).thenReturn(248L);
        when(questionRepo.countByConceptCourseIdAndStatus(1L, QuestionStatus.ACTIVE)).thenReturn(55L);
        when(questionRepo.countByConceptCourseIdAndStatus(2L, QuestionStatus.ACTIVE)).thenReturn(844L);
        when(reviewStateRepo.countByConceptCourseIdAndDueDateLessThanEqual(1L, LocalDate.of(2026, 9, 1)))
            .thenReturn(11L);
        when(reviewStateRepo.countByConceptCourseIdAndDueDateLessThanEqual(2L, LocalDate.of(2026, 9, 1)))
            .thenReturn(16L);

        mvc.perform(get("/api/courses/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[0].name").value("CS 47"))
            .andExpect(jsonPath("$[0].term").value("Spring 2026"))
            .andExpect(jsonPath("$[0].concepts").value(18))
            .andExpect(jsonPath("$[0].questions").value(55))
            .andExpect(jsonPath("$[0].dueToday").value(11))
            .andExpect(jsonPath("$[1].id").value(2))
            .andExpect(jsonPath("$[1].concepts").value(248))
            .andExpect(jsonPath("$[1].questions").value(844))
            .andExpect(jsonPath("$[1].dueToday").value(16));
    }

    @Test
    void countsOnlyActiveQuestionsAndTakesTodayFromTheClock() throws Exception {
        when(courseRepo.findAll(Sort.by("id"))).thenReturn(List.of(course(3L, "CS 158A", "Fall 2026")));

        mvc.perform(get("/api/courses/overview")).andExpect(status().isOk());

        verify(questionRepo).countByConceptCourseIdAndStatus(3L, QuestionStatus.ACTIVE);
        verify(reviewStateRepo).countByConceptCourseIdAndDueDateLessThanEqual(3L, LocalDate.of(2026, 9, 1));
    }

    @Test
    void aCourseWithNothingInItReportsZeros() throws Exception {
        when(courseRepo.findAll(Sort.by("id"))).thenReturn(List.of(course(4L, "CS 46B", "Spring 2027")));

        mvc.perform(get("/api/courses/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].concepts").value(0))
            .andExpect(jsonPath("$[0].questions").value(0))
            .andExpect(jsonPath("$[0].dueToday").value(0));
    }

    @Test
    void noCoursesIsAnEmptyList() throws Exception {
        when(courseRepo.findAll(Sort.by("id"))).thenReturn(List.of());

        mvc.perform(get("/api/courses/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
    }
}
