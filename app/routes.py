from __future__ import annotations

from fastapi import APIRouter, Request, Form, Response
from typing import Any, List
from .db import tidb
from .services import GoogleService, GmailService, TwilioService, OpenAIService
from .report_processor import MedicalReportProcessor
from .ai_agent import OncoAssistAI
from .notification_service import NotificationService
from .vector_service import vector_service
from .enhanced_db_schema import enhanced_schema
import os
import warnings
import logging
from pathlib import Path
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# Cleaned up scopes - removed duplicates and ordered consistently
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile", 
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
]

def _select(sql: str, params: tuple[Any, ...] = ()) -> List[dict[str, Any]]:
    conn = tidb.connection()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []
    return rows  # type: ignore


@router.get("/patients")
def get_patients() -> dict[str, Any]:
    try:
        rows = _select("SELECT * FROM patients ORDER BY created_at DESC")
        return {"success": True, "patients": rows, "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/reports")
def get_reports() -> dict[str, Any]:
    try:
        rows = _select("SELECT * FROM medical_documents ORDER BY timestamp DESC")
        return {"success": True, "reports": rows, "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/medicines")
def get_medicines() -> dict[str, Any]:
    try:
        rows = _select("SELECT * FROM medicines ORDER BY created_at DESC")
        return {"success": True, "medicines": rows, "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/medicine-prices")
def get_medicine_prices() -> dict[str, Any]:
    try:
        rows = _select("SELECT * FROM medicine_prices ORDER BY last_updated DESC")
        return {"success": True, "medicinePrices": rows, "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/patient-alerts")
def get_patient_alerts() -> dict[str, Any]:
    try:
        rows = _select("SELECT * FROM patient_alerts ORDER BY sent_at DESC")
        return {"success": True, "patientAlerts": rows, "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/search")
def search(q: str = "", type: str | None = None, limit: int = 5) -> dict[str, Any]:
    try:
        if limit <= 0:
            limit = 5
        sql = "SELECT * FROM medical_documents"
        params: list[Any] = []
        clauses: list[str] = []
        if q:
            clauses.append("content LIKE %s")
            params.append(f"%{q}%")
        if type:
            clauses.append("type = %s")
            params.append(type)
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += f" ORDER BY timestamp DESC LIMIT {int(limit)}"
        rows = _select(sql, tuple(params))
        return {"success": True, "results": rows, "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/seed-data")
