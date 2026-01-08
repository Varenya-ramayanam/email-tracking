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
    /**
     * 1. THE NEW QUERY STRATEGY
     * We remove 'after:UNIX' entirely. 
     * We use 'newer_than:7d' to ensure we catch everything from the past week.
     * Gmail's search is smart; even if we scan the same email twice, 
     * our Firestore check (below) will prevent duplicates.
     */
    const gmailQuery = '(shortlisted OR interview OR "congratulations") -label:trash -label:spam newer_than:7d';

    console.log(`🔎 [PROD FULL SCAN] Running for user: ${userId}`);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 15 // Increased to 15 to catch more recent threads
    });

    const messages = response.data.messages || [];
    const results = [];

    if (messages.length === 0) {
      console.log(`ℹ️ Gmail returned 0 messages for query.`);
      return res.status(200).json({ message: "No new updates found", results: [] });
    }

    for (const msg of messages) {
      try {
        // 2. CHECK FOR DUPLICATES IN FIRESTORE
        // Before processing with Gemini (which costs tokens), check if we already saved this ID
        const alreadyProcessed = await db.collection('job_applications')
          .where('userId', '==', userId)
          .where('gmailId', '==', msg.id)
          .get();

        if (!alreadyProcessed.empty) {
          console.log(`⏩ Skipping already processed email: ${msg.id}`);
          continue;
        }

        const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
        
        let body = "";
        const payload = email.data.payload;
        if (payload.parts) {
          body = Buffer.from(payload.parts[0].body.data || "", 'base64').toString();
        } else if (payload.body && payload.body.data) {
          body = Buffer.from(payload.body.data, 'base64').toString();
        }

        const snippet = email.data.snippet || "";
        const contentToAnalyze = body.length > 20 ? body : snippet;

        // Simple filter to reduce Gemini API calls
        const lowerContent = contentToAnalyze.toLowerCase();
        if (lowerContent.includes("interview") || lowerContent.includes("shortlisted")) {
          
          const interviewData = await analyzeInterviewDetails(contentToAnalyze);

          if (interviewData) {
            const cal = await addToCalendar(auth, interviewData);
            
            // 3. SAVE WITH GMAIL ID
            await db.collection('job_applications').add({
              userId,
              gmailId: msg.id, // Stored to prevent duplicate processing on next scan
              company: interviewData.company,
              status: "Shortlisted",
              level: interviewData.level || "Interview",
              snippet: snippet,
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

    res.status(200).json({ 
      success: true,
      message: `Scan complete. Found ${results.length} new items.`, 
      results 
    });

  } catch (err) {
    console.error("🚨 PROD FATAL ERROR:", err);
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: err.message 
    });
  }
};

module.exports = { processUserEmails };