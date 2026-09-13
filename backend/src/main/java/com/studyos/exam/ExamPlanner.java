package com.studyos.exam;

import com.studyos.config.AppStudyProps;
import com.studyos.domain.Concept;
import com.studyos.domain.Course;
import com.studyos.domain.Exam;
import com.studyos.domain.Material;
import com.studyos.domain.MaterialStatus;
import com.studyos.domain.QuestionStatus;
import com.studyos.domain.ReviewState;
import com.studyos.domain.Verdict;
import com.studyos.repo.AttemptRepo;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.ExamRepo;
import com.studyos.repo.MaterialRepo;
import com.studyos.repo.QuestionRepo;
import com.studyos.repo.ReviewStateRepo;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Paces a course's topics to its exams.
 *
 * <p>An exam covers some of a course's lectures, and a topic is paced to the nearest exam still ahead
 * that covers the lecture it came from. The plan is worked out again every day from the days that are
 * left: the topics not started yet are spread evenly over the days before the review stretch, so a day
 * holds a few while the exam is far off and more as it gets close, and a topic already started never has
 * its next review land after its exam. The plan stores nothing but the due dates it sets, so a skipped
 * day, a new lecture or a moved exam is simply part of the next plan.
 */
@Service
public class ExamPlanner {
    private final CourseRepo courseRepo;
    private final ExamRepo examRepo;
    private final MaterialRepo materialRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;
    private final AttemptRepo attemptRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final Clock clock;
    private final AppStudyProps study;

    public ExamPlanner(CourseRepo courseRepo, ExamRepo examRepo, MaterialRepo materialRepo, ConceptRepo conceptRepo,
                       QuestionRepo questionRepo, AttemptRepo attemptRepo, ReviewStateRepo reviewStateRepo,
                       Clock clock, AppStudyProps study) {
        this.courseRepo = courseRepo;
        this.examRepo = examRepo;
        this.materialRepo = materialRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
        this.attemptRepo = attemptRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.clock = clock;
        this.study = study;
    }

    public record ExamRequest(String name, LocalDate date, List<Long> lectureIds) {}

    public record LectureView(Long id, String filename, long concepts) {}

    /** Where an exam's plan stands today: its days, its topics, and what today holds for it. */
    public record Plan(long daysLeft, long reviewDays, LocalDate lastNewDay, long topics, long topicsLeft,
                       long newToday, long reviewsToday) {}

    /** An exam as the page shows it. The plan is null once the exam's day has come. */
    public record ExamView(Long id, String name, LocalDate date, List<Long> lectureIds, String status, Plan plan) {}

    /** The days before an exam, today counted and the exam day not, split between starting topics and review. */
    public record Window(long daysLeft, long reviewDays) {
        public long newDays() {
            return daysLeft - reviewDays;
        }
    }

    public Window window(LocalDate exam, LocalDate today) {
        long daysLeft = ChronoUnit.DAYS.between(today, exam);
        // a share of the time left, so it shrinks as the exam nears, and never the last day there is to start on
        long reviewDays = Math.max(0, Math.min(daysLeft - 1, Math.round(daysLeft * study.examReviewShare())));
        return new Window(daysLeft, reviewDays);
    }

    // ---- planning -------------------------------------------------------------------------------------

    /** Plans the course if nothing has yet today. Every read of a course's schedule calls this first. */
    @Transactional
    public void ensureToday(Long courseId) {
        LocalDate today = LocalDate.now(clock);
        courseRepo.findById(courseId)
            .filter(course -> !today.equals(course.plannedOn))
            .ifPresent(course -> plan(course, today));
    }

    /** Plans the course now: after an exam changes, or a lecture joins one. */
    @Transactional
    public void replan(Long courseId) {
        courseRepo.findById(courseId).ifPresent(course -> plan(course, LocalDate.now(clock)));
    }

    private void plan(Course course, LocalDate today) {
        Scope scope = scope(course.id, today);
        if (!scope.isEmpty()) {
            Set<Long> started = started(course.id);
            Map<Exam, List<ReviewState>> fresh = new LinkedHashMap<>();
            List<ReviewState> moved = new ArrayList<>();
            for (ReviewState rs : reviewStateRepo.findByConceptCourseIdOrderByConceptIdAsc(course.id)) {
                Exam exam = scope.examFor(rs.concept);
                if (exam == null) continue;
                if (started.contains(rs.concept.id)) {
                    if (keepBefore(rs, exam.date, today)) moved.add(rs);
                } else {
                    fresh.computeIfAbsent(exam, e -> new ArrayList<>()).add(rs);
                }
            }
            fresh.forEach((exam, topics) -> {
                spread(topics, window(exam.date, today), today);
                moved.addAll(topics);
            });
            reviewStateRepo.saveAll(moved);
        }
        course.plannedOn = today;
        courseRepo.save(course);
    }

