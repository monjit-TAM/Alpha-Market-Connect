import sgMail from "@sendgrid/mail";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=sendgrid",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  if (
    !connectionSettings ||
    !connectionSettings.settings.api_key ||
    !connectionSettings.settings.from_email
  ) {
    throw new Error("SendGrid not connected");
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    email: connectionSettings.settings.from_email,
  };
}

async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email,
  };
}

const NOTIFICATION_EMAIL = "monjit.gogoi@gmail.com";

export async function sendRegistrationNotification(userData: {
  username: string;
  email: string;
  phone?: string;
  role: string;
  companyName?: string;
  sebiRegNumber?: string;
  sebiCertUrl?: string;
}) {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    const isAdvisor = userData.role === "advisor";
    const subject = isAdvisor
      ? `New Advisor Registration: ${userData.companyName || userData.username}`
      : `New Investor Registration: ${userData.username}`;

    let html = `
      <h2>New ${isAdvisor ? "Advisor" : "Investor"} Registration on AlphaMarket</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Username</td><td style="padding: 8px; border: 1px solid #ddd;">${userData.username}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td><td style="padding: 8px; border: 1px solid #ddd;">${userData.email}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Phone</td><td style="padding: 8px; border: 1px solid #ddd;">${userData.phone || "N/A"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Role</td><td style="padding: 8px; border: 1px solid #ddd;">${userData.role}</td></tr>
    `;

    if (isAdvisor) {
      html += `
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Company</td><td style="padding: 8px; border: 1px solid #ddd;">${userData.companyName || "N/A"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">SEBI Reg Number</td><td style="padding: 8px; border: 1px solid #ddd;">${userData.sebiRegNumber || "N/A"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Certificate</td><td style="padding: 8px; border: 1px solid #ddd;">${userData.sebiCertUrl ? "Uploaded" : "Not uploaded"}</td></tr>
      `;
    }

    html += `</table>`;

    if (isAdvisor) {
      html += `<p style="margin-top: 16px; color: #b45309;">This advisor requires admin approval before their profile becomes public. Please log in to the Admin Panel to review.</p>`;
    }

    await client.send({
      to: NOTIFICATION_EMAIL,
      from: fromEmail,
      subject,
      html,
    });

    console.log(`Registration notification sent to ${NOTIFICATION_EMAIL}`);
  } catch (err) {
    console.error("Failed to send registration notification email:", err);
  }
}

export async function sendUserWelcomeEmail(userData: {
  email: string;
  username: string;
  role: string;
  companyName?: string;
}) {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    const isAdvisor = userData.role === "advisor";

    const subject = isAdvisor
      ? "Welcome to AlphaMarket - Advisor Registration Received"
      : "Welcome to AlphaMarket!";

    let html = `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <h2 style="color: #333;">Welcome to AlphaMarket, ${userData.companyName || userData.username}!</h2>
    `;

    if (isAdvisor) {
      html += `
        <p>Thank you for registering as an advisor on AlphaMarket.</p>
        <p>Your account has been created successfully. Our admin team will review your registration and SEBI credentials. You will be able to access your dashboard and start creating strategies once your account is approved.</p>
        <p style="color: #b45309; font-weight: bold;">Your account is currently pending admin approval.</p>
      `;
    } else {
      html += `
        <p>Thank you for joining AlphaMarket! Your account has been created successfully.</p>
        <p>You can now browse investment strategies from SEBI-registered advisors and subscribe to the ones that match your investment goals.</p>
      `;
    }

    html += `
        <p>Your login username is: <strong>${userData.username}</strong></p>
        <p style="color: #666; font-size: 12px;">If you did not create this account, please ignore this email.</p>
      </div>
    `;

    await client.send({
      to: userData.email,
      from: fromEmail,
      subject,
      html,
    });

    console.log(`Welcome email sent to ${userData.email}`);
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }
}

export async function sendPasswordResetEmail(email: string, resetToken: string, appUrl: string) {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    const resetLink = `${appUrl}/reset-password?token=${resetToken}`;

    const html = `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>We received a request to reset your password on AlphaMarket.</p>
        <p>Click the button below to set a new password. This link will expire in 1 hour.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetLink}" style="background-color: #c53030; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
        <p style="color: #999; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser: ${resetLink}</p>
      </div>
    `;

    await client.send({
      to: email,
      from: fromEmail,
      subject: "AlphaMarket - Password Reset",
      html,
    });

    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (err) {
    console.error("Failed to send password reset email:", err);
    return false;
  }
}
