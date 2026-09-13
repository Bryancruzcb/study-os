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
    // the last day the exam plan was worked out; the first read of the schedule on a new day plans again
    @JsonIgnore
    public LocalDate plannedOn;
}
