package com.studyos.domain;

import jakarta.persistence.*;

/**
 * The lecture PDF kept so the bank can generate more questions from the same slides
 * without asking for another upload. Separate from {@link Material} so status polls
 * never haul the bytes.
 *
 * <p>The bytes live in the row as {@code bytea}. With {@code @Lob}, Hibernate writes a
 * Postgres large object and puts its id in the column instead, which a {@code bytea}
 * column refuses and which an {@code oid} column leaks on every replace and delete.
 */
@Entity
@Table(name = "material_pdf")
public class MaterialPdf {
    @Id
    public Long materialId;

    @Column(nullable = false)
    public byte[] bytes;
}