    /* The topics not started yet, spread evenly over the days left for starting them, in the order the
       lectures produced them: n topics over d days put topic i on day i * d / n. */
    static void spread(List<ReviewState> topics, Window window, LocalDate today) {
        int n = topics.size();
        for (int i = 0; i < n; i++) {
            topics.get(i).dueDate = today.plusDays(i * window.newDays() / n);
        }
    }

    /* A started topic's next review lands before its exam: the day before at the latest, or tomorrow when
       the day before is already today, so a topic just answered is not handed straight back. Says whether
       the review moved. */
    static boolean keepBefore(ReviewState rs, LocalDate exam, LocalDate today) {
        LocalDate latest = exam.minusDays(1);
        if (rs.dueDate == null || !rs.dueDate.isAfter(latest)) return false;
        LocalDate kept = latest.isAfter(today) ? latest : today.plusDays(1);
        if (kept.equals(rs.dueDate)) return false;
        rs.dueDate = kept;
        return true;
    }

    /** After a verdict sets a topic's next review, keeps it before the nearest exam ahead covering its lecture. */
    public void keepBeforeExam(ReviewState rs) {
        if (rs.concept == null || rs.concept.material == null) return;
        LocalDate today = LocalDate.now(clock);
        examRepo.findUpcomingByLectureId(rs.concept.material.id, today).stream().findFirst()
            .ifPresent(exam -> keepBefore(rs, exam.date, today));
    }

    /** Today's due topics in the order to ask them: a topic missed last time that an exam ahead covers comes
        first, and everything else keeps its due-date order. */
    @Transactional(readOnly = true)
    public List<ReviewState> askingOrder(Long courseId, List<ReviewState> due) {
        if (due.isEmpty()) return due;
        Scope scope = scope(courseId, LocalDate.now(clock));
        if (scope.isEmpty()) return due;
        Set<Long> started = started(courseId);
        List<ReviewState> missed = new ArrayList<>();
        List<ReviewState> rest = new ArrayList<>();
        for (ReviewState rs : due) {
            // a miss resets the streak, so a started topic with no streak was answered wrong last time
            boolean wrongLastTime = rs.streak == 0 && started.contains(rs.concept.id);
            if (wrongLastTime && scope.examFor(rs.concept) != null) missed.add(rs);
            else rest.add(rs);
        }
        missed.addAll(rest);
        return missed;
    }

    /** A lecture just ingested joins the nearest exam ahead, if the course has one, and the plan takes it in. */
    @Transactional
    public void lectureAdded(Material lecture) {
        LocalDate today = LocalDate.now(clock);
        examRepo.findByCourseIdOrderByDateAscIdAsc(lecture.course.id).stream()
            .filter(exam -> exam.date.isAfter(today))
            .findFirst()
            .ifPresent(exam -> {
                exam.lectures.add(lecture);
                examRepo.save(exam);
                replan(lecture.course.id);
            });
    }

    /* Which exam each topic is paced to: the nearest one ahead that covers its lecture, as long as the topic
       still has a question to ask. */
    private record Scope(Map<Long, Exam> byLecture, Set<Long> askable) {
        Exam examFor(Concept concept) {
            if (concept.material == null || !askable.contains(concept.id)) return null;
            return byLecture.get(concept.material.id);
        }

        boolean isEmpty() {
            return byLecture.isEmpty();
        }
    }

    private Scope scope(Long courseId, LocalDate today) {
        Map<Long, Exam> byLecture = new HashMap<>();
        for (Exam exam : examRepo.findByCourseIdOrderByDateAscIdAsc(courseId)) {
            if (!exam.date.isAfter(today)) continue;
            for (Material lecture : exam.lectures) byLecture.putIfAbsent(lecture.id, exam);
        }
        Set<Long> askable = byLecture.isEmpty() ? Set.of()
            : new HashSet<>(questionRepo.findConceptIdsByCourseIdAndStatus(courseId, QuestionStatus.ACTIVE));
        return new Scope(byLecture, askable);
    }

