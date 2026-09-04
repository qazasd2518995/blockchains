import { describe, expect, it } from 'vitest';
import { CaptchaService } from './captcha.js';

function answerFromImage(image: string): string {
  const encoded = image.split(',')[1] ?? '';
  const svg = Buffer.from(encoded, 'base64').toString('utf8');
  return [...svg.matchAll(/<text[^>]*>(\d)<\/text>/g)].map((match) => match[1]).join('');
}

describe('CaptchaService', () => {
  it('returns an image without exposing the answer as a JSON field', () => {
    const challenge = new CaptchaService().issue();

    expect(challenge.captchaImage).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(answerFromImage(challenge.captchaImage)).toMatch(/^\d{4}$/);
    expect(challenge).not.toHaveProperty('captchaCode');
  });

  it('allows one valid attempt and rejects token replay', () => {
    const service = new CaptchaService();
    const challenge = service.issue();
    const answer = answerFromImage(challenge.captchaImage);

    expect(() => service.verify(answer, challenge.captchaToken)).not.toThrow();
    expect(() => service.verify(answer, challenge.captchaToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_CAPTCHA' }),
    );
  });

  it('consumes the challenge after an incorrect answer', () => {
    const service = new CaptchaService();
    const challenge = service.issue();
    const answer = answerFromImage(challenge.captchaImage);
    const wrong = answer === '0000' ? '9999' : '0000';

    expect(() => service.verify(wrong, challenge.captchaToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_CAPTCHA' }),
    );
    expect(() => service.verify(answer, challenge.captchaToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_CAPTCHA' }),
    );
  });
});
