package com.studyos.exam;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.studyos.config.AppStudyProps;
import com.studyos.domain.*;
import com.studyos.repo.*;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ExamPlannerTest {
    static final LocalDate TODAY = LocalDate.of(2026, 9, 1);

    CourseRepo courseRepo = mock(CourseRepo.class);
    ExamRepo examRepo = mock(ExamRepo.class);
    MaterialRepo materialRepo = mock(MaterialRepo.class);
    ConceptRepo conceptRepo = mock(ConceptRepo.class);
    QuestionRepo questionRepo = mock(QuestionRepo.class);
    AttemptRepo attemptRepo = mock(AttemptRepo.class);
    ReviewStateRepo reviewStateRepo = mock(ReviewStateRepo.class);
    Clock clock = Clock.fixed(Instant.parse("2026-09-01T12:00:00Z"), ZoneOffset.UTC);
    ExamPlanner planner = new ExamPlanner(courseRepo, examRepo, materialRepo, conceptRepo, questionRepo,
        attemptRepo, reviewStateRepo, clock, new AppStudyProps(8, 0.2));

    Course course = new Course();
    Material lecture1 = lecture(11L);
    Material lecture2 = lecture(12L);
    List<Exam> exams = new ArrayList<>();
    List<ReviewState> states = new ArrayList<>();
    List<Long> started = new ArrayList<>();
    List<Long> askable = new ArrayList<>();

    @BeforeEach
    void setUp() {
        course.id = 1L;
        when(courseRepo.findById(1L)).thenReturn(Optional.of(course));
        when(examRepo.findByCourseIdOrderByDateAscIdAsc(1L)).thenAnswer(inv -> List.copyOf(exams));
        when(reviewStateRepo.findByConceptCourseIdOrderByConceptIdAsc(1L)).thenAnswer(inv -> List.copyOf(states));
        when(attemptRepo.findGradedConceptIdsByCourseId(1L, Verdict.PENDING)).thenAnswer(inv -> List.copyOf(started));
        when(questionRepo.findConceptIdsByCourseIdAndStatus(1L, QuestionStatus.ACTIVE))
            .thenAnswer(inv -> List.copyOf(askable));
        when(materialRepo.findByCourseIdAndStatusOrderByIdAsc(1L, MaterialStatus.INGESTED))
            .thenReturn(List.of(lecture1, lecture2));
        when(examRepo.save(any())).thenAnswer(inv -> {
            Exam exam = inv.getArgument(0);
            if (exam.id == null) {
                exam.id = 90L + exams.size();
                exams.add(exam);
            }
            return exam;
        });
    }

    private Material lecture(long id) {
        Material m = new Material();
        m.id = id;
        m.course = course;
        m.filename = "Lecture " + id + ".pdf";
        m.status = MaterialStatus.INGESTED;
        return m;
    }

    /* n topics from a lecture, each with a question to ask and a review due on `due`, not started */
    private List<ReviewState> topics(Material lecture, int n, LocalDate due) {
        List<ReviewState> made = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Concept concept = new Concept();
            concept.id = 100L + states.size();
            concept.course = course;
            concept.material = lecture;
            ReviewState rs = ReviewState.initial(concept, due);
            states.add(rs);
            askable.add(concept.id);
            made.add(rs);
        }
        return made;
    }

    private ReviewState startedTopic(Material lecture, int streak, LocalDate due) {
        ReviewState rs = topics(lecture, 1, due).get(0);
        rs.streak = streak;
        started.add(rs.concept.id);
        return rs;
    }

    private Exam exam(String name, LocalDate date, Material... lectures) {
        Exam exam = new Exam();
        exam.id = 50L + exams.size();
        exam.course = course;
        exam.name = name;
        exam.date = date;
        exam.lectures.addAll(List.of(lectures));
        exams.add(exam);
        return exam;
    }

    private static List<LocalDate> dueDates(List<ReviewState> states) {
        return states.stream().map(rs -> rs.dueDate).toList();
    }

    private static LocalDate sep(int day) {
        return LocalDate.of(2026, 9, day);
    }

    @Test
    void theReviewStretchIsAShareOfTheDaysLeftAndNeverTakesTheLastDayToStartOn() {
        assertEquals(new ExamPlanner.Window(14, 3), planner.window(sep(15), TODAY));
        assertEquals(new ExamPlanner.Window(5, 1), planner.window(sep(6), TODAY));
        assertEquals(new ExamPlanner.Window(2, 0), planner.window(sep(3), TODAY));
        assertEquals(new ExamPlanner.Window(1, 0), planner.window(sep(2), TODAY));
    }

    @Test
    void topicsNotStartedAreSpreadEvenlyOverTheDaysBeforeTheReviewStretch() {
        List<ReviewState> fresh = topics(lecture1, 10, sep(20));
        // six days left and one of them kept for review: ten topics over five days
        exam("Midterm", sep(7), lecture1);
        planner.replan(1L);
        assertEquals(List.of(sep(1), sep(1), sep(2), sep(2), sep(3), sep(3), sep(4), sep(4), sep(5), sep(5)),
            dueDates(fresh));
    }

    @Test
    void theCloserTheExamTheMoreOfItsTopicsADayHolds() {
        List<ReviewState> fresh = topics(lecture1, 10, sep(20));
        Exam midterm = exam("Midterm", sep(29), lecture1);
        planner.replan(1L);
        long farOff = fresh.stream().filter(rs -> rs.dueDate.equals(TODAY)).count();
        midterm.date = sep(3);
        planner.replan(1L);
        long closeBy = fresh.stream().filter(rs -> rs.dueDate.equals(TODAY)).count();
        assertEquals(1, farOff);
        assertEquals(5, closeBy);
    }

    @Test
    void aSkippedDayIsSpreadOverTheDaysThatAreLeft() {
        List<ReviewState> fresh = topics(lecture1, 6, LocalDate.of(2026, 8, 31));
        exam("Midterm", sep(7), lecture1);
        // yesterday's plan was never studied: its topics are overdue and not started
        course.plannedOn = LocalDate.of(2026, 8, 31);
        planner.ensureToday(1L);
        assertEquals(List.of(sep(1), sep(1), sep(2), sep(3), sep(4), sep(5)), dueDates(fresh));
    }

    @Test
    void aStartedTopicsReviewNeverLandsAfterItsExam() {
        ReviewState late = startedTopic(lecture1, 3, sep(30));
        ReviewState early = startedTopic(lecture1, 1, sep(5));
        exam("Midterm", sep(10), lecture1);
        planner.replan(1L);
        assertEquals(sep(9), late.dueDate);
        assertEquals(sep(5), early.dueDate);
    }

    @Test
    void anExamTomorrowSendsAStartedTopicBackOnTheExamDayRatherThanStraightBackToday() {
        ReviewState rs = startedTopic(lecture1, 2, sep(20));
        exam("Quiz", sep(2), lecture1);
        planner.replan(1L);
        assertEquals(sep(2), rs.dueDate);
    }

    @Test
    void topicsNoExamAheadCoversKeepTheirDates() {
        List<ReviewState> uncovered = topics(lecture2, 3, sep(20));
        List<ReviewState> pastExamTopics = topics(lecture1, 2, sep(21));
        exam("Quiz", LocalDate.of(2026, 8, 28), lecture1);
        exam("Midterm", sep(10));
        planner.replan(1L);
        assertEquals(List.of(sep(20), sep(20), sep(20)), dueDates(uncovered));
        assertEquals(List.of(sep(21), sep(21)), dueDates(pastExamTopics));
    }

    @Test
    void aLectureOnTwoExamsIsPacedToTheNearestOne() {
        List<ReviewState> fresh = topics(lecture1, 3, sep(28));
        exam("Midterm", sep(5), lecture1);
        exam("Final", LocalDate.of(2026, 12, 10), lecture1);
        planner.replan(1L);
        // four days left and one kept for review: three topics over three days
        assertEquals(List.of(sep(1), sep(2), sep(3)), dueDates(fresh));
    }

    @Test
    void aTopicWithNoQuestionLeftToAskTakesNoSlot() {
        List<ReviewState> fresh = topics(lecture1, 4, sep(20));
        askable.remove(fresh.get(0).concept.id);
        exam("Midterm", sep(3), lecture1);
        planner.replan(1L);
        assertEquals(sep(20), fresh.get(0).dueDate);
        assertEquals(List.of(sep(1), sep(1), sep(2)), dueDates(fresh.subList(1, 4)));
    }

    @Test
    void theFirstReadOfTheDayPlansAndLaterReadsThatDayDoNot() {
        topics(lecture1, 2, sep(20));
        exam("Midterm", sep(7), lecture1);
        planner.ensureToday(1L);
        planner.ensureToday(1L);
        assertEquals(TODAY, course.plannedOn);
        verify(reviewStateRepo, times(1)).findByConceptCourseIdOrderByConceptIdAsc(1L);
    }

    @Test
    void aNewLectureJoinsTheNearestExamAheadAndThePlanTakesItsTopicsIn() {
        exam("Quiz", LocalDate.of(2026, 8, 20), lecture1);
        Exam midterm = exam("Midterm", sep(7), lecture1);
        Exam fin = exam("Final", LocalDate.of(2026, 12, 10));
        List<ReviewState> fresh = topics(lecture2, 5, sep(25));
        planner.lectureAdded(lecture2);
        assertTrue(midterm.lectures.contains(lecture2));
        assertFalse(fin.lectures.contains(lecture2));
        assertEquals(List.of(sep(1), sep(2), sep(3), sep(4), sep(5)), dueDates(fresh));
    }

    @Test
    void aNewLectureWithNoExamAheadJoinsNothing() {
        Exam quiz = exam("Quiz", LocalDate.of(2026, 8, 20), lecture1);
        planner.lectureAdded(lecture2);
        assertFalse(quiz.lectures.contains(lecture2));
        verify(examRepo, never()).save(any());
    }

    @Test
    void theTopicsMissedLastTimeThatAnExamAheadCoversAreAskedFirst() {
        ReviewState right = startedTopic(lecture1, 2, TODAY);
        ReviewState missed = startedTopic(lecture1, 0, TODAY);
        ReviewState fresh = topics(lecture1, 1, TODAY).get(0);
        ReviewState missedUncovered = startedTopic(lecture2, 0, TODAY);
        exam("Midterm", sep(7), lecture1);
        assertEquals(List.of(missed, right, fresh, missedUncovered),
            planner.askingOrder(1L, List.of(right, fresh, missedUncovered, missed)));
    }

    @Test
    void withNoExamAheadTheQueueKeepsItsOrder() {
        ReviewState right = startedTopic(lecture1, 1, TODAY);
        ReviewState missed = startedTopic(lecture1, 0, TODAY);
        assertEquals(List.of(right, missed), planner.askingOrder(1L, List.of(right, missed)));
    }

    @Test
    void aVerdictsNewReviewIsKeptBeforeTheNearestExamCoveringTheLecture() {
        ReviewState rs = startedTopic(lecture1, 4, sep(30));
        Exam midterm = new Exam();
        midterm.date = sep(10);
        when(examRepo.findUpcomingByLectureId(11L, TODAY)).thenReturn(List.of(midterm));
        planner.keepBeforeExam(rs);
        assertEquals(sep(9), rs.dueDate);
    }

    @Test
    void anExamShowsWhatTodayHoldsForItAndWhereItsPlanStands() {
        topics(lecture1, 10, sep(20));
        startedTopic(lecture1, 1, TODAY);
        startedTopic(lecture1, 0, sep(4));
        exam("Quiz", LocalDate.of(2026, 8, 20), lecture1);
        exam("Midterm", sep(7), lecture1, lecture2);

        List<ExamPlanner.ExamView> views = planner.exams(1L);

        assertEquals("past", views.get(0).status());
        assertNull(views.get(0).plan());
        ExamPlanner.ExamView midterm = views.get(1);
        assertEquals("upcoming", midterm.status());
        assertEquals(List.of(11L, 12L), midterm.lectureIds());
        // ten not started over five days puts two on today; the started topic due today is a review
        assertEquals(new ExamPlanner.Plan(6, 1, sep(5), 12, 10, 2, 1), midterm.plan());
    }

    @Test
    void anExamNeedsANameAndADate() {
        assertThrows(IllegalArgumentException.class,
            () -> planner.create(1L, new ExamPlanner.ExamRequest(" ", sep(20), List.of(11L))));
        assertThrows(IllegalArgumentException.class,
            () -> planner.create(1L, new ExamPlanner.ExamRequest("Midterm", null, List.of(11L))));
        verify(examRepo, never()).save(any());
    }

    @Test
    void creatingAnExamKeepsOnlyTheCoursesOwnLecturesAndPlansAtOnce() {
        List<ReviewState> fresh = topics(lecture1, 2, sep(25));
        ExamPlanner.ExamView view = planner.create(1L,
            new ExamPlanner.ExamRequest(" Midterm ", sep(3), List.of(11L, 999L)));
        assertEquals("Midterm", view.name());
        assertEquals(List.of(11L), view.lectureIds());
        assertEquals(List.of(sep(1), sep(2)), dueDates(fresh));
    }

    @Test
    void movingAnExamReplansAndDeletingOneLeavesItsTopicsWhereTheyAre() {
        List<ReviewState> fresh = topics(lecture1, 4, sep(25));
        Exam midterm = exam("Midterm", sep(29), lecture1);
        when(examRepo.findById(midterm.id)).thenReturn(Optional.of(midterm));

        planner.update(midterm.id, new ExamPlanner.ExamRequest("Midterm", sep(3), List.of(11L)));
        assertEquals(List.of(sep(1), sep(1), sep(2), sep(2)), dueDates(fresh));

        doAnswer(inv -> exams.remove(midterm)).when(examRepo).delete(midterm);
        planner.delete(midterm.id);
        verify(examRepo).delete(midterm);
        assertEquals(List.of(sep(1), sep(1), sep(2), sep(2)), dueDates(fresh));
    }
}
