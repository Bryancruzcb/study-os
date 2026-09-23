package com.studyos.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
public class Course {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public String name;
    public String term;
    // null only on a course made before accounts existed, until the first account adopts it
    @ManyToOne(fetch = FetchType.LAZY)
    @JsonIgnore
    public AppUser owner;
    // off the home grid and out of the due totals; everything in it stays until it is restored or deleted
    @Column(nullable = false)
    public boolean archived;
    // the last day the exam plan was worked out; the first read of the schedule on a new day plans again
    @JsonIgnore
    public LocalDate plannedOn;
}
