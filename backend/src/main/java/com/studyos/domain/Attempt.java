package com.studyos.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

@Entity
public class Attempt {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @ManyToOne(optional = false)
    @JsonIgnore
    public Question question;
    @Column(length = 8000)
    public String givenAnswer;
    @Enumerated(EnumType.STRING)
    public Verdict verdict;
    public Double score;         // 0/1 MC, 0.0-1.0 short answer
    @Column(length = 4000)
    public String feedback;
    @Column(length = 8000)
    public String graderRaw;     // raw grader JSON, null for MC / PENDING
    @Enumerated(EnumType.STRING)
    public Verdict graderVerdict; // what the grader said, null when no grader judged it (MC)
    public boolean overridden = false;
    // AttemptRepo orders on this and the latest-attempt guard trusts that ordering, so it
    // must never be null: NULLS FIRST on a DESC sort would hand the guard the wrong attempt
    @Column(nullable = false)
    public Instant createdAt;
    // ReviewState snapshot taken when the schedule update was applied (null while PENDING)
    public Integer prevInterval;
    public Double prevEase;
    public Integer prevStreak;
    public LocalDate prevDueDate;
}
