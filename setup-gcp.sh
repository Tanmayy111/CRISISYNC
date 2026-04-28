#!/bin/bash
# setup-gcp.sh
# Run this ONCE to set up your Google Cloud infrastructure
# Make sure you've run: gcloud auth login && gcloud config set project YOUR_PROJECT_ID

PROJECT_ID="your-gcp-project-id"
REGION="us-central1"
TOPIC="crisis-alerts"
SUBSCRIPTION="crisis-dispatch-sub"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CrisisSync — GCP Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Enable required APIs
echo "→ Enabling APIs..."
gcloud services enable pubsub.googleapis.com \
                        cloudfunctions.googleapis.com \
                        firebasedatabase.googleapis.com \
                        cloudbuild.googleapis.com \
                        --project=$PROJECT_ID

# 2. Create Pub/Sub topic
echo "→ Creating Pub/Sub topic: $TOPIC"
gcloud pubsub topics create $TOPIC --project=$PROJECT_ID

# 3. Create subscription (for manual testing / monitoring)
echo "→ Creating subscription: $SUBSCRIPTION"
gcloud pubsub subscriptions create $SUBSCRIPTION \
  --topic=$TOPIC \
  --project=$PROJECT_ID \
  --ack-deadline=60

# 4. Set IAM permissions for Cloud Functions to use Pub/Sub
echo "→ Setting IAM permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

# 5. Deploy the Cloud Function
echo "→ Deploying dispatch Cloud Function..."
gcloud functions deploy dispatchCrisisAlert \
  --gen2 \
  --runtime=nodejs20 \
  --source=. \
  --entry-point=dispatchCrisisAlert \
  --trigger-topic=$TOPIC \
  --region=$REGION \
  --project=$PROJECT_ID \
  --set-env-vars="GEMINI_API_KEY=your-gemini-key-here" \
  --memory=256MB \
  --timeout=60s

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo "  Topic: projects/$PROJECT_ID/topics/$TOPIC"
echo "  Function: dispatchCrisisAlert"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
