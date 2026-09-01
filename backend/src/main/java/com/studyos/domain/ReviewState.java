package com.studyos.domain;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
public class ReviewState {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @OneToOne(optional = false)
    public Concept concept;
    public int intervalDays;
    public double ease;
    public int streak;
    public LocalDate dueDate;

    public static ReviewState initial(Concept concept, LocalDate today) {
        ReviewState rs = new ReviewState();
        rs.concept = concept;
        rs.intervalDays = 1;
        rs.ease = 2.5;
        rs.streak = 0;
        rs.dueDate = today;
        return rs;
    }
}
