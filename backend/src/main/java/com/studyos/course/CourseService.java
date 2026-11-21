package com.studyos.course;

import com.studyos.domain.Course;
import com.studyos.ingest.IngestService;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.ExamRepo;
import com.studyos.repo.QuizProgressRepo;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Renaming, archiving and deleting a whole course. The caller has already checked the course is the account's own. */
@Service
public class CourseService {
    // the course table's name and term are varchar(255)
    static final int FIELD_MAX = 255;

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

    /** A new name and term, trimmed. A blank or overlong one is turned down with a 400 that says why. */
    @Transactional
    public void rename(Course course, String name, String term) {
        String n = name == null ? "" : name.strip();
        String t = term == null ? "" : term.strip();
        if (n.isEmpty() || t.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A course needs a name and a term.");
        }
        if (n.length() > FIELD_MAX || t.length() > FIELD_MAX) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "A course's name and term are " + FIELD_MAX + " characters at most.");
        }
        course.name = n;
        course.term = t;
        courseRepo.save(course);
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
