const { google } = require('googleapis');
const db = require('../config/firebase');
const admin = require('firebase-admin'); 
const { analyzeInterviewDetails } = require('../services/geminiService');
const { addToCalendar } = require('../services/calendarService');

const processUserEmails = async (req, res) => {
  const { accessToken, userId } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: "Access Token required" });
  }

  // Google Auth
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    console.log(`Processing emails for user: ${userId}`);

    const queryStr =
      '(shortlisted OR congratulations OR interview OR "application update") ' +
      '-label:trash -label:spam newer_than:30d';

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: queryStr,
      maxResults: 15
    });

    const messages = response.data.messages || [];
    const processedResults = [];

    if (messages.length === 0) {
      return res.status(200).json({
        message: "No relevant emails found",
        results: []
      });
    }

    /**
     * This stores the last processed interview signature
     * so we don’t create duplicate calendar events
     */
    let prevInterviewKey = "";

    for (const msg of messages) {
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id
      });

      const snippet = details.data.snippet || "";
      const lowerSnippet = snippet.toLowerCase();

      let status = "Pending";
      let calendarEvent = null;

      const isShortlisted =
        lowerSnippet.includes("congratulations") ||
        lowerSnippet.includes("shortlisted") ||
        lowerSnippet.includes("interview");

      const isRejected =
        lowerSnippet.includes("regret") ||
        lowerSnippet.includes("not moving forward") ||
        lowerSnippet.includes("thank you for your interest");

      if (isShortlisted) {
        status = "Shortlisted";

        console.log(`Shortlisted email found (ID: ${msg.id})`);

        // 🔹 Extract interview info via Gemini
        const interviewData = await analyzeInterviewDetails(snippet);

        if (interviewData && interviewData.date && interviewData.time) {
          /**
           * Create a stable comparison key
           * (Object comparison is NOT reliable)
           */
          const interviewKey = `${interviewData.company || ""}_${interviewData.date}_${interviewData.time}`;

          if (interviewKey !== prevInterviewKey) {
            console.log("New interview detected. Creating calendar event...");

            try {
              const calResponse = await addToCalendar(auth, interviewData);
              calendarEvent = calResponse.id;
              prevInterviewKey = interviewKey;

              console.log("Calendar event created:", calendarEvent);
            } catch (calErr) {
              console.error("Calendar creation failed:", calErr.message);
            }
          } else {
            console.log("Duplicate interview detected. Skipping calendar creation.");
          }
        }
      } else if (isRejected) {
        status = "Rejected";
      }

      // Save to Firestore
      const docData = {
        userId: userId || "anonymous",
        emailId: msg.id,
        status,
        snippet,
        calendarId: calendarEvent,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await db.collection('job_applications').add(docData);

      processedResults.push({
        id: docRef.id,
        status,
        emailId: msg.id
      });
    }

    res.status(200).json({
      message: "Processing complete",
      count: processedResults.length,
      results: processedResults
    });

  } catch (error) {
    console.error("Email Controller Error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  }
};

module.exports = { processUserEmails };
