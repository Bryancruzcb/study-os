package com.studyos.repo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.studyos.domain.Attempt;
import com.studyos.domain.Concept;
import com.studyos.domain.Course;
import com.studyos.domain.Material;
import com.studyos.domain.Question;
import com.studyos.domain.QuestionStatus;
import com.studyos.domain.QuestionType;
import com.studyos.domain.ReviewState;
import com.studyos.domain.Verdict;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import com.studyos.domain.Exam;
import com.studyos.domain.MaterialStatus;

/**
 * The one suite that talks to a real Postgres. Everything else in this project is
 * hermetic on purpose, so this class is tagged `jpa` and surefire excludes it by
 * default; CI runs it in a separate job against a Postgres service container.
 *
 * <p>It exists because the final branch review found that two of the six merge blockers
 * it raised — Attempt.createdAt being non-null, and the ORDER BY on the concept and
 * question lookups — cannot be proven by a mocked repository. The ordering is what the
 * latest-attempt override guard trusts, so it is worth a database to check.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Tag("jpa")
class PersistenceTest {

    @Autowired CourseRepo courses;
    @Autowired MaterialRepo materials;
    @Autowired ConceptRepo concepts;
    @Autowired QuestionRepo questions;
    @Autowired AttemptRepo attempts;
    @Autowired ReviewStateRepo reviewStates;
    @Autowired ExamRepo exams;

    private Course course(String name) {
        Course c = new Course();
        c.name = name;
        c.term = "Fall 2026";
        return courses.save(c);
    }

    private Material material(Course c, String hash) {
        Material m = new Material();
        m.course = c;
        m.filename = hash + ".pdf";
        m.fileHash = hash;
        m.pageCount = 12;
        return materials.save(m);
    }

    private Concept concept(Course c, Material m, String name) {
        Concept x = new Concept();
        x.course = c;
        x.material = m;
        x.name = name;
        x.summary = "summary of " + name;
        x.sourcePages = "3,4";
        return concepts.save(x);
    }

    private Question question(Concept c, QuestionType type, QuestionStatus status) {
        Question q = new Question();
        q.concept = c;
        q.type = type;
        q.prompt = "prompt for " + c.name;
        q.sourcePages = "3";
        q.status = status;
        if (type == QuestionType.MC) {
            q.optionsJson = "[\"a\",\"b\"]";
            q.correctIndex = 0;
        } else {
            q.modelAnswer = "the model answer";
            q.rubric = "the rubric";
        }
        return questions.save(q);
    }

    private Attempt attempt(Question q, Verdict verdict, Verdict graderVerdict, Instant at) {
        Attempt a = new Attempt();
        a.question = q;
        a.givenAnswer = "an answer";
        a.verdict = verdict;
        a.graderVerdict = graderVerdict;
        a.score = verdict == Verdict.CORRECT ? 1.0 : 0.0;
        a.createdAt = at;
        return attempts.save(a);
    }

    // --- the whole graph round-trips ------------------------------------------------

    @Test
    void theEntityGraphPersistsAndReadsBack() {
        Course c = course("CS 47");
        Material m = material(c, "hash-graph");
        Concept concept = concept(c, m, "pipelining");
        Question q = question(concept, QuestionType.SHORT_ANSWER, QuestionStatus.ACTIVE);
        Attempt a = attempt(q, Verdict.CORRECT, Verdict.CORRECT, Instant.now());
        ReviewState rs = reviewStates.save(ReviewState.initial(concept, LocalDate.of(2026, 9, 3)));

        assertThat(attempts.findById(a.id)).get().satisfies(found -> {
            assertThat(found.question.id).isEqualTo(q.id);
            assertThat(found.question.concept.id).isEqualTo(concept.id);
            assertThat(found.question.concept.course.id).isEqualTo(c.id);
            assertThat(found.question.concept.material.id).isEqualTo(m.id);
        });
        assertThat(reviewStates.findById(rs.id)).get().satisfies(found ->
                assertThat(found.concept.id).isEqualTo(concept.id));
    }

    // --- the constraints the review could not prove ----------------------------------

    @Test
    void anAttemptWithoutACreatedAtIsRejectedByTheDatabase() {
        Course c = course("CS 146");
        Material m = material(c, "hash-notnull");
        Question q = question(concept(c, m, "heaps"), QuestionType.SHORT_ANSWER, QuestionStatus.ACTIVE);

        Attempt a = new Attempt();
        a.question = q;
        a.givenAnswer = "an answer";
        a.verdict = Verdict.CORRECT;
        a.createdAt = null;

        assertThatThrownBy(() -> attempts.saveAndFlush(a))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void twoMaterialsCannotShareAFileHash() {
        Course c = course("CS 151");
        material(c, "hash-duplicate");

        Material second = new Material();
        second.course = c;
        second.filename = "other.pdf";
        second.fileHash = "hash-duplicate";

        assertThatThrownBy(() -> materials.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // --- the ordering the bank and the override guard depend on ----------------------

    @Test
    void theQuestionBankKeepsItsOrderAfterAQuestionIsRetired() {
        Course c = course("CS 47");
        Material m = material(c, "hash-order-q");
        Concept concept = concept(c, m, "caches");
        Question first = question(concept, QuestionType.MC, QuestionStatus.ACTIVE);
        Question second = question(concept, QuestionType.SHORT_ANSWER, QuestionStatus.ACTIVE);
        Question third = question(concept, QuestionType.MC, QuestionStatus.ACTIVE);

        assertThat(questions.findByConceptIdOrderByIdAsc(concept.id))
                .extracting(q -> q.id)
                .containsExactly(first.id, second.id, third.id);

        second.status = QuestionStatus.RETIRED;
        questions.saveAndFlush(second);

        // retiring rewrites the row, which is exactly what moves it without an ORDER BY
        assertThat(questions.findByConceptIdOrderByIdAsc(concept.id))
                .extracting(q -> q.id)
                .containsExactly(first.id, second.id, third.id);
        assertThat(questions.findByConceptIdAndStatus(concept.id, QuestionStatus.ACTIVE))
                .extracting(q -> q.id)
                .containsExactlyInAnyOrder(first.id, third.id);
    }

    @Test
    void conceptsComeBackInAStableOrderForACourseAndAreFindableByMaterial() {
        Course c = course("CS 146");
        Material m = material(c, "hash-order-c");
        Concept a = concept(c, m, "sorting");
        Concept b = concept(c, m, "graphs");

        assertThat(concepts.findByCourseIdOrderByIdAsc(c.id))
                .extracting(x -> x.id)
                .containsExactly(a.id, b.id);
        assertThat(concepts.findByMaterialId(m.id))
                .extracting(x -> x.id)
                .containsExactlyInAnyOrder(a.id, b.id);
    }

    @Test
    void theLatestAttemptIsTheNewestByCreatedAtNotTheLastInserted() {
        Course c = course("CS 151");
        Material m = material(c, "hash-latest");
        Concept concept = concept(c, m, "delegation");
        Question q = question(concept, QuestionType.SHORT_ANSWER, QuestionStatus.ACTIVE);

        Instant now = Instant.now();
        Attempt newest = attempt(q, Verdict.CORRECT, Verdict.CORRECT, now);
        // inserted last, but older: a guard that trusted insertion order would pick this
        attempt(q, Verdict.INCORRECT, Verdict.INCORRECT, now.minus(1, ChronoUnit.HOURS));

        assertThat(attempts.findTopByQuestionIdOrderByCreatedAtDesc(q.id))
                .get().extracting(a -> a.id).isEqualTo(newest.id);
        assertThat(attempts.findTopByQuestionConceptIdOrderByCreatedAtDesc(concept.id))
                .get().extracting(a -> a.id).isEqualTo(newest.id);
    }

    // --- the remaining derived queries ----------------------------------------------

    @Test
    void attemptsAreReachableByConceptAndFilterableToGraderJudgements() {
        Course c = course("CS 47");
        Material m = material(c, "hash-grader");
        Concept concept = concept(c, m, "assembly");
        Question mc = question(concept, QuestionType.MC, QuestionStatus.ACTIVE);
        Question sa = question(concept, QuestionType.SHORT_ANSWER, QuestionStatus.ACTIVE);

        Instant now = Instant.now();
        Attempt machineGraded = attempt(sa, Verdict.CORRECT, Verdict.CORRECT, now);
        Attempt graderFailed = attempt(sa, Verdict.PENDING, Verdict.PENDING, now.minus(2, ChronoUnit.MINUTES));
        Attempt multipleChoice = attempt(mc, Verdict.CORRECT, null, now.minus(5, ChronoUnit.MINUTES));

        assertThat(attempts.findByQuestionConceptId(concept.id))
                .extracting(a -> a.id)
                .containsExactlyInAnyOrder(machineGraded.id, graderFailed.id, multipleChoice.id);

        // multiple choice is never grader-judged, so it must not reach the eval denominator
        assertThat(attempts.findByGraderVerdictIsNotNull())
                .extracting(a -> a.id)
                .contains(machineGraded.id, graderFailed.id)
                .doesNotContain(multipleChoice.id);
    }

    @Test
    void materialsAreFoundByHashAndDueConceptsComeBackOldestFirst() {
        Course c = course("CS 146");
        Material m = material(c, "hash-lookup");
        assertThat(materials.findByFileHash("hash-lookup")).get().extracting(x -> x.id).isEqualTo(m.id);
        assertThat(materials.findByFileHash("hash-that-does-not-exist")).isEmpty();

        Concept overdue = concept(c, m, "recursion");
        Concept dueToday = concept(c, m, "hashing");
        Concept notYetDue = concept(c, m, "tries");
        LocalDate today = LocalDate.of(2026, 9, 3);

        ReviewState a = reviewStates.save(ReviewState.initial(overdue, today.minusDays(2)));
        ReviewState b = reviewStates.save(ReviewState.initial(dueToday, today));
        reviewStates.save(ReviewState.initial(notYetDue, today.plusDays(1)));

        assertThat(reviewStates.findByConceptId(overdue.id)).get().extracting(x -> x.id).isEqualTo(a.id);

        List<ReviewState> due =
                reviewStates.findByConceptCourseIdAndDueDateLessThanEqualOrderByDueDateAsc(c.id, today);
        assertThat(due).extracting(x -> x.id).containsExactly(a.id, b.id);
    }

    // --- the counts behind the course overview ---------------------------------------

    @Test
    void theOverviewCountsSeeOnlyTheirCourseOnlyActiveQuestionsAndOnlyAskableDueConcepts() {
        Course mine = course("CS 149");
        Course other = course("CS 158A");
        Material m = material(mine, "hash-overview");
        Material om = material(other, "hash-overview-other");
        Concept a = concept(mine, m, "kernel mode");
        Concept b = concept(mine, m, "process control block");
        Concept c = concept(mine, m, "context switch");
        Concept d = concept(mine, m, "system calls");
        Concept elsewhere = concept(other, om, "tcp handshake");
        question(a, QuestionType.MC, QuestionStatus.ACTIVE);
        question(a, QuestionType.SHORT_ANSWER, QuestionStatus.RETIRED);
        question(b, QuestionType.MC, QuestionStatus.ACTIVE);
        question(c, QuestionType.MC, QuestionStatus.ACTIVE);
        // its only question retired: due, but the queue has nothing to ask about it
        question(d, QuestionType.MC, QuestionStatus.RETIRED);
        question(elsewhere, QuestionType.MC, QuestionStatus.ACTIVE);
        LocalDate today = LocalDate.of(2026, 9, 4);
        reviewStates.save(ReviewState.initial(a, today.minusDays(1)));
        reviewStates.save(ReviewState.initial(b, today.plusDays(3)));
        // due today, not yesterday: the boundary the <= in the count has to include
        reviewStates.save(ReviewState.initial(c, today));
        reviewStates.save(ReviewState.initial(d, today));
        reviewStates.save(ReviewState.initial(elsewhere, today));

        // four of the five concepts, three of the five ACTIVE questions, and of this course's
        // four states the overdue one and the one due today with a question left: not the one
        // due in three days, and not the one whose only question is retired
        assertThat(concepts.countByCourseId(mine.id)).isEqualTo(4);
        assertThat(questions.countByConceptCourseIdAndStatus(mine.id, QuestionStatus.ACTIVE)).isEqualTo(3);
        assertThat(reviewStates.countDueByConceptCourseIdWithQuestionStatus(mine.id, today, QuestionStatus.ACTIVE))
            .isEqualTo(2);
    }

    // --- the quiz ---------------------------------------------------------------------

    @Test
    void theQuizReadsOneCoursesActiveQuestionsInLectureOrderWithTheirLectures() {
        Course c = course("CS 149");
        Course other = course("CS 158A");
        Material first = material(c, "hash-quiz-first");
        Material second = material(c, "hash-quiz-second");
        // the later lecture's concept is saved first, so only the ORDER BY puts the first lecture ahead
        Concept paging = concept(c, second, "paging");
        Concept processes = concept(c, first, "processes");
        Question pagingQuestion = question(paging, QuestionType.MC, QuestionStatus.ACTIVE);
        Question processQuestion = question(processes, QuestionType.SHORT_ANSWER, QuestionStatus.ACTIVE);
        question(processes, QuestionType.MC, QuestionStatus.RETIRED);
        question(concept(other, material(other, "hash-quiz-other"), "tcp"), QuestionType.MC, QuestionStatus.ACTIVE);

        List<Question> quiz = questions.findForQuiz(c.id, QuestionStatus.ACTIVE);

        assertThat(quiz).extracting(q -> q.id).containsExactly(processQuestion.id, pagingQuestion.id);
        assertThat(quiz).extracting(q -> q.concept.material.id).containsExactly(first.id, second.id);
    }

    @Test
    void explanationsFitTheirColumnsAtFullLength() {
        Course c = course("CS 149");
        Question q = question(concept(c, material(c, "hash-explained"), "paging"), QuestionType.MC, QuestionStatus.ACTIVE);
        q.explanation = "e".repeat(4000);
        q.optionExplanationsJson = "[\"" + "o".repeat(7996) + "\"]";
        q.diagram = "d".repeat(4000);

        questions.saveAndFlush(q);

        assertThat(questions.findById(q.id)).get().satisfies(found -> {
            assertThat(found.explanation).hasSize(4000);
            assertThat(found.optionExplanationsJson).hasSize(8000);
            assertThat(found.diagram).hasSize(4000);
        });
    }

    // the exam plan's own queries: the exams ahead of a lecture, nearest first, and the concepts it counts
    @Test
    void examPlanQueriesFindTheExamsAheadOfALectureAndTheConceptsAPlanPaces() {
        Course c = course("Operating Systems");
        Material lecture = material(c, "exam-plan-lecture");
        lecture.status = MaterialStatus.INGESTED;
        materials.save(lecture);
        material(c, "exam-plan-still-pending");
        Concept graded = concept(c, lecture, "graded");
        Concept pendingOnly = concept(c, lecture, "pending only");
        Question gradedQuestion = question(graded, QuestionType.MC, QuestionStatus.ACTIVE);
        Question pendingQuestion = question(pendingOnly, QuestionType.SHORT_ANSWER, QuestionStatus.RETIRED);
        attempts.save(examPlanAttempt(gradedQuestion, Verdict.INCORRECT));
        attempts.save(examPlanAttempt(pendingQuestion, Verdict.PENDING));
        exams.save(examOn(c, "Quiz", LocalDate.of(2026, 8, 20), lecture));
        exams.save(examOn(c, "Final", LocalDate.of(2026, 12, 10), lecture));
        exams.save(examOn(c, "Midterm", LocalDate.of(2026, 9, 26), lecture));

        assertThat(exams.findUpcomingByLectureId(lecture.id, LocalDate.of(2026, 9, 1)))
            .extracting(e -> e.name).containsExactly("Midterm", "Final");
        assertThat(exams.findByCourseIdOrderByDateAscIdAsc(c.id))
            .extracting(e -> e.name).containsExactly("Quiz", "Midterm", "Final");
        // a PENDING attempt was never graded, so its concept is not started
        assertThat(attempts.findGradedConceptIdsByCourseId(c.id, Verdict.PENDING)).containsExactly(graded.id);
        assertThat(questions.findConceptIdsByCourseIdAndStatus(c.id, QuestionStatus.ACTIVE)).containsExactly(graded.id);
        assertThat(materials.findByCourseIdAndStatusOrderByIdAsc(c.id, MaterialStatus.INGESTED))
            .extracting(m -> m.fileHash).containsExactly("exam-plan-lecture");
        assertThat(reviewStates.findByConceptCourseIdOrderByConceptIdAsc(c.id)).isEmpty();
    }

    private static Attempt examPlanAttempt(Question q, Verdict verdict) {
        Attempt a = new Attempt();
        a.question = q;
        a.verdict = verdict;
        a.createdAt = Instant.parse("2026-09-01T12:00:00Z");
        return a;
    }

    private static Exam examOn(Course c, String name, LocalDate date, Material... lectures) {
        Exam e = new Exam();
        e.course = c;
        e.name = name;
        e.date = date;
        e.lectures.addAll(List.of(lectures));
        return e;
    }
}
