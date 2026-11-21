package com.studyos.course;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.studyos.domain.Course;
import com.studyos.domain.Exam;
import com.studyos.domain.QuizProgress;
import com.studyos.ingest.IngestService;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.ExamRepo;
import com.studyos.repo.QuizProgressRepo;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class CourseServiceTest {
    CourseRepo courseRepo = mock(CourseRepo.class);
    ExamRepo examRepo = mock(ExamRepo.class);
    QuizProgressRepo quizProgressRepo = mock(QuizProgressRepo.class);
    IngestService ingestService = mock(IngestService.class);
    CourseService service = new CourseService(courseRepo, examRepo, quizProgressRepo, ingestService);

    private static Course course() {
        Course c = new Course();
        c.id = 2L;
        c.name = "CS 149";
        return c;
    }

    @Test
    void archiveAndRestoreFlipTheFlagAndSave() {
        Course c = course();
        service.setArchived(c, true);
        assertTrue(c.archived);
        service.setArchived(c, false);
        assertFalse(c.archived);
        verify(courseRepo, org.mockito.Mockito.times(2)).save(c);
    }

    @Test
    void renameTrimsTheNameAndTermAndSaves() {
        Course c = course();
        service.rename(c, "  Operating Systems ", " Spring 2027 ");
        assertEquals("Operating Systems", c.name);
        assertEquals("Spring 2027", c.term);
        verify(courseRepo).save(c);
    }

    @Test
    void aBlankNameOrTermIsTurnedDownAndNothingChanges() {
        for (String[] bad : new String[][] {{"  ", "Fall 2026"}, {"CS 149", ""}, {null, "Fall 2026"}, {"CS 149", null}}) {
            Course c = course();
            ResponseStatusException err = assertThrows(ResponseStatusException.class,
                () -> service.rename(c, bad[0], bad[1]));
            assertEquals(HttpStatus.BAD_REQUEST, err.getStatusCode());
            assertEquals("A course needs a name and a term.", err.getReason());
            assertEquals("CS 149", c.name);
        }
        verify(courseRepo, never()).save(any());
    }

    @Test
    void aNameOrTermLongerThanTheColumnIsTurnedDown() {
        String tooLong = "x".repeat(CourseService.FIELD_MAX + 1);
        for (String[] bad : new String[][] {{tooLong, "Fall 2026"}, {"CS 149", tooLong}}) {
            Course c = course();
            ResponseStatusException err = assertThrows(ResponseStatusException.class,
                () -> service.rename(c, bad[0], bad[1]));
            assertEquals(HttpStatus.BAD_REQUEST, err.getStatusCode());
            assertEquals("CS 149", c.name);
        }
        // exactly at the limit is fine
        Course c = course();
        service.rename(c, "x".repeat(CourseService.FIELD_MAX), "Fall 2026");
        assertEquals(CourseService.FIELD_MAX, c.name.length());
        verify(courseRepo).save(c);
    }

    @Test
    void deleteDropsTheLecturesThenTheExamsAndTheQuizThenTheCourse() {
        Course c = course();
        Exam midterm = new Exam();
        QuizProgress run = new QuizProgress();
        when(examRepo.findByCourseIdOrderByDateAscIdAsc(2L)).thenReturn(List.of(midterm));
        when(quizProgressRepo.findByCourseId(2L)).thenReturn(Optional.of(run));

        service.delete(c);

        InOrder order = inOrder(ingestService, examRepo, quizProgressRepo, courseRepo);
        order.verify(ingestService).dropLecturesOf(2L);
        order.verify(examRepo).deleteAll(List.of(midterm));
        order.verify(quizProgressRepo).delete(run);
        order.verify(courseRepo).delete(c);
    }
}
