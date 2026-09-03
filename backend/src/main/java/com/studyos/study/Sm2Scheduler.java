package com.studyos.study;

import com.studyos.domain.ReviewState;
import java.time.LocalDate;

public final class Sm2Scheduler {
    private Sm2Scheduler() {}

    public static void apply(ReviewState rs, boolean correct, LocalDate today) {
        if (correct) {
            rs.intervalDays = Math.max(1, (int) Math.round(rs.intervalDays * rs.ease));
            rs.streak += 1;
        } else {
            rs.intervalDays = 1;
            rs.ease = Math.max(1.3, Math.round((rs.ease - 0.2) * 10) / 10.0);
            rs.streak = 0;
        }
        rs.dueDate = today.plusDays(rs.intervalDays);
    }
}
