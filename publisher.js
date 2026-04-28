// publisher.js
// Runs on your backend (Node.js server or Cloud Run)
// This is the ENTRY POINT — every alert flows through here first

const { PubSub } = require("@google-cloud/pubsub");
const admin = require("firebase-admin");

const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID || "your-gcp-project-id" });
const TOPIC_NAME = "crisis-alerts";

// ─── Main Publisher Function ───────────────────────────────────────────────

async function publishAlert(alertData) {
  // Step 1: Classify the alert using Gemini AI
  const classified = await classifyWithGemini(alertData);

  // Step 2: Build the full incident payload
  const incident = buildIncident(alertData, classified);

  // Step 3: Write incident to Firebase immediately
  //         (dashboard lights up the moment alert is received)
  await writeIncidentToFirebase(incident);

  // Step 4: Publish to Pub/Sub so Cloud Functions can dispatch roles
  const messageBuffer = Buffer.from(JSON.stringify(incident));
  const messageId = await pubsub.topic(TOPIC_NAME).publish(messageBuffer);

  console.log(`Alert published | Incident: ${incident.id} | MsgID: ${messageId}`);
  return incident;
}

// ─── Gemini Classification ─────────────────────────────────────────────────

async function classifyWithGemini(alertData) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=" + process.env.GEMINI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Classify this hotel emergency alert. Respond ONLY with JSON.
          Alert: "${alertData.description}"
          
          Return exactly:
          {
            "type": "FIRE | MEDICAL | SECURITY | EVACUATION | UNKNOWN",
            "severity": "LOW | MEDIUM | HIGH | CRITICAL",
            "roles": ["SECURITY", "MANAGER", "MEDICAL"],
            "confidence": 0.0-1.0
          }`
        }]
      }]
    })
  });

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    // Fallback if Gemini response is unexpected
    return {
      type: "UNKNOWN",
      severity: "HIGH",
      roles: ["SECURITY", "MANAGER"],
      confidence: 0.5
    };
  }
}

// ─── Incident Builder ──────────────────────────────────────────────────────

function buildIncident(alertData, classified) {
  const id = alertData.incidentId || `INC-${Date.now()}`;
  return {
    id,
    type: classified.type,
    severity: classified.severity,
    status: "ACTIVE",
    silent: alertData.silent || false,
    photoCount: alertData.photoCount || 0,
    location: {
      floor: alertData.floor,
      room: alertData.room || null,
      zone: alertData.location || "Unknown"
    },
    reportedBy: {
      role: alertData.reporterRole || "GUEST",
      name: alertData.reporterName || "Anonymous",
      device: alertData.device || "WEB-SOS"
    },
    description: alertData.description,
    assignedRoles: classified.roles,
    aiConfidence: classified.confidence,
    timestamps: {
      reported: alertData.timestamp || new Date().toISOString(),
      acknowledged: null,
      resolved: null
    },
    auditLog: {
      [`log_${Date.now()}`]: {
        timestamp: new Date().toISOString(),
        actor: "SYSTEM",
        action: "INCIDENT_CREATED",
        detail: `Alert classified as ${classified.type} by Gemini AI (confidence: ${classified.confidence})`
      }
    }
  };
}

// ─── Firebase Write ────────────────────────────────────────────────────────

async function writeIncidentToFirebase(incident) {
  const db = admin.database();

  // Write the full incident
  await db.ref(`crisisync/incidents/${incident.id}`).set(incident);

  // Update dashboard counters (triggers live update on all open dashboards)
  await db.ref("crisisync/dashboard").update({
    activeIncidents: admin.database.ServerValue.increment(1),
    lastUpdated: new Date().toISOString(),
    systemStatus: "ALERT"
  });
}

module.exports = { publishAlert };
