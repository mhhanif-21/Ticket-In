import { sendEmail } from '../lib/services/brevo';
import { publishJob } from '../lib/services/qstash';

async function runTest() {
  console.log('--- Starting Smoke Test ---');
  
  // 1. Test Brevo
  try {
    console.log('Testing Brevo Email...');
    await sendEmail({
      to: [{ email: 'budi@example.com', name: 'Budi' }],
      subject: 'Test Event Gate Integrations',
      htmlContent: '<p>This is a smoke test from Event Gate local env.</p>',
    });
    console.log('✅ Brevo: Email sent successfully! Check your Brevo logs.');
  } catch (err: any) {
    console.error('❌ Brevo Failed:', err.message);
  }

  // 2. Test QStash
  try {
    console.log('\nTesting QStash Job Publish...');
    const result = await publishJob({
      // Ini 1 arah ke URL palsu, tapi akan masuk log Upstash.
      url: 'https://example.com/api/test-webhook', 
      body: { test: 'hello world from Event Gate smoke test' }
    });
    console.log('✅ QStash: Job published successfully! Check your Upstash logs.');
    console.log('Job ID:', 'messageId' in result ? result.messageId : 'unavailable');
  } catch (err: any) {
    console.error('❌ QStash Failed:', err.message);
  }

  console.log('\n--- Smoke Test Finished ---');
}

runTest();
