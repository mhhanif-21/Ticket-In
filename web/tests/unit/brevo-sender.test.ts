import { afterEach, describe, expect, it } from 'vitest';
import { getConfiguredBrevoSender } from '../../lib/services/brevo';

const originalSenderEmail = process.env.BREVO_SENDER_EMAIL;
const originalSenderName = process.env.BREVO_SENDER_NAME;

afterEach(() => {
  if (originalSenderEmail === undefined) delete process.env.BREVO_SENDER_EMAIL;
  else process.env.BREVO_SENDER_EMAIL = originalSenderEmail;
  if (originalSenderName === undefined) delete process.env.BREVO_SENDER_NAME;
  else process.env.BREVO_SENDER_NAME = originalSenderName;
});

describe('Brevo sender configuration', () => {
  it('uses the configured sender for transactional ticket email', () => {
    process.env.BREVO_SENDER_EMAIL = 'arctant2.5one@gmail.com';
    process.env.BREVO_SENDER_NAME = 'Arctant';

    expect(getConfiguredBrevoSender()).toEqual({
      email: 'arctant2.5one@gmail.com',
      name: 'Arctant',
    });
  });

  it('fails closed when the sender email is missing', () => {
    delete process.env.BREVO_SENDER_EMAIL;
    expect(() => getConfiguredBrevoSender()).toThrow('BREVO_SENDER_EMAIL is not defined');
  });
});
