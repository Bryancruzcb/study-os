package com.studyos.repo;

import com.studyos.domain.MaterialPdf;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MaterialPdfRepo extends JpaRepository<MaterialPdf, Long> {
    void deleteByMaterialId(Long materialId);
}
