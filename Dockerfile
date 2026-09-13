# One image serves the whole app: the React build goes into Spring Boot's static folder, so the
# page and /api share an origin and no proxy or CORS setup sits between them.

FROM node:26-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS api
WORKDIR /api
COPY backend/pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY backend/src ./src
COPY --from=web /web/dist ./src/main/resources/static
# the suites run in CI; the image only packages what already passed there
RUN mvn -B -q package -Dmaven.test.skip=true

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=api /api/target/studyos-backend-0.1.0.jar app.jar
# free hosts give 512 MB: leave room outside the heap, and trade peak speed for a faster start
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+UseSerialGC -XX:TieredStopAtLevel=1"
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
