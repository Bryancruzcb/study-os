package com.studyos.domain;

import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class ReviewStateTest {
    @Test
    void initialStateMatchesSpec() {
        Concept c = new Concept();
        ReviewState rs = ReviewState.initial(c, LocalDate.of(2026, 9, 1));
        assertEquals(1, rs.intervalDays);
        assertEquals(2.5, rs.ease, 1e-9);
        assertEquals(0, rs.streak);
        assertEquals(LocalDate.of(2026, 9, 1), rs.dueDate);
        assertSame(c, rs.concept);
    }
}
