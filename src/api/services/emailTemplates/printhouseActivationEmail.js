/**
 * src/api/services/emailTemplates/printhouseActivationEmail.js
 * 
 * Renders HTML and plain text email templates for Printhouse activation.
 */
function renderActivationEmail({ email, activationUrl, expiresAt }) {
    const expiresFormatted = new Date(expiresAt).toUTCString();
    
    const text = `Welcome to PrintPrice!

Please activate your PrintPrice account by opening the following secure link in your browser:

${activationUrl}

This activation link will expire on ${expiresFormatted}.

If you did not request this account registration, you can safely ignore this email.`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Activate your PrintPrice account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
    <h2 style="color: #ffffff; margin-top: 0; font-size: 24px; font-weight: 700; text-align: center;">Welcome to PrintPrice</h2>
    <p style="color: #a1a1aa; font-size: 15px; line-height: 1.6;">You're almost there! Click the button below to activate your account and access your Printhouse workspace.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${activationUrl}" style="background-color: #dc0000; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Activate My Account</a>
    </div>
    <p style="color: #71717a; font-size: 13px; line-height: 1.5; margin-top: 24px;">Link not working? Copy and paste this URL into your browser:<br>
      <a href="${activationUrl}" style="color: #dc0000; word-break: break-all;">${activationUrl}</a>
    </p>
    <p style="color: #52525b; font-size: 12px; margin-top: 32px; border-top: 1px solid #27272a; padding-top: 16px;">This activation link expires on <strong>${expiresFormatted}</strong>. If you did not request this email, please ignore it.</p>
  </div>
</body>
</html>`;

    return { text, html, subject: 'Activate your PrintPrice account' };
}

module.exports = { renderActivationEmail };
