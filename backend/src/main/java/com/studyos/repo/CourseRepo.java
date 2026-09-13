package com.studyos.repo;

import com.studyos.domain.Course;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseRepo extends JpaRepository<Course, Long> {
    List<Course> findByOwnerIdOrderByIdAsc(Long ownerId);
    Optional<Course> findByIdAndOwnerId(Long id, Long ownerId);
    // the courses made before accounts existed
    List<Course> findByOwnerIsNull();
}
