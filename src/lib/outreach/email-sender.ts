import { Resend } from "resend";
import { randomUUID } from "crypto";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendOutreachEmail(params: {
  to: string;
  from: string;
  subject: string;
  body: string;
  leadId: string;
  unsubscribeToken?: string;
}) {
  const { to, from, subject, body, leadId } = params;
  const token = params.unsubscribeToken ?? randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const unsubscribeUrl = `${appUrl}/api/unsubscribe/${token}`;

  const result = await getResend().emails.send({
    from,
    to,
    subject,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        ${body.split("\n").map((line) => `<p style="margin: 0 0 12px 0; line-height: 1.6;">${line}</p>`).join("")}
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
        <p style="font-size: 12px; color: #999;">
          <a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe</a>
        </p>
      </div>
    `,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  return { result, unsubscribeToken: token };
}
