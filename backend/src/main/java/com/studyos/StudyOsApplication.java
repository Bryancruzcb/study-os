package com.studyos;

import com.studyos.config.AppModelProps;
import com.studyos.config.AppStudyProps;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({AppModelProps.class, AppStudyProps.class})
public class StudyOsApplication {
    public static void main(String[] args) {
        SpringApplication.run(StudyOsApplication.class, args);
    }
}
