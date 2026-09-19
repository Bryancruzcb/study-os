package com.studyos.domain;

import jakarta.persistence.*;

/**
 * The lecture PDF kept so the bank can generate more questions from the same slides
 * without asking for another upload. Separate from {@link Material} so status polls
 * never haul the bytes.
 */
@Entity
@Table(name = "material_pdf")
public class MaterialPdf {
    @Id
    public Long materialId;

    @Lob
    @Column(nullable = false)
    public byte[] bytes;
}
