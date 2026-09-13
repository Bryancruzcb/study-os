package com.studyos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How the daily loop is shaped. {@code newConceptsPerDay} caps how many freshly ingested
 * concepts a course may have due on any one day, so a bulk import fills the calendar
 * forward instead of stacking hundreds of concepts on the day it was uploaded.
 * {@code examReviewShare} is the part of the days left before an exam that the plan keeps for
 * review after the last new topic: it is a share rather than a number of days, so the stretch
 * shrinks with the time left instead of eating a short run-up whole.
 */
@ConfigurationProperties(prefix = "app.study")
public record AppStudyProps(int newConceptsPerDay, double examReviewShare) {
    public AppStudyProps {
        // a limit of zero would leave every day full and the placement loop would never end
        if (newConceptsPerDay < 1) {
            throw new IllegalArgumentException(
                "app.study.new-concepts-per-day must be at least 1 but was " + newConceptsPerDay);
        }
        // a share of one would leave no day to start anything on
        if (examReviewShare < 0 || examReviewShare >= 1) {
            throw new IllegalArgumentException(
                "app.study.exam-review-share must be at least 0 and below 1 but was " + examReviewShare);
        }
    }
}
