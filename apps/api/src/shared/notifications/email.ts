import nodemailer from "nodemailer";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env["SMTP_HOST"] ?? "localhost",
    port: Number(process.env["SMTP_PORT"] ?? 1025),
    secure: false,
    // No auth for MailHog (local dev). SES uses IAM credentials at the transport level.
  });
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const from = process.env["SMTP_FROM"] ?? "noreply@l2l.local";
  const transport = createTransport();

  await transport.sendMail({
    from,
    to,
    subject: "Reset your L2L password",
    text: [
      "You requested a password reset for your L2L account.",
      "",
      `Reset link (expires in 1 hour): ${resetLink}`,
      "",
      "If you did not request this, ignore this email — your password has not changed.",
    ].join("\n"),
    html: `
      <p>You requested a password reset for your L2L account.</p>
      <p><a href="${resetLink}">Reset your password</a> (expires in 1 hour)</p>
      <p>If you did not request this, ignore this email — your password has not changed.</p>
    `,
  });
}
