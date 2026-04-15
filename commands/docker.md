---
name: docker
description: This skill should be used when the user asks to "docker,container,컨테이너,dockerfile,도커,docker-compose". Docker 컨테이너화 -- Dockerfile 최적화, Compose 구성, 보안 강화
argument-hint: "[컨테이너화 대상]"
model: sonnet
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
  - mcp__forgen-compound__compound-search
  - mcp__forgen-compound__compound-read
triggers:
  - "docker"
  - "container"
  - "컨테이너"
  - "dockerfile"
  - "도커"
  - "docker-compose"
---

<Purpose>
Docker를 활용한 컨테이너화를 체계적으로 수행합니다.
의존성 분석, Dockerfile 작성, 레이어 최적화,
Docker Compose 구성, 헬스 체크까지 컨테이너 라이프사이클 전체를 다룹니다.
</Purpose>

<Compound_Integration>
## 시작 전: 이전 Docker 구성 패턴 검색

컨테이너화를 시작하기 전에 compound-search MCP 도구로 유사한 런타임/애플리케이션의 과거 Docker 구성을 검색합니다.

```
compound-search("[런타임명 또는 애플리케이션 타입 키워드]")
compound-search("Docker 최적화")
```

검색 결과가 있으면 의존성 분석 단계 전에 표시합니다:
```
이전 Docker 구성 패턴:
- [애플리케이션명]: [베이스 이미지] → 최종 크기 [N]MB (날짜: YYYY-MM-DD)
- 주요 최적화: [레이어 전략, 보안 설정 등]
- 주의사항: [이전에 발견된 문제나 트릭]
```

이전 구성을 출발점으로 삼아 중복 탐색을 줄이고, 검증된 패턴을 재사용합니다.
완료 후 주요 최적화 내용과 이미지 크기를 compound에 기록합니다.
</Compound_Integration>

<Steps>
1. **의존성 분석**: 런타임 환경, 시스템 의존성, 포트, 볼륨, 외부 서비스
2. **Dockerfile 작성**: 멀티스테이지, 레이어 캐싱, 비루트 사용자, HEALTHCHECK
3. **이미지 최적화**: 레이어 최소화, 프로덕션 의존성만, 보안 스캔, 크기 측정
4. **Docker Compose 구성**: 서비스, 네트워크, 볼륨, 환경 변수, 오버라이드
5. **헬스 체크 및 모니터링**: probe, 로그 수집, graceful shutdown, 재시작 정책
</Steps>

## Docker 체크리스트

### Dockerfile (6개)
- [ ] 멀티스테이지 빌드 적용
- [ ] 베이스 이미지에 고정 태그 사용 (latest 금지)
- [ ] 비루트 사용자로 실행
- [ ] .dockerignore가 적절히 설정됨
- [ ] 레이어 캐싱이 최적화됨
- [ ] HEALTHCHECK가 설정됨

### 보안 (5개)
- [ ] 이미지 취약점 스캔 완료
- [ ] 최소 권한 원칙 적용 (비루트, 읽기 전용 파일시스템)
- [ ] 시크릿이 이미지에 포함되지 않음 (ENV, ARG, COPY 모두 확인)
- [ ] 불필요한 도구/패키지가 제거됨
- [ ] 빌드 시 민감 레이어 캐시 방지

### 운영 (4개)
- [ ] Graceful shutdown이 구현됨 (SIGTERM)
- [ ] 로그가 stdout/stderr로 출력됨
- [ ] 리소스 제한이 설정됨
- [ ] 재시작 정책이 설정됨

### Compose (4개)
- [ ] 서비스 간 의존성이 healthcheck 기반으로 설정됨
- [ ] 개발/프로덕션 오버라이드가 분리됨
- [ ] 볼륨이 데이터 영속성에 적절히 사용됨
- [ ] 네트워크가 서비스별로 격리됨

## 이미지 크기 기준

| 런타임 | 목표 크기 | 베이스 이미지 |
|--------|-----------|--------------|
| Node.js | < 150MB | node:20-alpine |
| Python | < 200MB | python:3.12-slim |
| Go | < 30MB | gcr.io/distroless/static |
| Rust | < 30MB | debian:bookworm-slim + scratch |
| Java | < 250MB | eclipse-temurin:21-jre-alpine |

<Failure_Modes>
## 피해야 할 실패 패턴

### 이미지 빌드
- **:latest 태그 사용**: 빌드 재현 불가능. 항상 `node:20.11.1-alpine3.19` 같이 고정.
- **단일 스테이지**: 빌드 도구가 런타임에 포함됨. 멀티스테이지 필수.
- **레이어 순서 오류**: 소스 코드를 lockfile보다 먼저 배치하면 캐시 무효화.

### 보안
- **root 실행**: `USER` 지시어 없이 실행. 컨테이너 탈출 시 호스트 루트 권한 획득 위험.
- **시크릿 하드코딩**: ENV/ARG/RUN에 시크릿 포함. BuildKit `--mount=type=secret` 사용.
- **ARG로 시크릿 전달**: 중간 레이어에 남음. BuildKit secret mount 사용.

### 구성
- **.dockerignore 누락**: node_modules, .git, .env가 이미지에 포함됨.
- **SIGTERM 미처리**: 10초 후 SIGKILL로 강제 종료. 데이터 손실 가능.
- **HEALTHCHECK 누락**: 애플리케이션 응답 불능 상태 미감지.
- **Compose 비밀번호 하드코딩**: .env 파일 또는 Docker secrets 사용.
</Failure_Modes>

<Output>
```
DOCKER CONFIGURATION / Docker 구성 문서
=========================================

Application: [애플리케이션명]
Runtime: [Node.js 20]
Image Size: [최종 이미지 크기]

DOCKERFILE / Dockerfile
DOCKER COMPOSE / docker-compose.yml
IMAGE ANALYSIS / 이미지 분석
SECURITY SCAN / 보안 스캔
```
</Output>

<Policy>
- 베이스 이미지에 항상 고정 태그 사용 (latest 금지)
- 프로덕션 이미지에서 비루트 사용자 실행 필수
- 시크릿은 절대 이미지에 포함하지 않음
- 멀티스테이지 빌드 기본 적용
- .dockerignore 필수 작성
- Graceful shutdown 필수 구현
</Policy>

## 다른 스킬과의 연동
- `/forgen:ci-cd` -- Docker 이미지 빌드/배포 파이프라인
- `/forgen:security-review` -- Dockerfile/이미지 보안 점검
- `/forgen:performance` -- 컨테이너 리소스 최적화

<Arguments>
## 사용법
`/forgen:docker {컨테이너화 대상}`

### 예시
- `/forgen:docker Node.js API 서버 컨테이너화`
- `/forgen:docker 기존 Dockerfile 최적화`
- `/forgen:docker 개발 환경 Docker Compose 구성`
- `/forgen:docker 프로덕션 배포용 이미지 보안 강화`

### 인자
- 컨테이너화할 애플리케이션, 최적화 목표 등을 설명
- 인자 없으면 프로젝트를 분석하여 적절한 Docker 구성을 제안
</Arguments>

$ARGUMENTS
