package com.studyos.domain;

import jakarta.persistence.*;

@Entity
public class Concept {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @ManyToOne(optional = false)
    public Course course;
    @ManyToOne(optional = false)
    public Material material;
    public String name;
    @Column(length = 1000)
    public String summary;
    public String sourcePages; // comma-separated, e.g. "3,4"
}
