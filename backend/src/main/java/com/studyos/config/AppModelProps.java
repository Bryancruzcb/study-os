package com.studyos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.model")
public record AppModelProps(String generation, String grading) {}
