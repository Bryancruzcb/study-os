package com.studyos.course;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
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
