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
    
    if (userDoc.exists && userDoc.data().lastSync) {
      const lastSync = userDoc.data().lastSync;
      // Keeping your logic: Subtracting 300 seconds (5 mins)
      const unixSeconds = Math.floor(lastSync.toDate().getTime() / 1000) - 300;
      gmailQuery += ` after:${unixSeconds}`;
    } else {
      gmailQuery += ` newer_than:30d`;
    }

    // CRITICAL FOR PROD: Log the exact query to check if the timestamp is in the future
    console.log(`🔎 PROD QUERY for ${userId}: ${gmailQuery}`);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 5
    });

    const messages = response.data.messages || [];
    const results = [];

    const currentSyncTimestamp = admin.firestore.FieldValue.serverTimestamp();

    if (messages.length === 0) {
      console.log(`ℹ️ Gmail returned 0 messages for query: ${gmailQuery}`);
      await userRef.set({ lastSync: currentSyncTimestamp }, { merge: true });
      return res.status(200).json({ message: "No new updates found", results: [] });
    }

    for (const msg of messages) {
      try {
        const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
        
        let body = "";
        const payload = email.data.payload;
        if (payload.parts) {
          body = Buffer.from(payload.parts[0].body.data || "", 'base64').toString();
        } else if (payload.body && payload.body.data) {
          body = Buffer.from(payload.body.data, 'base64').toString();
        }

        const snippet = email.data.snippet;
        const contentToAnalyze = body.length > 10 ? body : snippet;

        if (contentToAnalyze.toLowerCase().includes("interview") || 
            contentToAnalyze.toLowerCase().includes("shortlisted")) {
          
          // If GEMINI_API_KEY is missing in prod, this will throw an error
          const interviewData = await analyzeInterviewDetails(contentToAnalyze);

          if (interviewData) {
            const cal = await addToCalendar(auth, interviewData);
            
            await db.collection('job_applications').add({
              userId,
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
        // Logs exactly which email failed and why
        console.error(`⚠️ Email processing error [${msg.id}]:`, innerErr.message);
      }
    }

    await userRef.set({ lastSync: currentSyncTimestamp }, { merge: true });

    res.status(200).json({ 
      success: true,
      message: `Processed ${results.length} updates`, 
      results 
    });

  } catch (err) {
    // In Production, this will tell you if it's a 401 Unauthorized or 403 Forbidden
    console.error("🚨 PROD FATAL ERROR:", err);
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: err.message 
    });
  }
};

module.exports = { processUserEmails };