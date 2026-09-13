package com.studyos.auth;

import com.studyos.domain.Attempt;
import com.studyos.domain.Course;
import com.studyos.domain.Exam;
import com.studyos.domain.Question;
import com.studyos.repo.AttemptRepo;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.ExamRepo;
import com.studyos.repo.QuestionRepo;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * The one place that decides whether a row belongs to the signed-in account. Every controller calls it
 * first, before acting on an id it was sent. Someone else's row answers exactly like a row that does not
 * exist, with a 404, so trying ids reveals nothing about other accounts.
 */
@Component
public class Owned {
    private final CourseRepo courses;
    private final QuestionRepo questions;
    private final AttemptRepo attempts;
    private final ExamRepo exams;

    public Owned(CourseRepo courses, QuestionRepo questions, AttemptRepo attempts, ExamRepo exams) {
        this.courses = courses;
        this.questions = questions;
        this.attempts = attempts;
        this.exams = exams;
    }

    public Course course(Long ownerId, Long courseId) {
        return found(courses.findByIdAndOwnerId(courseId, ownerId));
    }

    public Question question(Long ownerId, Long questionId) {
        return found(questions.findByIdAndConceptCourseOwnerId(questionId, ownerId));
    }

    public Attempt attempt(Long ownerId, Long attemptId) {
        return found(attempts.findByIdAndQuestionConceptCourseOwnerId(attemptId, ownerId));
    }

    public Exam exam(Long ownerId, Long examId) {
        return found(exams.findByIdAndCourseOwnerId(examId, ownerId));
    }

    private static <T> T found(Optional<T> row) {
        return row.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
