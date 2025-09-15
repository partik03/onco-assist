"""
AI Agent Service for OncoAssist
Handles intelligent conversations with patients and doctors
"""

import re
from typing import Dict, Any, List, Optional, Tuple
import logging

from .report_processor import MedicalReportProcessor
from .services import OpenAIService
from .vector_service import vector_service
from .db import tidb

logger = logging.getLogger(__name__)

class OncoAssistAI:
    """AI Agent for intelligent medical assistance"""
    
    def __init__(self):
        self.report_processor = MedicalReportProcessor()
        self.openai_service = OpenAIService()
        
        # Conversation context storage (in production, use Redis/database)
        self.conversation_contexts = {}
    
    def process_patient_message(
        self, 
        message: str, 
        phone_number: str,
        patient_name: Optional[str] = None
    ) -> str:
        """
        Process message from patient via WhatsApp
        
        Args:
            message: Patient's message
            phone_number: Patient's phone number
            patient_name: Optional patient name
            
        Returns:
            AI response for patient
        """
        message_lower = message.lower().strip()
        
        # Handle common commands
        if message_lower in ["hi", "hello", "help", "start"]:
            return self._get_welcome_message(patient_name)
        
        elif "blood" in message_lower or "cbc" in message_lower:
            return self._handle_blood_test_query(phone_number, patient_name)
        
        elif "scan" in message_lower or "pet" in message_lower or "ct" in message_lower:
            return self._handle_scan_query(phone_number, patient_name)
        
        elif "medicine" in message_lower or "medication" in message_lower:
            return self._handle_medication_query(phone_number, patient_name)
        
        elif "report" in message_lower or "result" in message_lower:
            return self._handle_report_query(phone_number, patient_name)
        
        elif "appointment" in message_lower:
            return self._handle_appointment_query(phone_number, patient_name)
        
        elif "emergency" in message_lower or "urgent" in message_lower:
            return self._handle_emergency_query()
        
        else:
            # Use AI for more complex queries
            return self._handle_ai_query(message, phone_number, patient_name)
    
    def process_doctor_message(
        self, 
        message: str, 
        doctor_id: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process message from doctor via UI
        
        Args:
            message: Doctor's query
            doctor_id: Doctor identifier
            context: Optional conversation context
            
        Returns:
            Structured response with data and AI insights
        """
        message_lower = message.lower().strip()
        
        # Handle specific medical queries
        if any(term in message_lower for term in ["similar case", "similar patient", "find case"]):
            return self._handle_similar_case_query(message, doctor_id)
        
        elif "patient history" in message_lower or "patient records" in message_lower:
            return self._handle_patient_history_query(message, doctor_id)
        
        elif "cbc" in message_lower and "trend" in message_lower:
            return self._handle_cbc_trend_query(message, doctor_id)
        
        elif "staging" in message_lower or "tnm" in message_lower:
            return self._handle_staging_query(message, doctor_id)
        
        else:
            # General AI-powered medical consultation
            return self._handle_doctor_ai_query(message, doctor_id, context)
    
    def _get_welcome_message(self, patient_name: Optional[str] = None) -> str:
        """Get welcome message for patient"""
        name_part = f"Hello {patient_name}! " if patient_name else "Hello! "
        
        return f"""{name_part}🏥 Welcome to OncoAssist!

I can help you with:
📋 *blood* - Latest blood test results
🔬 *scan* - Recent scan results  
💊 *medicine* - Medication information
📄 *reports* - View your reports
📅 *appointment* - Appointment help
🚨 *emergency* - Emergency guidance

Just type what you need help with!"""
    
    def _handle_blood_test_query(self, phone_number: str, patient_name: Optional[str] = None) -> str:
        """Handle blood test related queries"""
        try:
            # Find recent CBC reports for this patient
            recent_reports = self._get_recent_patient_reports(phone_number, "cbc", limit=1)
            
            if not recent_reports:
                return """🩸 *Blood Test Results*

I don't see any recent blood test results for you. 

If you've had a blood test recently:
• Results may still be processing
• Check with your care team
• Contact the lab directly

Need help? Type *help* for options."""
            
            latest_report = recent_reports[0]
            metadata = latest_report.get("metadata", {})
            analysis = metadata.get("analysis_result", {})
            
            if not analysis:
                return """🩸 *Blood Test Results*

Your latest blood test has been received, but detailed analysis is still being processed.

Please contact your care team for immediate results, or check back later."""
            
            # Format blood test results
            response = "🩸 *Latest Blood Test Results*\n\n"
            
            if analysis.get("wbc"):
                response += f"🔹 WBC: {analysis['wbc']}/µL\n"
            if analysis.get("hemoglobin"):
                response += f"🔹 Hemoglobin: {analysis['hemoglobin']} g/dL\n"
            if analysis.get("platelets"):
                response += f"🔹 Platelets: {analysis['platelets']}/µL\n"
            if analysis.get("anc"):
                response += f"🔹 ANC: {analysis['anc']}/µL\n"
            
            # Add alerts if any
            if analysis.get("flags"):
                response += "\n⚠️ *Important Notes:*\n"
                for flag in analysis["flags"]:
                    response += f"• {flag}\n"
                response += "\n📞 Please contact your care team to discuss these results."
            else:
                response += "\n✅ Values appear within normal ranges."
            
            response += f"\n📅 Test date: {latest_report.get('timestamp', 'Recent')}"
            
            return response
            
        except Exception as e:
            logger.error(f"Blood test query failed: {e}")
            return "🩸 I'm having trouble accessing your blood test results right now. Please contact your care team directly."
    
    def _handle_scan_query(self, phone_number: str, patient_name: Optional[str] = None) -> str:
        """Handle scan/imaging related queries"""
        try:
            recent_reports = self._get_recent_patient_reports(phone_number, "pet_ct", limit=1)
            
            if not recent_reports:
                return """🔬 *Scan Results*

I don't see any recent scan results for you.

If you've had a scan recently:
• Results may still be processing
• Check with your radiologist
• Contact your care team

Type *reports* to see all available results."""
            
            latest_report = recent_reports[0]
            metadata = latest_report.get("metadata", {})
            analysis = metadata.get("analysis_result", {})
            
            response = "🔬 *Latest Scan Results*\n\n"
            
            if analysis.get("patient_summary"):
                response += f"{analysis['patient_summary']}\n\n"
            
            # Add staging information if available
            if analysis.get("tnm_staging"):
                tnm = analysis["tnm_staging"]
                if tnm.get("stage_group"):
                    response += f"📊 *Stage:* {tnm['stage_group']}\n"
            
            response += "📞 Please discuss these results with your oncologist for detailed explanation and next steps."
            response += f"\n\n📅 Scan date: {latest_report.get('timestamp', 'Recent')}"
            
            return response
            
        except Exception as e:
            logger.error(f"Scan query failed: {e}")
            return "🔬 I'm having trouble accessing your scan results right now. Please contact your care team."
    
    def _handle_medication_query(self, phone_number: str, patient_name: Optional[str] = None) -> str:
        """Handle medication related queries"""
        try:
            # Get patient's medication from database
            conn = tidb.connection()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT drug_name, dosage, frequency 
                    FROM medicines m
                    JOIN patients p ON m.patient_id = p.id
                    WHERE p.contact_info LIKE %s
                    ORDER BY m.created_at DESC
                    """,
                    (f"%{phone_number}%",)
                )
                medications = cur.fetchall()
            
            if not medications:
                return """💊 *Your Medications*

I don't see any medications in your current profile.

To get help with medications:
• Contact your care team
• Check your prescription bottles
• Ask your pharmacist

Type *help* for other options."""
            
            response = "💊 *Your Current Medications*\n\n"
            
            for med in medications:
                response += f"🔹 *{med['drug_name']}*\n"
                if med.get('dosage'):
                    response += f"   Dosage: {med['dosage']}\n"
                if med.get('frequency'):
                    response += f"   Frequency: {med['frequency']}\n"
                response += "\n"
            
            response += """📝 *Important Reminders:*
• Take medications as prescribed
• Don't skip doses
• Report side effects to your team
• Ask before stopping any medication

💡 Set phone reminders to help remember doses!"""
            
            return response
            
        except Exception as e:
            logger.error(f"Medication query failed: {e}")
            return "💊 I'm having trouble accessing your medication information. Please contact your care team."
    
    def _handle_report_query(self, phone_number: str, patient_name: Optional[str] = None) -> str:
        """Handle general report queries"""
        try:
            recent_reports = self._get_recent_patient_reports(phone_number, limit=5)
            
            if not recent_reports:
                return """📄 *Your Reports*

No reports found in our system yet.

If you're expecting results:
• Reports may still be processing
• Check with your care team
• Contact the lab/imaging center

Type *help* for other options."""
            
            response = "📄 *Your Recent Reports*\n\n"
            
            for i, report in enumerate(recent_reports, 1):
                report_type = report.get("report_type", "Unknown").upper()
                timestamp = report.get("timestamp", "Recent")
                
                # Format timestamp
                if "T" in str(timestamp):
                    try:
                        from datetime import datetime
                        dt = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
                        timestamp = dt.strftime("%Y-%m-%d")
                    except:
                        pass
                
                response += f"{i}. *{report_type}* - {timestamp}\n"
            
            response += """\n📋 *Available Commands:*
• Type *blood* for blood test details
• Type *scan* for imaging results  
• Type *medicine* for medications

📞 Contact your care team for detailed discussions."""
            
            return response
            
        except Exception as e:
            logger.error(f"Report query failed: {e}")
            return "📄 I'm having trouble accessing your reports. Please contact your care team."
    
    def _handle_appointment_query(self, phone_number: str, patient_name: Optional[str] = None) -> str:
        """Handle appointment related queries"""
        return """📅 *Appointment Help*

I can't access your appointment schedule directly, but here's how to get help:

🏥 *For Appointments:*
• Call your oncology clinic directly
• Use your hospital's patient portal
• Contact your care coordinator

⏰ *Before Your Visit:*
• Prepare your questions
• Bring current medications list
• Arrive 15 minutes early
• Bring insurance card & ID

💡 *Pro Tip:* Write down questions beforehand so you don't forget during your appointment!

Type *help* for other options."""
    
    def _handle_emergency_query(self) -> str:
        """Handle emergency situations"""
        return """🚨 *EMERGENCY GUIDANCE*

If this is a medical emergency:
📞 **CALL 911 IMMEDIATELY**

⚠️ *Seek immediate care for:*
• Difficulty breathing
• Chest pain
• High fever (>101°F/38.3°C)
• Severe nausea/vomiting
• Signs of infection
• Severe pain
• Unusual bleeding

🏥 *For urgent but non-emergency issues:*
• Call your oncology team's emergency line
• Go to urgent care
• Contact your hospital's nurse line

🆘 *Cancer-specific emergencies:*
• Neutropenia with fever
• Severe chemotherapy reactions
• Tumor lysis syndrome symptoms

**When in doubt, always seek immediate medical attention.**"""
    
    def _handle_ai_query(self, message: str, phone_number: str, patient_name: Optional[str] = None) -> str:
        """Handle complex queries with AI assistance"""
        try:
            # Get patient context
            patient_context = self._get_patient_context(phone_number)
            
            # Create system prompt for patient interaction
            system_prompt = f"""You are OncoAssist, a compassionate AI assistant helping cancer patients. 

Guidelines:
- Be warm, supportive, and hopeful
- Use simple, non-medical language
- Always encourage patients to consult their care team
- Never provide specific medical advice or diagnoses
- Focus on emotional support and general information
- Use emojis appropriately for warmth

Patient context: {patient_context}

Respond to the patient's message with care and empathy."""
            
            if self.openai_service.is_configured():
                response = self.openai_service.generate_response(
                    system_prompt, 
                    message,
                    max_tokens=300
                )
                
                # Add standard disclaimer
                response += "\n\n📞 Always consult your care team for medical decisions."
                return response
            else:
                return """I understand you have a question, but I'm not able to provide a detailed response right now.

Please contact your care team for assistance, or try one of these commands:
• *blood* - Blood test results
• *scan* - Scan results  
• *medicine* - Medications
• *help* - See all options"""
                
        except Exception as e:
            logger.error(f"AI query failed: {e}")
            return "I'm having some technical difficulties. Please contact your care team for assistance."
    
    def _handle_similar_case_query(self, message: str, doctor_id: str) -> Dict[str, Any]:
        """Handle doctor's request for similar cases"""
        try:
            # Extract search terms from doctor's message
            search_terms = self._extract_medical_terms(message)
            
            # Search for similar cases
            similar_cases = self.report_processor.search_similar_cases(
                query_text=" ".join(search_terms),
                limit=10
            )
            
            # Analyze patterns in similar cases
            analysis = self._analyze_case_patterns(similar_cases)
            
            return {
                "type": "similar_cases",
                "query": message,
                "search_terms": search_terms,
                "cases": similar_cases,
                "pattern_analysis": analysis,
                "total_found": len(similar_cases)
            }
            
        except Exception as e:
            logger.error(f"Similar case query failed: {e}")
            return {
                "type": "error",
                "message": f"Failed to search similar cases: {str(e)}"
            }
    
    def _handle_patient_history_query(self, message: str, doctor_id: str) -> Dict[str, Any]:
        """Handle doctor's request for patient history"""
        try:
            # Extract patient name from message
            patient_name = self._extract_patient_name(message)
            
            if not patient_name:
                return {
                    "type": "clarification_needed",
                    "message": "Please specify the patient name for history lookup."
                }
            
            # Get patient history
            history = self.report_processor.get_patient_history(patient_name)
            
            # Create timeline analysis
            timeline = self._create_patient_timeline(history)
            
            return {
                "type": "patient_history",
                "patient_name": patient_name,
                "history": history,
                "timeline": timeline,
                "total_reports": len(history)
            }
            
        except Exception as e:
            logger.error(f"Patient history query failed: {e}")
            return {
                "type": "error",
                "message": f"Failed to retrieve patient history: {str(e)}"
            }
    
    def _handle_doctor_ai_query(self, message: str, doctor_id: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Handle general AI-powered doctor queries"""
        try:
            # Create system prompt for doctor interaction
            system_prompt = """You are OncoAssist, an AI assistant for oncologists. 

You have access to a database of medical reports and can provide:
- Analysis of patient data patterns
- Literature-based insights
- Clinical decision support
- Case comparisons

Guidelines:
- Provide evidence-based information
- Suggest further investigation when appropriate
- Highlight important clinical considerations
- Reference relevant medical guidelines when applicable
- Always recommend MDT discussion for complex cases"""
            
            if self.openai_service.is_configured():
                ai_response = self.openai_service.generate_response(
                    system_prompt,
                    message,
                    max_tokens=500
                )
                
                return {
                    "type": "ai_response",
                    "response": ai_response,
                    "context": context,
                    "suggestions": self._generate_clinical_suggestions(message)
                }
            else:
                return {
                    "type": "service_unavailable",
                    "message": "AI service is not currently available. Please use manual search functions."
                }
                
        except Exception as e:
            logger.error(f"Doctor AI query failed: {e}")
            return {
                "type": "error",
                "message": f"AI query failed: {str(e)}"
            }
    
    def _get_recent_patient_reports(self, phone_number: str, report_type: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        """Get recent reports for a patient by phone number"""
        try:
            conn = tidb.connection()
            with conn.cursor() as cur:
                sql = """
                    SELECT d.*, p.name as patient_name, p.contact_info
                    FROM medical_documents d
                    LEFT JOIN patients p ON d.patient_name = p.name
                    WHERE (p.contact_info LIKE %s OR d.metadata LIKE %s)
                """
                params = [f"%{phone_number}%", f"%{phone_number}%"]
                
                if report_type:
                    sql += " AND d.type = %s"
                    params.append(report_type)
                
                sql += f" ORDER BY d.timestamp DESC LIMIT {int(limit)}"
                
                cur.execute(sql, params)
                return cur.fetchall()
        except Exception as e:
            logger.error(f"Failed to get patient reports: {e}")
            return []
    
    def _get_patient_context(self, phone_number: str, patient_name: str = None) -> str:
        """Get enhanced patient context using vector search and medical timeline"""
        try:
            context_parts = []
            
            # If we have a patient name, get comprehensive context
            if patient_name:
                # Get AI medical context using vector service
                ai_context = vector_service.get_ai_medical_context(
                    patient_name=patient_name,
                    days_back=90
                )
                
                if ai_context.get("patient_summary"):
                    summary = ai_context["patient_summary"]
                    context_parts.append(f"Patient {patient_name} has {summary.get('total_reports', 0)} medical reports")
                    
                    if summary.get("latest_report"):
                        latest = summary["latest_report"]
                        context_parts.append(f"Latest: {latest['type']} from {latest['timestamp'][:10]}")
                    
                    if summary.get("report_types"):
                        types = list(summary["report_types"].keys())
                        context_parts.append(f"Report types: {', '.join(types)}")
                
                # Get recent medical timeline
                timeline = vector_service.get_patient_medical_timeline(patient_name, days_back=30)
                if timeline:
                    context_parts.append(f"Recent activity: {len(timeline)} documents in 30 days")
                    
                    # Add key findings from recent reports
                    for doc in timeline[:2]:  # Latest 2 reports
                        content_preview = doc['content'][:80] + "..." if len(doc['content']) > 80 else doc['content']
                        context_parts.append(f"- {doc['type']}: {content_preview}")
            
            else:
                # Fallback: try to find patient by recent activity
                recent_reports = self._get_recent_patient_reports(phone_number, limit=3)
                
                if recent_reports:
                    context_parts.append("Recent reports found:")
                    for report in recent_reports:
                        report_type = report.get("type", "unknown")
                        timestamp = report.get("timestamp", "")
                        context_parts.append(f"- {report_type} from {timestamp}")
                else:
                    return "New patient with no reports in system."
            
            return " | ".join(context_parts) if context_parts else "Limited patient context available."
                
        except Exception as e:
            logger.error(f"Error getting enhanced patient context: {e}")
            return "Unable to retrieve patient context"
    
    def _extract_medical_terms(self, text: str) -> List[str]:
        """Extract medical terms from doctor's query"""
        medical_terms = []
        
        # Common medical patterns
        patterns = [
            r"\b(?:ER|PR|HER2)\b",
            r"\b(?:Grade|Stage)\s+\w+",
            r"\b(?:cT\d|cN\d|cM\d)\b",
            r"\b(?:WBC|CBC|ANC|Hemoglobin|Platelets)\b",
            r"\b(?:PET/CT|Biopsy|Histopathology)\b",
            r"\b\d+\s*(?:cm|years?\s+old)\b"
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            medical_terms.extend(matches)
        
        return medical_terms
    
    def _extract_patient_name(self, text: str) -> Optional[str]:
        """Extract patient name from doctor's query"""
        # Look for patterns like "patient John Doe" or "John Doe's history"
        patterns = [
            r"patient\s+([A-Z][a-z]+\s+[A-Z][a-z]+)",
            r"([A-Z][a-z]+\s+[A-Z][a-z]+)'s?\s+history",
            r"for\s+([A-Z][a-z]+\s+[A-Z][a-z]+)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        
        return None
    
    def _analyze_case_patterns(self, cases: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze patterns in similar cases"""
        if not cases:
            return {}
        
        # Count report types
        type_counts = {}
        for case in cases:
            report_type = case.get("report_type", "unknown")
            type_counts[report_type] = type_counts.get(report_type, 0) + 1
        
        # Calculate average similarity
        similarities = [case.get("similarity", 0) for case in cases]
        avg_similarity = sum(similarities) / len(similarities) if similarities else 0
        
        return {
            "total_cases": len(cases),
            "report_types": type_counts,
            "average_similarity": round(avg_similarity, 3),
            "top_similarity": max(similarities) if similarities else 0
        }
    
    def _create_patient_timeline(self, history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create timeline from patient history"""
        timeline = []
        
        for report in history:
            timeline.append({
                "date": report.get("timestamp", ""),
                "type": report.get("report_type", ""),
                "summary": report.get("content", "")[:100] + "..." if report.get("content") else ""
            })
        
        return timeline
    
    def _generate_clinical_suggestions(self, query: str) -> List[str]:
        """Generate clinical suggestions based on query"""
        suggestions = []
        
        query_lower = query.lower()
        
        if "staging" in query_lower:
            suggestions.append("Consider MDT review for staging confirmation")
            suggestions.append("Verify with pathology report")
        
        if "cbc" in query_lower or "blood" in query_lower:
            suggestions.append("Monitor trends over time")
            suggestions.append("Check for chemotherapy-related cytopenias")
        
        if "similar" in query_lower:
            suggestions.append("Review treatment protocols for similar cases")
            suggestions.append("Consider genetic testing if familial pattern")
        
        return suggestions
