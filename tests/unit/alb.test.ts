import { describe, expect, it } from 'vitest';
import type { ALBEvent } from 'aws-lambda';
import { fromAlbEvent, toAlbResult } from '../../src/http/alb.ts';

function albEvent(overrides: Partial<ALBEvent> = {}): ALBEvent {
  return {
    requestContext: { elb: { targetGroupArn: 'arn:aws:elasticloadbalancing:...' } },
    httpMethod: 'GET',
    path: '/healthz',
    queryStringParameters: {},
    headers: {},
    body: '',
    isBase64Encoded: false,
    ...overrides,
  };
}

describe('fromAlbEvent', () => {
  it('lowercases header names and decodes query parameters', () => {
    const req = fromAlbEvent(
      albEvent({
        headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
        queryStringParameters: { 'fn%20name': 'demo%2Dfunction' },
      }),
    );
    expect(req.headers['authorization']).toBe('Bearer t');
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.query['fn name']).toBe('demo-function');
  });

  it('decodes base64-encoded bodies', () => {
    const req = fromAlbEvent(
      albEvent({
        httpMethod: 'POST',
        body: Buffer.from('{"a":1}').toString('base64'),
        isBase64Encoded: true,
      }),
    );
    expect(req.body).toBe('{"a":1}');
  });
});

describe('toAlbResult', () => {
  it('produces the ALB result shape with a JSON string body', () => {
    const result = toAlbResult({ status: 201, body: { id: 'x' } });
    expect(result).toEqual({
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: '{"id":"x"}',
      isBase64Encoded: false,
    });
  });
});
