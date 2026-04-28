// dispatch.js  (Cloud Functions — index.js)
// Triggered automatically every time a message hits the crisis-alerts topic
// This is the BRAIN of CrisisSync

const functions = require("@google-cloud/functions-framework");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

// ─── Main Trigger ──────────────────────────────────────────────────────────
// Google Cloud automatically calls this when a Pub/Sub message arrives

functions.cloudEvent("dispatchCrisisAlert", async (cloudEvent) => {
  // Decode the Pub/Sub message (it arrives as base64)
  const raw = Buffer.from(cloudEvent.data.message.data, "base64").toString();
  const incident = JSON.parse(raw);

  console.log(`Dispatching incident: ${incident.id} | Type: ${incident.type}`);

  // Run all dispatch tasks in parallel (faster)
  await Promise.all([
    dispatchToStaff(incident),
    generate911Briefing(incident),
    scheduleEscalation(incident)
  ]);
});

// ─── Staff Dispatch ────────────────────────────────────────────────────────

async function dispatchToStaff(incident) {
  // Get all on-duty staff
  const staffSnap = await db.ref("crisisync/staff").once("value");
  const staffMap = staffSnap.val();

  // Filter: only notify roles that are required for this incident type
  const requiredRoles = incident.assignedRoles; // e.g. ["SECURITY", "MANAGER"]

  const notifications = [];

  for (const [staffId, staff] of Object.entries(staffMap)) {
    if (staff.status !== "ON_DUTY") continue;
    if (!requiredRoles.includes(staff.role)) continue;

    // Build a role-specific message
    const message = buildRoleMessage(staff.role, incident);

    // Send FCM push notification
    notifications.push(
      sendPushNotification(staff.fcmToken, message, incident)
    );

    // Update staff record: mark them as assigned to this incident
    notifications.push(
      db.ref(`crisisync/staff/${staffId}`).update({
        currentIncident: incident.id,
        status: "RESPONDING"
      })
    );

    // Add to audit log
    notifications.push(
      appendAuditLog(incident.id, {
        actor: "DISPATCH_ENGINE",
        action: "STAFF_NOTIFIED",
        detail: `${staff.name} (${staff.role}) dispatched to ${incident.location.floor}F`
      })
    );
  }

  await Promise.all(notifications);
}

// ─── Role-Specific Messages ────────────────────────────────────────────────
// Each role gets a different message — relevant to what THEY need to do

function buildRoleMessage(role, incident) {
  const loc = `Floor ${incident.location.floor}, Room ${incident.location.room}`;

  const templates = {
    SECURITY: {
      title: `🚨 ${incident.type} — Immediate Response Required`,
      body: `Proceed to ${loc}. Secure the area and await further instructions.`
    },
    MANAGER: {
      title: `⚠️ Incident Alert — ${incident.type}`,
      body: `Active incident at ${loc}. Open CrisisSync dashboard for live coordination.`
    },
    MEDICAL: {
      title: `🏥 Medical Standby — ${incident.type} at ${loc}`,
      body: `Prepare for possible casualties. Proceed to ${loc} or designated assembly point.`
    },
    HOUSEKEEPING: {
      title: `📢 Emergency Protocol — ${incident.type}`,
      body: `Assist guest evacuation on Floor ${incident.location.floor}. Use emergency exits.`
    }
  };

  return templates[role] || {
    title: `Emergency Alert — ${incident.type}`,
    body: `Incident at ${loc}. Check CrisisSync for details.`
  };
}

// ─── FCM Push Notification ─────────────────────────────────────────────────

async function sendPushNotification(fcmToken, message, incident) {
  const payload = {
    token: fcmToken,
    notification: {
      title: message.title,
      body: message.body
    },
    data: {
      incidentId: incident.id,
      type: incident.type,
      floor: String(incident.location.floor),
      severity: incident.severity
    },
    android: {
      priority: "high",
      notification: { sound: incident.silent ? "default" : "emergency_alert" }
    },
    apns: {
      payload: {
        aps: { sound: incident.silent ? "default" : "emergency_alert.caf", "content-available": 1 }
      }
    }
  };

  try {
    await admin.messaging().send(payload);
  } catch (err) {
    console.error(`FCM failed for token ${fcmToken}:`, err.message);
    // Don't throw — one failed notification shouldn't stop others
  }
}

// ─── 911 Auto-Briefing ─────────────────────────────────────────────────────
// Generates a structured packet for emergency services

async function generate911Briefing(incident) {
  // Get guest count for the affected floor
  const hotelSnap = await db.ref(`crisisync/hotel/floors/${incident.location.floor}`).once("value");
  const floorData = hotelSnap.val() || {};

  const briefing = {
    incidentId: incident.id,
    generatedAt: new Date().toISOString(),
    location: {
      venue: "Grand Horizon Hotel",
      address: "123 MG Road, Indore, MP",
      floor: incident.location.floor,
      room: incident.location.room,
      zone: incident.location.zone
    },
    emergency: {
      type: incident.type,
      severity: incident.severity,
      description: incident.description
    },
    occupancy: {
      guestsOnFloor: floorData.guestCount || "Unknown",
      emergencyExits: floorData.emergencyExits || []
    },
    hotelContact: {
      manager: "On-site manager notified",
      securityDeployed: true
    }
  };

  // Save briefing to Firebase (dashboard can display/print it)
  await db.ref(`crisisync/incidents/${incident.id}/briefing911`).set(briefing);

  // Audit log
  await appendAuditLog(incident.id, {
    actor: "SYSTEM",
    action: "911_BRIEFING_GENERATED",
    detail: `Briefing packet ready. Floor ${incident.location.floor}, ${floorData.guestCount} guests.`
  });

  return briefing;
}

// ─── Auto-Escalation ───────────────────────────────────────────────────────
// If incident isn't acknowledged in 3 minutes, escalate automatically

async function scheduleEscalation(incident) {
  // In production: use Cloud Tasks with a 3-minute delay
  // For demo: use setTimeout (works locally)
  setTimeout(async () => {
    const snap = await db.ref(`crisisync/incidents/${incident.id}/status`).once("value");
    const currentStatus = snap.val();

    if (currentStatus === "ACTIVE") {
      // Still unacknowledged — escalate
      await db.ref(`crisisync/incidents/${incident.id}`).update({
        severity: "CRITICAL",
        status: "ESCALATED"
      });

      await appendAuditLog(incident.id, {
        actor: "AUTO_ESCALATION",
        action: "SEVERITY_UPGRADED",
        detail: "No acknowledgement in 3 minutes. Severity upgraded to CRITICAL."
      });

      console.log(`Incident ${incident.id} auto-escalated to CRITICAL`);
    }
  }, 3 * 60 * 1000); // 3 minutes
}

// ─── Audit Log Helper ──────────────────────────────────────────────────────

async function appendAuditLog(incidentId, entry) {
  const logKey = `log_${Date.now()}`;
  await db.ref(`crisisync/incidents/${incidentId}/auditLog/${logKey}`).set({
    timestamp: new Date().toISOString(),
    ...entry
  });
}