def seed_data() -> dict[str, Any]:
    try:
        conn = tidb.connection()
        with conn.cursor() as cur:
            # patients
            cur.execute(
                """
                INSERT IGNORE INTO patients (id, name, age, gender, diagnosis, stage, contact_info)
                VALUES 
                ('p1','Alice Johnson',45,'Female','Breast Cancer','IIA','{"phone":"+1234567890"}'),
                ('p2','Bob Singh',52,'Male','Lung Cancer','III','{"phone":"+1987654321"}'),
                ('p3','Carol Lee',39,'Female','Lymphoma','I','{"phone":"+14150000000"}')
                """
            )

            # medical_documents with embeddings (mock if no OpenAI key)
            docs = [
                ("doc1", "Hemoglobin 12.5 g/dL; WBC 4500/µL", "blood_test", "gmail", "Alice Johnson", "p1"),
                ("doc2", "PET/CT shows FDG-avid lesion in right breast", "radiology", "drive", "Alice Johnson", "p1"),
                ("doc3", "Invoice for chemotherapy session", "invoice", "gmail", "Bob Singh", "p2"),
            ]
            ai = OpenAIService()
            for did, content, dtype, src, pname, pid in docs:
                vec = ai.embed(content)
                vec_text = "[" + ",".join(str(x) for x in vec) + "]"
                cur.execute(
                    """
                    INSERT IGNORE INTO medical_documents (id, content, embedding, type, source, patient_name, patient_id, metadata)
                    VALUES (%s, %s, VEC_FROM_TEXT(%s), %s, %s, %s, %s, '{"note":"seed"}')
                    """,
                    (did, content, vec_text, dtype, src, pname, pid),
                )

            # medicines
            cur.execute(
                """
                INSERT IGNORE INTO medicines (id, patient_id, drug_name, dosage, frequency)
                VALUES
                ('m1','p1','Tamoxifen','20mg','daily'),
                ('m2','p2','Pembrolizumab','200mg','q3w')
                """
            )

            # medicine_prices
            cur.execute(
                """
                INSERT INTO medicine_prices (drug_name, url, lowest_price, price_update_date)
                VALUES
                ('Tamoxifen','https://www.goodrx.com/tamoxifen','$12','2024-01-01'),
                ('Pembrolizumab','https://www.goodrx.com/pembrolizumab','$1800','2024-01-02')
                ON DUPLICATE KEY UPDATE lowest_price=VALUES(lowest_price), price_update_date=VALUES(price_update_date)
                """
            )

            # patient_alerts
            cur.execute(
                """
                INSERT INTO patient_alerts (patient_phone, message, alert_type, severity, report_id)
                VALUES
                ('+1234567890','Test blood alert','blood_test','medium', 'doc1'),
                ('+1987654321','Scan result ready','scan_result','low', 'doc2')
                """
            )

        return {
            "status": "success",
            "message": "Test data seeded successfully!",
            "data": {"patients": 3, "medicalDocuments": 3, "medicines": 2, "medicinePrices": 2, "patientAlerts": 2},
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.post("/reembed")
def reembed_documents() -> dict[str, Any]:
    try:
        rows = _select("SELECT id, content FROM medical_documents")
        ai = OpenAIService()
        conn = tidb.connection()
        updated = 0
        with conn.cursor() as cur:
            for r in rows:
                vec = ai.embed(r["content"] or "")
                vec_text = "[" + ",".join(str(x) for x in vec) + "]"
                cur.execute(
                    "UPDATE medical_documents SET embedding = VEC_FROM_TEXT(%s) WHERE id = %s",
                    (vec_text, r["id"]),
                )
                updated += 1
        return {"status": "success", "updated": updated}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.post("/embed")
def create_embedding(payload: dict[str, Any]) -> dict[str, Any]:
    text = payload.get("text") or ""
    if not text:
        return {"error": "text is required"}
    ai = OpenAIService()
    vec = ai.embed(text)
    return {"embedding": vec[:8], "dimension": len(vec)}


@router.post("/search/vector")
def vector_search(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        query = payload.get("query") or ""
        doc_type = payload.get("type")
        limit = int(payload.get("limit") or 5)
        ai = OpenAIService()
        vec = ai.embed(query)
        vec_text = "[" + ",".join(str(x) for x in vec) + "]"
        sql = (
            "SELECT id, content, type, source, patient_name, patient_id, timestamp, "
            "VEC_COSINE_DISTANCE(embedding, VEC_FROM_TEXT(%s)) AS distance "
            "FROM medical_documents"
        )
        params: list[Any] = [vec_text]
        if doc_type:
            sql += " WHERE type = %s"
            params.append(doc_type)
        sql += f" ORDER BY distance ASC LIMIT {int(limit)}"
        rows = _select(sql, tuple(params))
        for r in rows:
            if "distance" in r and isinstance(r["distance"], (int, float)):
                r["similarity"] = 1 - float(r["distance"])  # cosine similarity
        return {"success": True, "results": rows, "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/test-google")
def test_google() -> dict[str, Any]:
    gs = GoogleService()
    return {"status": "success", "configured": gs.is_configured()}


@router.get("/test-gmail")
def test_gmail() -> dict[str, Any]:
    gm = GmailService()
    if not gm.is_configured():
        return {"error": "Gmail not configured"}
    msgs = gm.get_unread(5)
    print(msgs)
    return {"status": "success", "messagesFound": len(msgs)}


@router.get("/test-twilio")
def test_twilio() -> dict[str, Any]:
    tw = TwilioService()
    try:
        sms_id = tw.send_sms("+1234567890", "Test from Python API")
        wa_id = tw.send_whatsapp("+1234567890", "Test WhatsApp from Python API")
        return {"status": "success", "sms": sms_id, "whatsapp": wa_id, "configured": tw.is_configured()}
    except Exception as e:
        return {"status": "error", "configured": tw.is_configured(), "message": str(e)}


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(Body: str = Form(""), From: str = Form(""), To: str = Form(""), ProfileName: str = Form("")):
    """Enhanced WhatsApp webhook with AI agent integration"""
    try:
        # Extract phone number from 'whatsapp:+1234567890' format
        phone_number = From.replace("whatsapp:", "") if From.startswith("whatsapp:") else From
        message = Body or ""
        patient_name = ProfileName or None
        
        # Use AI agent for intelligent responses
        ai_agent = OncoAssistAI()
        reply = ai_agent.process_patient_message(message, phone_number, patient_name)
        
    except Exception as e:
        logger.error(f"WhatsApp webhook error: {e}")
        reply = "Sorry, I'm having trouble processing your message. Please try again later or contact your care team."
    
    xml = f"""
        <Response>
          <Message>{reply}</Message>
        </Response>
    """
    return Response(content=xml.strip(), media_type="text/xml")


@router.post("/test-google-docs")
def test_google_docs(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        title = payload.get("title") or "Test Medical Report"
        content = payload.get("content") or "Sample content from FastAPI"
        report_type = payload.get("reportType") or "blood_test"
        folder_id = payload.get("folderId") or ""

        gs = GoogleService()
        if not gs.is_configured():
            return {"error": "Google service not configured"}
        doc_id = gs.create_document(title, folder_id or None)
        header = "BLOOD TEST REPORT" if report_type == "blood_test" else "RADIOLOGY REPORT"
        gs.update_document(doc_id, f"{header}\n\n{content}")
        return {"status": "success", "documentId": doc_id, "title": title, "reportType": report_type}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/test-google-sheets")
def test_google_sheets() -> dict[str, Any]:
    try:
        # Placeholder: simply confirm Sheets client is available
        gs = GoogleService()
        return {"status": "success", "sheetsConfigured": gs.is_configured()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def create_oauth_flow():
    """Create OAuth flow with proper error handling"""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/auth/google")
    
    if not client_id or not client_secret:
        raise ValueError("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET")
    
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uris": [redirect_uri],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = redirect_uri
    return flow, redirect_uri


# Google OAuth 2.0 endpoints
@router.get("/auth/handlecreateurl")
def google_auth_start() -> dict[str, Any]:
    try:
        flow, redirect_uri = create_oauth_flow()
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
        return {"authUrl": auth_url, "state": state, "redirectUri": redirect_uri}
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"OAuth setup failed: {str(e)}"}


@router.get("/auth/google")
def google_auth_callback(code: str, state: str | None = None) -> dict[str, Any]:
    try:
        flow, redirect_uri = create_oauth_flow()
        
        # Suppress scope change warnings - they're usually just reordering
        with warnings.catch_warnings():
            warnings.filterwarnings('ignore', message='Scope has changed.*')
            
            try:
                flow.fetch_token(code=code)
                creds = flow.credentials
                
                return {
                    "status": "success",
                    "access_token": creds.token,
                    "refresh_token": creds.refresh_token,
                    "expiry": creds.expiry.isoformat() if getattr(creds, "expiry", None) else None,
                    "scopes": list(creds.scopes or []),
                    "requested_scopes": SCOPES,
                }
            except Exception as token_error:
                # Log the actual error for debugging
                print(f"Token fetch error: {token_error}")
                
                # Check for specific error types
                error_str = str(token_error).lower()
                if "redirect_uri_mismatch" in error_str:
                    return {
                        "status": "error",
                        "error_type": "redirect_uri_mismatch",
                        "message": "Redirect URI mismatch. Check your Google Cloud Console settings.",
                        "hint": f"Ensure your OAuth client has '{redirect_uri}' as an authorized redirect URI",
                        "current_redirect_uri": redirect_uri
                    }
                elif "invalid_grant" in error_str:
                    return {
                        "status": "error", 
                        "error_type": "invalid_grant",
                        "message": "Authorization code has expired or been used already",
                        "hint": "Please retry the authorization flow"
                    }
                else:
                    return {
                        "status": "error",
                        "error_type": "token_exchange_failed",
                        "message": str(token_error),
                        "redirect_uri": redirect_uri,
                        "scopes": SCOPES,
                    }
                    
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        return {
            "status": "error",
            "error_type": "general_error", 
            "message": str(e)
        }


@router.post("/auth/google/refresh")
def google_refresh_token(refresh_token: str) -> dict[str, Any]:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    
    if not client_id or not client_secret or not refresh_token:
        return {"error": "Missing client_id/client_secret/refresh_token"}
        
    try:
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            client_id=client_id,
            client_secret=client_secret,
            token_uri="https://oauth2.googleapis.com/token",
        )
        
        creds.refresh(GoogleRequest())
        
        return {
            "status": "success",
            "access_token": creds.token,
            "expiry": creds.expiry.isoformat() if creds.expiry else None
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/ingest-gmail")
def ingest_gmail(limit: int = 5) -> dict[str, Any]:
    try:
        gm = GmailService()
        if not gm.is_configured():
            return {"error": "Gmail not configured"}
        ai = OpenAIService()
        conn = tidb.connection()
        inserted = 0
        msgs = gm.get_unread(limit)
        with conn.cursor() as cur:
            for m in msgs:
                mid = m.get("id")
                if not mid:
                    continue
                meta = gm.get_message(mid)
                content = f"{meta.get('subject','')}\n\n{meta.get('snippet','')}"
                vec = ai.embed(content)
                vec_text = "[" + ",".join(str(x) for x in vec) + "]"
                cur.execute(
                    """
                    INSERT IGNORE INTO medical_documents (id, content, embedding, type, source, patient_name, patient_id, metadata)
                    VALUES (%s, %s, VEC_FROM_TEXT(%s), %s, %s, %s, %s, %s)
                    """,
                    (
                        f"gmail_{mid}",
                        content,
                        vec_text,
                        "blood_test",
                        "gmail",
                        None,
                        None,
                        f"{{\"from\":\"{meta.get('from','')}\",\"date\":\"{meta.get('date','')}\"}}",
                    ),
                )
                inserted += 1
        return {"status": "success", "inserted": inserted}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ===== NEW AI AGENT AND REPORT PROCESSING ROUTES =====

@router.post("/process-emails")
def process_recent_emails(days: int = 3) -> dict[str, Any]:
    """Process medical reports from recent emails"""
    try:
        processor = MedicalReportProcessor()
        result = processor.process_recent_emails(days)
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/process-pdf")
def process_pdf_file(pdf_path: str) -> dict[str, Any]:
    """Process a single PDF file"""
    try:
        processor = MedicalReportProcessor()
        pdf_file = Path(pdf_path)
        if not pdf_file.exists():
            return {"status": "error", "message": "PDF file not found"}
        
        result = processor.process_single_pdf(pdf_file)
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/processing-summary")
def get_processing_summary() -> dict[str, Any]:
    """Get summary of processed medical reports"""
    try:
        processor = MedicalReportProcessor()
        summary = processor.get_processing_summary()
        return summary
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/search/similar-cases")
def search_similar_cases(payload: dict[str, Any]) -> dict[str, Any]:
    """Search for similar medical cases using AI embeddings"""
    try:
        query = payload.get("query", "")
        report_type = payload.get("report_type")
        limit = int(payload.get("limit", 10))
        
        if not query:
            return {"status": "error", "message": "Query text is required"}
        
        processor = MedicalReportProcessor()
        results = processor.search_similar_cases(query, report_type, limit)
        
        return {
            "status": "success",
            "query": query,
            "results": results,
            "count": len(results)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/patient-history/{patient_name}")
def get_patient_history(patient_name: str) -> dict[str, Any]:
    """Get complete medical history for a patient"""
    try:
        processor = MedicalReportProcessor()
        history = processor.get_patient_history(patient_name)
        
        return {
            "status": "success",
            "patient_name": patient_name,
            "history": history,
            "total_reports": len(history)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ===== AI AGENT ROUTES =====

@router.post("/ai/patient-chat")
def patient_chat(payload: dict[str, Any]) -> dict[str, Any]:
    """Handle patient chat messages (WhatsApp integration)"""
    try:
        message = payload.get("message", "")
        phone_number = payload.get("phone", "")
        patient_name = payload.get("patient_name")
        
        if not message or not phone_number:
            return {"status": "error", "message": "Message and phone number required"}
        
        ai_agent = OncoAssistAI()
        response = ai_agent.process_patient_message(message, phone_number, patient_name)
        
        return {
            "status": "success",
            "response": response,
            "message_type": "patient_chat"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/ai/doctor-query")
def doctor_query(payload: dict[str, Any]) -> dict[str, Any]:
    """Handle doctor queries with AI assistance"""
    try:
        message = payload.get("message", "")
        doctor_id = payload.get("doctor_id", "unknown")
        context = payload.get("context")
        
        if not message:
            return {"status": "error", "message": "Query message is required"}
        
        ai_agent = OncoAssistAI()
        response = ai_agent.process_doctor_message(message, doctor_id, context)
        
        return {
            "status": "success",
            "response": response,
            "message_type": "doctor_query"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ===== NOTIFICATION ROUTES =====

@router.post("/notifications/send-alert")
def send_patient_alert(payload: dict[str, Any]) -> dict[str, Any]:
    """Send alert notification to patient"""
    try:
        alert_type = payload.get("alert_type", "general")
        message = payload.get("message", "")
        patient_info = payload.get("patient_info", {})
        contact_methods = payload.get("contact_methods", ["email", "whatsapp"])
        
        notification_service = NotificationService()
        
        if alert_type == "cbc_alert":
            cbc_data = payload.get("cbc_data", {})
            results = notification_service.send_cbc_alert(cbc_data, patient_info, contact_methods)
        else:
            # General alert using WhatsApp/SMS only
            phone = patient_info.get("phone", "")
            if not phone:
                return {"status": "error", "message": "Patient phone number required for alerts"}
            
            # Send WhatsApp or SMS based on type
            if payload.get("type") == "whatsapp":
                results = {"whatsapp": notification_service.twilio_service.send_whatsapp(
                    phone, message
                )}
            else:
                results = {"sms": notification_service.twilio_service.send_sms(
                    phone, message
                )}
        
        return {
            "status": "success",
            "alert_type": alert_type,
            "results": results
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/notifications/appointment-reminder")
def send_appointment_reminder(payload: dict[str, Any]) -> dict[str, Any]:
    """Send appointment reminder to patient"""
    try:
        patient_info = payload.get("patient_info", {})
        appointment_date = payload.get("appointment_date", "")
        appointment_type = payload.get("appointment_type", "appointment")
        
        notification_service = NotificationService()
        results = notification_service.send_appointment_reminder(
            patient_info, appointment_date, appointment_type
        )
        
        return {
            "status": "success",
            "results": results
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/notifications/medication-reminder")
def send_medication_reminder(payload: dict[str, Any]) -> dict[str, Any]:
    """Send medication reminder to patient"""
    try:
        patient_info = payload.get("patient_info", {})
        medication_name = payload.get("medication_name", "")
        dosage = payload.get("dosage", "")
        frequency = payload.get("frequency", "")
        
        notification_service = NotificationService()
        results = notification_service.send_medication_reminder(
            patient_info, medication_name, dosage, frequency
        )
        
        return {
            "status": "success",
            "results": results
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ===== EMAIL SERVICE TESTING =====

@router.get("/test-email-service")
def test_email_service() -> dict[str, Any]:
    """Test the OAuth-based email service"""
    try:
        from .email_service import EmailService
        
        email_service = EmailService()
        
        result = {
            "email_service_configured": email_service.is_configured(),
            "gmail_service_configured": email_service.gmail_service.is_configured()
        }
        
        if email_service.is_configured():
            # Test getting recent emails
            emails = email_service.get_recent_emails_metadata(days=7)
            result["recent_medical_emails"] = len(emails)
            result["sample_emails"] = []
            
            for email in emails[:3]:
                result["sample_emails"].append({
                    "subject": email.get("subject", "")[:50] + "...",
                    "from": email.get("from", "")[:30] + "...",
                    "has_attachments": email.get("has_attachments", False)
                })
        
        return {
            "status": "success",
            "results": result
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/test-email-download")
def test_email_download(payload: dict[str, Any]) -> dict[str, Any]:
    """Test downloading medical email attachments"""
    try:
        from .email_service import EmailService
        
        days = payload.get("days", 3)
        email_service = EmailService()
        
        if not email_service.is_configured():
            return {"status": "error", "message": "Email service not configured"}
        
        # Test downloading attachments
        attachments = email_service.download_medical_attachments(days=days)
        
        return {
            "status": "success",
            "days_searched": days,
            "attachments_found": len(attachments),
            "attachment_files": [Path(p).name for p in attachments]
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ===== ENHANCED VECTOR DATABASE ROUTES =====

@router.post("/vector/initialize-enhanced-schema")
def initialize_enhanced_schema() -> dict[str, Any]:
    """Initialize enhanced TiDB schema with vector capabilities"""
    try:
        success = enhanced_schema.initialize_enhanced_schema()
        if success:
            # Also create sample data
            sample_success = enhanced_schema.create_sample_enhanced_data()
            return {
                "status": "success",
                "message": "Enhanced schema initialized successfully",
                "sample_data_created": sample_success
            }
        else:
            return {"status": "error", "message": "Failed to initialize enhanced schema"}
            
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/vector/semantic-search")
def semantic_search(payload: dict[str, Any]) -> dict[str, Any]:
    """Perform semantic search using vector embeddings"""
    try:
        query = payload.get("query", "")
        limit = payload.get("limit", 10)
        patient_filter = payload.get("patient_filter")
        report_type_filter = payload.get("report_type_filter") 
        similarity_threshold = payload.get("similarity_threshold", 0.7)
        
        if not query:
            return {"status": "error", "message": "Query is required"}
        
        results = vector_service.semantic_search(
            query=query,
            limit=limit,
            patient_filter=patient_filter,
            report_type_filter=report_type_filter,
            similarity_threshold=similarity_threshold
        )
        
        return {
            "status": "success",
            "query": query,
            "results": results,
            "count": len(results)
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/vector/patient-timeline/{patient_name}")
def get_patient_timeline(patient_name: str, days_back: int = 365) -> dict[str, Any]:
    """Get chronological medical timeline for a patient"""
    try:
        timeline = vector_service.get_patient_medical_timeline(patient_name, days_back)
        
        return {
            "status": "success",
            "patient_name": patient_name,
            "timeline": timeline,
            "total_documents": len(timeline),
            "days_back": days_back
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/vector/similar-cases/{patient_name}")
def find_similar_cases(patient_name: str, report_type: str = None, limit: int = 5) -> dict[str, Any]:
    """Find similar medical cases to a given patient"""
    try:
        similar_cases = vector_service.find_similar_cases(
            patient_name=patient_name,
            report_type=report_type,
            limit=limit
        )
        
        return {
            "status": "success",
            "patient_name": patient_name,
            "similar_cases": similar_cases,
            "count": len(similar_cases),
            "report_type_filter": report_type
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/vector/store-medical-document")
def store_medical_document_enhanced(payload: dict[str, Any]) -> dict[str, Any]:
    """Store medical document with enhanced vector embedding"""
    try:
        document_id = payload.get("document_id")
        content = payload.get("content") 
        report_type = payload.get("report_type")
        patient_name = payload.get("patient_name")
        patient_id = payload.get("patient_id")
        source = payload.get("source", "api")
        metadata = payload.get("metadata", {})
        
        if not all([document_id, content, report_type]):
            return {"status": "error", "message": "document_id, content, and report_type are required"}
        
        success = vector_service.store_medical_document_with_embedding(
            document_id=document_id,
            content=content,
            report_type=report_type,
            patient_name=patient_name,
            patient_id=patient_id,
            source=source,
            metadata=metadata
        )
        
        if success:
            return {
                "status": "success",
                "message": "Medical document stored with enhanced embedding",
                "document_id": document_id
            }
        else:
            return {"status": "error", "message": "Failed to store medical document"}
            
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/vector/test-embeddings")
def test_vector_embeddings() -> dict[str, Any]:
    """Test vector embedding generation and storage"""
    try:
        # Test embedding generation
        test_content = "Patient has elevated WBC count of 12,000/μL indicating possible infection or stress response. Recommend follow-up in 1 week."
        test_metadata = {
            "report_type": "blood_test",
            "patient_name": "Test Patient",
            "timestamp": "2024-09-15"
        }
        
        embedding = vector_service.generate_medical_embedding(test_content, test_metadata)
        
        # Test storage
        test_doc_id = "test_embedding_001"
        storage_success = vector_service.store_medical_document_with_embedding(
            document_id=test_doc_id,
            content=test_content,
            report_type="blood_test",
            patient_name="Test Patient",
            source="test",
            metadata=test_metadata
        )
        
        # Test search
        search_results = vector_service.semantic_search(
            query="high white blood cell count infection",
            limit=3
        )
        
        return {
            "status": "success",
            "embedding_generated": len(embedding) == 1536,
            "embedding_dimension": len(embedding),
            "storage_success": storage_success,
            "search_results": len(search_results),
            "test_document_id": test_doc_id
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}