    // a topic is started once an answer to it has been graded; a PENDING attempt never was
    private Set<Long> started(Long courseId) {
        return new HashSet<>(attemptRepo.findGradedConceptIdsByCourseId(courseId, Verdict.PENDING));
    }

    // ---- what the page reads ---------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<LectureView> lectures(Long courseId) {
        return materialRepo.findByCourseIdAndStatusOrderByIdAsc(courseId, MaterialStatus.INGESTED).stream()
            .map(lecture -> new LectureView(lecture.id, lecture.filename, conceptRepo.findByMaterialId(lecture.id).size()))
            .toList();
    }

    private static final class Tally {
        long topics;
        long topicsLeft;
        long newToday;
        long reviewsToday;
    }

    @Transactional
    public List<ExamView> exams(Long courseId) {
        ensureToday(courseId);
        LocalDate today = LocalDate.now(clock);
        Scope scope = scope(courseId, today);
        Map<Long, Tally> tallies = new HashMap<>();
        if (!scope.isEmpty()) {
            Set<Long> started = started(courseId);
            for (ReviewState rs : reviewStateRepo.findByConceptCourseIdOrderByConceptIdAsc(courseId)) {
                Exam exam = scope.examFor(rs.concept);
                if (exam == null) continue;
                Tally tally = tallies.computeIfAbsent(exam.id, id -> new Tally());
                boolean due = !rs.dueDate.isAfter(today);
                tally.topics++;
                if (!started.contains(rs.concept.id)) {
                    tally.topicsLeft++;
                    if (due) tally.newToday++;
                } else if (due) {
                    tally.reviewsToday++;
                }
            }
        }
        return examRepo.findByCourseIdOrderByDateAscIdAsc(courseId).stream()
            .map(exam -> view(exam, today, tallies.getOrDefault(exam.id, new Tally())))
            .toList();
    }

    private ExamView view(Exam exam, LocalDate today, Tally tally) {
        List<Long> lectureIds = exam.lectures.stream().map(lecture -> lecture.id).sorted().toList();
        if (!exam.date.isAfter(today)) {
            String status = exam.date.isEqual(today) ? "today" : "past";
            return new ExamView(exam.id, exam.name, exam.date, lectureIds, status, null);
        }
        Window window = window(exam.date, today);
        return new ExamView(exam.id, exam.name, exam.date, lectureIds, "upcoming",
            new Plan(window.daysLeft(), window.reviewDays(), today.plusDays(window.newDays() - 1),
                tally.topics, tally.topicsLeft, tally.newToday, tally.reviewsToday));
    }

    // ---- changing exams ----------------------------------------------------------------------------------

    @Transactional
    public ExamView create(Long courseId, ExamRequest request) {
        Exam exam = new Exam();
        exam.course = courseRepo.findById(courseId).orElseThrow();
        fill(exam, request);
        Exam saved = examRepo.save(exam);
        replan(courseId);
        return viewOf(courseId, saved.id);
    }

    @Transactional
    public ExamView update(Long examId, ExamRequest request) {
        Exam exam = examRepo.findById(examId).orElseThrow();
        fill(exam, request);
        examRepo.save(exam);
        replan(exam.course.id);
        return viewOf(exam.course.id, exam.id);
    }

    /** Deleting an exam leaves its topics where the plan last put them; they are simply not paced any more. */
    @Transactional
    public void delete(Long examId) {
        Exam exam = examRepo.findById(examId).orElseThrow();
        Long courseId = exam.course.id;
        examRepo.delete(exam);
        replan(courseId);
    }

    private ExamView viewOf(Long courseId, Long examId) {
        return exams(courseId).stream().filter(view -> view.id().equals(examId)).findFirst().orElseThrow();
    }

    private void fill(Exam exam, ExamRequest request) {
        String name = request.name() == null ? "" : request.name().trim();
        if (name.isEmpty()) throw new IllegalArgumentException("an exam needs a name");
        if (request.date() == null) throw new IllegalArgumentException("an exam needs a date");
        exam.name = name;
        exam.date = request.date();
        Set<Long> wanted = request.lectureIds() == null ? Set.of() : new HashSet<>(request.lectureIds());
        exam.lectures.clear();
        // only the course's own lectures can be on its exam
        for (Material lecture : materialRepo.findByCourseIdAndStatusOrderByIdAsc(exam.course.id, MaterialStatus.INGESTED)) {
            if (wanted.contains(lecture.id)) exam.lectures.add(lecture);
        }
    }
}
