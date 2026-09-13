package com.studyos.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity
// a course holds a file once; the same slides in another account's course are that course's own copy
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"course_id", "file_hash"}))
public class Material {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @ManyToOne(optional = false)
    @JsonIgnore
    public Course course;
    public String filename;
    public String fileHash;
    public Integer pageCount;
    @Enumerated(EnumType.STRING)
    public MaterialStatus status = MaterialStatus.PENDING;
    @Column(length = 2000)
    public String errorMessage;
}
