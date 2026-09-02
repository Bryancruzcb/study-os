package com.studyos.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity
public class Material {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @ManyToOne(optional = false)
    @JsonIgnore
    public Course course;
    public String filename;
    @Column(unique = true)
    public String fileHash;
    public Integer pageCount;
    @Enumerated(EnumType.STRING)
    public MaterialStatus status = MaterialStatus.PENDING;
    @Column(length = 2000)
    public String errorMessage;
}
