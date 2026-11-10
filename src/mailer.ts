export type Mail = { to: string; subject: string; text: string };
export interface Mailer { send(mail: Mail): Promise<void> }

/** Resend over plain fetch. Throws on non-2xx so the caller doesn't mark the alert as sent. */
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send({ to, subject, text }) {
      if (!apiKey) return console.warn(`[mail skipped, no RESEND_API_KEY] ${to}: ${subject}`);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    },
  };
}
