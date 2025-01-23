import "./sentry";

import * as Sentry from "@sentry/node";
import cors, { CorsOptions } from "cors";
import "dotenv/config";
import express from "express";
import morgan from "morgan";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    const allowedDomains = [
      "https://upheldministries.org", // Main domain
    ];

    // Allow any subdomain of upheldministries.org
    const regex = /^https:\/\/([a-zA-Z0-9-]+\.)?upheldministries\.org$/;

    // Allow localhost in development mode
    if (process.env.NODE_ENV === "development" && origin?.startsWith("http://localhost")) {
      return callback(null, true);
    }

    // Allow main domain or any matching subdomain
    if (allowedDomains.includes(origin as string) || (origin && regex.test(origin))) {
      return callback(null, true);
    }

    // Reject other origins
    callback(new Error("Not allowed by CORS"));
  },
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("tiny"));

const clients = [
  {
    id: "136cf087-2d7e-4494-86b8-4aee13f0f3d0",
    name: "Upheld Ministries",
    email: "paulh.morris@gmail.com",
  },
];

app.post("/api/v1/connect", async (req, res) => {
  try {
    const formData = req.body;
    const clientId = formData.clientId;
    const cfResponse = formData["cf-turnstile-response"];

    delete formData.clientId;
    delete formData["cf-turnstile-response"];

    if (!clientId) {
      res.status(400).json({ message: "Client ID is required." });
      return;
    }

    if (!cfResponse) {
      res.status(400).json({ message: "Turnstile response is required." });
      return;
    }

    // Transform formData: change "on" to "yes" and convert keys to readable text
    const transformedData = Object.entries(formData)
      .filter(([key, value]) => typeof value !== "undefined" && value !== "")
      .reduce((acc, [key, value]) => {
        const readableKey = camelCaseToReadable(key);
        const transformedValue = value === "on" ? "Yes" : value;
        // @ts-ignore
        acc[readableKey] = Array.isArray(transformedValue)
          ? transformedValue.map((v) => (v === "on" ? "Yes" : v))
          : transformedValue;
        return acc;
      }, {} as Record<string, string | string[]>);

    // Validate Cloudflare Turnstile
    const turnstileVerify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${process.env.CF_SECRET_KEY}&response=${cfResponse}`,
    });

    const turnstileResult = await turnstileVerify.json();

    if (!turnstileResult.success) {
      res.status(400).json({ message: "Verification failed." });
      return;
    }

    const htmlBody = `
      <h2>New Form Submission</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Field</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Value</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(transformedData)
            .map(
              ([key, value]) => `
                <tr>
                  <td style="border: 1px solid #ddd; padding: 8px;">${key}</td>
                  <td style="border: 1px solid #ddd; padding: 8px;">${
                    Array.isArray(value) ? value.join(", ") : value
                  }</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;

    // Send the email
    const client = clients.find((client) => client.id === clientId);
    if (!client) {
      res.status(400).json({ message: "Invalid client ID." });
      return;
    }

    const { error } = await resend.emails.send({
      from: `${client.name} <forms@getcosmic.dev>`,
      to: client.email,
      subject: "New Form Submission!",
      html: htmlBody,
    });

    if (error) {
      throw error;
    }

    res.status(200).json({ message: "Form submission emailed successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ message: "An error occurred while sending the email." });
  }
});

Sentry.setupExpressErrorHandler(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

function camelCaseToReadable(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Add space before uppercase letters
    .replace(/([A-Za-z])(\d)/g, "$1 $2") // Add space before numbers
    .replace(/(\d)([A-Za-z])/g, "$1 $2") // Add space after numbers
    .replace(/^\w/, (c) => c.toUpperCase()); // Capitalize the first letter
}
