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
