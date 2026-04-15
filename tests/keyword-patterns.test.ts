import { describe, it, expect } from 'vitest';
import {
  KEYWORD_PATTERNS,
  detectKeyword,
  shouldTrackWorkflowActivation,
} from '../src/hooks/keyword-detector.js';

describe('keyword patterns', () => {
  it('KEYWORD_PATTERNS가 배열로 존재한다', () => {
    expect(Array.isArray(KEYWORD_PATTERNS)).toBe(true);
    expect(KEYWORD_PATTERNS.length).toBeGreaterThanOrEqual(14);
  });

  // 정상 매칭
  it('ralph 단독 입력을 감지한다', () => {
    expect(detectKeyword('ralph')?.keyword).toBe('ralph');
  });

  it('ralph + 모드 키워드를 감지한다', () => {
    expect(detectKeyword('ralph 해줘 이것 구현')?.keyword).toBe('ralph');
    expect(detectKeyword('ralph 시작')?.keyword).toBe('ralph');
  });

  it('ralph가 문장 중간에 있으면 매칭하지 않는다 (false positive 방지)', () => {
    expect(detectKeyword('Ralph Waldo Emerson was a philosopher')).toBeNull();
    expect(detectKeyword('ask ralph about this')).toBeNull();
  });

  it('autopilot을 감지한다', () => {
    expect(detectKeyword('autopilot 시작')?.keyword).toBe('autopilot');
  });

  it('cancelforgen를 감지한다', () => {
    expect(detectKeyword('cancelforgen')?.keyword).toBe('cancel');
  });

  it('ulw를 ultrawork로 감지한다', () => {
    expect(detectKeyword('ulw 작업')?.keyword).toBe('ultrawork');
  });

  // false positive 방지
  it('"team"만 단독으로는 매칭하지 않는다', () => {
    expect(detectKeyword('team meeting 준비')).toBeNull();
  });

  it('"team mode"는 매칭한다', () => {
    expect(detectKeyword('team mode 활성화')?.keyword).toBe('team');
  });

  it('"--team"은 매칭한다', () => {
    expect(detectKeyword('--team 플래그')?.keyword).toBe('team');
  });

  it('"pipeline" 단독으로 매칭한다', () => {
    expect(detectKeyword('CI/CD pipeline 설정')?.keyword).toBe('pipeline');
  });

  it('"pipeline mode"도 매칭한다', () => {
    expect(detectKeyword('pipeline mode 실행')?.keyword).toBe('pipeline');
  });

  // cancel 우선순위
  it('cancel이 다른 키워드보다 우선한다', () => {
    expect(detectKeyword('cancelforgen ralph')?.keyword).toBe('cancel');
  });

  // 대소문자 무관
  it('대소문자를 무시한다', () => {
    expect(detectKeyword('RALPH 모드')?.keyword).toBe('ralph');
    expect(detectKeyword('DeepSearch')?.keyword).toBe('deepsearch');
  });

  // 일상어 안전
  it('"analyze"는 매칭하지 않는다 (제거됨)', () => {
    expect(detectKeyword('analyze this code')).toBeNull();
  });

  it('"review"만으로는 매칭하지 않는다', () => {
    // "code review"만 매칭, "review"만은 아님
    expect(detectKeyword('please review this')).toBeNull();
  });

  it('"code review"는 매칭한다', () => {
    expect(detectKeyword('code review 해줘')?.keyword).toBe('code-review');
  });

  it('겹치는 스킬 이름은 skill 경로로 통일된다', () => {
    expect(detectKeyword('code review 해줘')?.type).toBe('skill');
    expect(detectKeyword('forge-loop 시작')?.type).toBe('skill');
    expect(detectKeyword('ship')?.type).toBe('skill');
    expect(detectKeyword('retro')?.type).toBe('skill');
  });

  it('reasoning/search inject keyword는 workflow tracking 대상이 아니다', () => {
    expect(shouldTrackWorkflowActivation({ type: 'inject', keyword: 'ultrathink' })).toBe(false);
    expect(shouldTrackWorkflowActivation({ type: 'inject', keyword: 'deepsearch' })).toBe(false);
  });

  it('workflow 성격의 skill keyword는 tracking 대상이다', () => {
    expect(shouldTrackWorkflowActivation({ type: 'skill', keyword: 'forge-loop', skill: 'forge-loop' })).toBe(true);
    expect(shouldTrackWorkflowActivation({ type: 'skill', keyword: 'ship', skill: 'ship' })).toBe(true);
  });

  // ── 오탐 방지 테스트 ──

  it('"npm 패키지를 업그레이드해줘" → migrate 트리거 안 됨', () => {
    // "업그레이드"는 migrate 키워드가 아님
    expect(detectKeyword('npm 패키지를 업그레이드해줘')).toBeNull();
  });

  it('"시간을 절약하자" → ecomode 트리거 안 됨', () => {
    // "절약"은 "토큰 절약"과 다름
    expect(detectKeyword('시간을 절약하자')).toBeNull();
  });

  it('"코드 좀 정리해줘" → refactor 트리거 안 됨', () => {
    // "정리"는 refactor/리팩토링 키워드가 아님
    expect(detectKeyword('코드 좀 정리해줘')).toBeNull();
  });

  // ── 새 키워드 테스트 ──

  it('"forge-loop 시작" → forge-loop 트리거 됨', () => {
    expect(detectKeyword('forge-loop 시작')?.keyword).toBe('forge-loop');
  });

  it('"끝까지 해줘" → forge-loop 트리거 됨', () => {
    expect(detectKeyword('끝까지 해줘')?.keyword).toBe('forge-loop');
  });

  it('"ship" → ship 트리거 됨', () => {
    expect(detectKeyword('ship')?.keyword).toBe('ship');
  });

  it('"배포 해줘" → ship 트리거 됨', () => {
    expect(detectKeyword('배포 해줘')?.keyword).toBe('ship');
  });

  it('"retro" → retro 트리거 됨', () => {
    expect(detectKeyword('retro')?.keyword).toBe('retro');
  });

  it('"회고 하자" → retro 트리거 됨', () => {
    expect(detectKeyword('회고 하자')?.keyword).toBe('retro');
  });

  it('"learn prune" → learn 트리거 됨', () => {
    expect(detectKeyword('learn prune')?.keyword).toBe('learn');
  });

  it('"calibrate" → calibrate 트리거 됨', () => {
    expect(detectKeyword('calibrate')?.keyword).toBe('calibrate');
  });

  it('"프로필 보정" → calibrate 트리거 됨', () => {
    expect(detectKeyword('프로필 보정')?.keyword).toBe('calibrate');
  });

  it('"deep-interview"를 감지한다', () => {
    const result = detectKeyword('deep-interview 이커머스 MVP');
    expect(result).not.toBeNull();
    expect(result!.keyword).toBe('deep-interview');
    expect(result!.type).toBe('skill');
  });

  it('"deep interview" (공백)도 감지한다', () => {
    const result = detectKeyword('deep interview 시작');
    expect(result).not.toBeNull();
    expect(result!.keyword).toBe('deep-interview');
  });
});
