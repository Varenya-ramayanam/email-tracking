const { google } = require('googleapis');
const db = require('../config/firebase');
const admin = require('firebase-admin'); 
const { analyzeInterviewDetails } = require('../services/geminiService');
const { addToCalendar } = require('../services/calendarService');

const processUserEmails = async (req, res) => {
  const { accessToken, userId } = req.body;

  if (!accessToken || !userId) {
    return res.status(400).json({ error: "Access Token and UserID are required" });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    let gmailQuery = '(shortlisted OR interview OR "congratulations") -label:trash -label:spam';
    let lastSyncUnix = null;

    if (userDoc.exists && userDoc.data().lastSyncUnix) {
      lastSyncUnix = userDoc.data().lastSyncUnix;

      // 10-minute buffer to avoid Gmail indexing delays
      const safeAfter = lastSyncUnix - 600;
      gmailQuery += ` after:${safeAfter}`;

      console.log(`🕒 Last Sync (UNIX): ${lastSyncUnix}`);
    } else {
      gmailQuery += ` newer_than:30d`;
    }

    console.log(`🔎 PROD SYNC | Query: ${gmailQuery}`);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 5
    });

    const messages = response.data.messages || [];
    const results = [];

    if (messages.length === 0) {
      console.log(`ℹ️ No new emails found. Keeping sync window open.`);
      return res.status(200).json({ message: "No new updates found", results: [] });
    }

    let maxEmailUnix = lastSyncUnix || 0;

    for (const msg of messages) {
      try {
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

        const emailUnix = Math.floor(Number(email.data.internalDate) / 1000);
        maxEmailUnix = Math.max(maxEmailUnix, emailUnix);

        let body = "";
        const payload = email.data.payload;

        if (payload.parts) {
          body = Buffer.from(payload.parts[0]?.body?.data || "", 'base64').toString();
        } else if (payload.body?.data) {
          body = Buffer.from(payload.body.data, 'base64').toString();
        }

        const snippet = email.data.snippet;
        const contentToAnalyze = body.length > 10 ? body : snippet;

        if (
          contentToAnalyze.toLowerCase().includes("interview") ||
          contentToAnalyze.toLowerCase().includes("shortlisted")
        ) {
          const interviewData = await analyzeInterviewDetails(contentToAnalyze);

          if (interviewData) {
            const cal = await addToCalendar(auth, interviewData);

            await db.collection('job_applications').add({
              userId,
              company: interviewData.company,
              status: "Shortlisted",
              level: interviewData.level || "Interview",
              snippet,
              calendarId: cal.id,
              processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            results.push({ company: interviewData.company, status: "Synced" });
          }
        }
      } catch (innerErr) {
        console.error(`⚠️ Error processing email ${msg.id}:`, innerErr.message);
      }
    }

    // ✅ Update sync ONLY after success
    await userRef.set({
      lastSyncUnix: maxEmailUnix,
      lastSync: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.status(200).json({
      success: true,
      message: `Processed ${results.length} updates`,
      results
    });

  } catch (err) {
    console.error("🚨 PROD FATAL ERROR:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};

module.exports = { processUserEmails };
