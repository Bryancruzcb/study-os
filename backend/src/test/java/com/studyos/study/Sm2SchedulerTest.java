package com.studyos.study;

import static org.junit.jupiter.api.Assertions.*;

import com.studyos.domain.Concept;
import com.studyos.domain.ReviewState;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class Sm2SchedulerTest {
    static final LocalDate TODAY = LocalDate.of(2026, 9, 1);

    private ReviewState fresh() {
        return ReviewState.initial(new Concept(), TODAY);
    }

    @Test
    void correctGrowsIntervalAndStreak() {
        ReviewState rs = fresh();
        Sm2Scheduler.apply(rs, true, TODAY);
        assertEquals(3, rs.intervalDays); // round(1 * 2.5) = 3
        assertEquals(1, rs.streak);
        assertEquals(2.5, rs.ease, 1e-9);
        assertEquals(TODAY.plusDays(3), rs.dueDate);
    }

    @Test
    void secondCorrectCompounds() {
        ReviewState rs = fresh();
        Sm2Scheduler.apply(rs, true, TODAY);
        Sm2Scheduler.apply(rs, true, TODAY.plusDays(3));
        assertEquals(8, rs.intervalDays); // round(3 * 2.5) = 8
        assertEquals(2, rs.streak);
    }

    @Test
    void incorrectResetsIntervalDropsEase() {
        ReviewState rs = fresh();
        Sm2Scheduler.apply(rs, true, TODAY);
        Sm2Scheduler.apply(rs, false, TODAY.plusDays(3));
        assertEquals(1, rs.intervalDays);
        assertEquals(2.3, rs.ease, 1e-9);
        assertEquals(0, rs.streak);
        assertEquals(TODAY.plusDays(4), rs.dueDate);
    }

    @Test
    void easeFloorsAt1_3() {
        ReviewState rs = fresh();
        for (int i = 0; i < 10; i++) Sm2Scheduler.apply(rs, false, TODAY);
        assertEquals(1.3, rs.ease, 1e-9);
    }
}
