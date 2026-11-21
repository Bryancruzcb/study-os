package com.studyos.repo;

import com.studyos.domain.Material;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import com.studyos.domain.MaterialStatus;
import java.util.List;

public interface MaterialRepo extends JpaRepository<Material, Long> {
    Optional<Material> findByCourseIdAndFileHash(Long courseId, String fileHash);

    // the lectures an exam can cover, in the order they were uploaded
    List<Material> findByCourseIdAndStatusOrderByIdAsc(Long courseId, MaterialStatus status);

    // re-upload of an updated deck keeps the filename; this finds the prior copy to replace
    List<Material> findByCourseIdAndFilename(Long courseId, String filename);

    Optional<Material> findByIdAndCourseOwnerId(Long id, Long ownerId);

    // every lecture in the course whatever its status, so deleting the course leaves none behind
    List<Material> findByCourseId(Long courseId);

    // lectures ingested before extraction named them, oldest first, for the startup title job
    List<Material> findByStatusAndTitleIsNullOrderByIdAsc(MaterialStatus status);

    // Sets the title only while it is still missing, so a title extraction wrote in the meantime
    // is kept, and a lecture deleted during the job is simply not found. Returns rows changed.
    @Transactional
    @Modifying
    @Query("update Material m set m.title = :title where m.id = :id and m.title is null")
    int setTitleIfMissing(@Param("id") Long id, @Param("title") String title);
}
