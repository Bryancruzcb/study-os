package com.studyos.course;

import com.studyos.domain.Course;
import com.studyos.ingest.IngestService;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.ExamRepo;
import com.studyos.repo.QuizProgressRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Archiving and deleting a whole course. The caller has already checked the course is the account's own. */
@Service
public class CourseService {
    private final CourseRepo courseRepo;
    private final ExamRepo examRepo;
    private final QuizProgressRepo quizProgressRepo;
    private final IngestService ingestService;

    public CourseService(CourseRepo courseRepo, ExamRepo examRepo, QuizProgressRepo quizProgressRepo,
                         IngestService ingestService) {
        this.courseRepo = courseRepo;
        this.examRepo = examRepo;
        this.quizProgressRepo = quizProgressRepo;
        this.ingestService = ingestService;
    }

    @Transactional
    public void setArchived(Course course, boolean archived) {
        course.archived = archived;
        courseRepo.save(course);
    }

    /** Removes the course and everything that hangs off it, in foreign-key order: lectures with
     *  their concepts, questions, attempts and review states first, then exams and the saved
     *  quiz, then the course row. */
    @Transactional
    public void delete(Course course) {
        ingestService.dropLecturesOf(course.id);
        examRepo.deleteAll(examRepo.findByCourseIdOrderByDateAscIdAsc(course.id));
        quizProgressRepo.findByCourseId(course.id).ifPresent(quizProgressRepo::delete);
        courseRepo.delete(course);
    }
}
