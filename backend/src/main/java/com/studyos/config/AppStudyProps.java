package com.studyos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How the daily loop is shaped. {@code newConceptsPerDay} caps how many freshly ingested
 * concepts a course may have due on any one day, so a bulk import fills the calendar
 * forward instead of stacking hundreds of concepts on the day it was uploaded.
 */
@ConfigurationProperties(prefix = "app.study")
public record AppStudyProps(int newConceptsPerDay) {
    public AppStudyProps {
        // a limit of zero would leave every day full and the placement loop would never end
        if (newConceptsPerDay < 1) {
            throw new IllegalArgumentException(
                "app.study.new-concepts-per-day must be at least 1 but was " + newConceptsPerDay);
        }
    }
}
