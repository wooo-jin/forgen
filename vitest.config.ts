import { defineConfig } from 'vitest/config';

// R2-D1: 테스트 프로세스 전체에 대한 글로벌 env.
// FORGEN_DISABLE_PROJECT_RULES=1 — .forgen/rules/ 자동 로딩 차단.
// repo 루트에 committed 된 L1 dogfood rules 가 테스트 격리를 깨뜨리는 것을 방지.
// 통합 테스트가 dogfood 로딩을 실제로 검증하려면 해당 테스트에서 env 해제.
process.env.FORGEN_DISABLE_PROJECT_RULES ??= '1';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        // v3.0.0 실측 기준 (2026-03-31). 매 릴리즈마다 상향. 장기 목표 70%.
        lines: 47,
        branches: 45,
        functions: 54,
        statements: 47,
      },
    },
  },
});
