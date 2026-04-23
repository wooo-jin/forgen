/**
 * V7: forgen-mcp 실제 JSON-RPC 라운드트립.
 *
 * MCP 서버를 실제로 spawn 하고 stdin 으로 initialize → list_tools → call_tool
 * 을 보내서 응답을 검증한다. forgen 을 사용하는 Claude Code / Cursor 등 MCP
 * 클라이언트 관점의 계약을 실측.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';

const TEST_HOME = `/tmp/forgen-test-mcp-${process.pid}`;
const MCP_BIN = path.resolve('dist/mcp/server.js');

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: { code: number; message: string };
}

class McpClient {
  private proc: ChildProcess;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, (r: JsonRpcResponse) => void>();

  constructor(home: string) {
    this.proc = spawn('node', [MCP_BIN], {
      env: { ...process.env, HOME: home },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout!.on('data', (chunk) => {
      this.buffer += chunk.toString();
      // line-delimited JSON
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcResponse;
          const cb = this.pending.get(Number(msg.id));
          if (cb) {
            this.pending.delete(Number(msg.id));
            cb(msg);
          }
        } catch { /* skip non-JSON stderr noise that might leak into stdout */ }
      }
    });
    this.proc.stderr!.on('data', () => { /* consume to unblock */ });
  }

  async send(method: string, params?: unknown, timeoutMs = 5000): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP timeout on ${method}`));
      }, timeoutMs);
      this.pending.set(id, (r) => {
        clearTimeout(to);
        resolve(r);
      });
      this.proc.stdin!.write(payload);
    });
  }

  close() {
    this.proc.kill();
  }
}

describe('V7: forgen-mcp JSON-RPC round-trip', () => {
  let client: McpClient;

  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_HOME, { recursive: true });
    client = new McpClient(TEST_HOME);
  });

  afterEach(() => {
    client.close();
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('initialize: server responds with protocolVersion + capabilities', async () => {
    const r = await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'forgen-v7-test', version: '1.0.0' },
    });
    expect(r.error).toBeUndefined();
    expect(r.result).toBeDefined();
    expect(r.result.protocolVersion).toBeDefined();
    expect(r.result.capabilities).toBeDefined();
    expect(r.result.serverInfo?.name).toMatch(/forgen/i);
  });

  it('tools/list: returns non-empty tools array with known names', async () => {
    await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'v7', version: '1.0' },
    });
    const r = await client.send('tools/list');
    expect(r.error).toBeUndefined();
    const tools = r.result.tools as Array<{ name: string; description?: string }>;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    const names = tools.map((t) => t.name);
    // 핵심 tools 존재 확인
    expect(names).toContain('correction-record');
    expect(names).toContain('rule-list');
    expect(names).toContain('compound-search');
  });

  it('tools/call correction-record: evidence 파일이 실제 생성됨', async () => {
    await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'v7', version: '1.0' },
    });
    const r = await client.send('tools/call', {
      name: 'correction-record',
      arguments: {
        session_id: 'v7-test-session',
        kind: 'prefer-from-now',
        message: 'V7 테스트 — 앞으로 항상 async/await 쓸 것',
        target: '.then() 체인 사용',
        axis_hint: 'quality_safety',
      },
    });
    expect(r.error).toBeUndefined();
    expect(r.result?.content).toBeDefined();
    expect(r.result?.isError).not.toBe(true);

    // evidence 디렉토리에 실제 파일 생성되었는지 확인
    const evidenceDir = path.join(TEST_HOME, '.forgen', 'me', 'behavior');
    expect(fs.existsSync(evidenceDir)).toBe(true);
    const files = fs.readdirSync(evidenceDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(1);

    // 파일 내용이 저장한 message 를 포함
    const content = fs.readFileSync(path.join(evidenceDir, files[0]), 'utf-8');
    expect(content).toContain('V7 테스트');
  });

  it('tools/call rule-list: 빈 상태에서도 error 없이 빈 리스트 반환', async () => {
    await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'v7', version: '1.0' },
    });
    const r = await client.send('tools/call', {
      name: 'rule-list',
      arguments: {},
    });
    expect(r.error).toBeUndefined();
    expect(r.result?.content).toBeDefined();
    const text = r.result.content[0]?.text ?? '';
    // 빈 상태 메시지 또는 rule 목록
    expect(typeof text).toBe('string');
  });

  it('tools/call 존재하지 않는 도구: JSON-RPC error 로 적절히 응답 (crash X)', async () => {
    await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'v7', version: '1.0' },
    });
    const r = await client.send('tools/call', {
      name: 'nonexistent-tool-xyz',
      arguments: {},
    });
    // MCP 는 tool error 를 result.isError 또는 error 로 시그널 — 둘 중 하나로 처리됐으면 OK
    const errored = !!r.error || !!r.result?.isError;
    expect(errored).toBe(true);
  });
});
