"""
Notification Service for OncoAssist
Handles patient alerts, reminders, and notifications via multiple channels
"""

import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging

from .email_service import EmailService
from .services import TwilioService

logger = logging.getLogger(__name__)

class NotificationService:
    """Service for managing patient notifications and alerts"""
    
    def __init__(self):
        self.email_service = EmailService()
        self.twilio_service = TwilioService()
        self.default_patient_email = os.getenv("PATIENT_EMAIL", "")
        
        # Alert thresholds (configurable)
        self.wbc_alert_threshold = int(os.getenv("WBC_ALERT_CUTOFF", "4000"))
        self.anc_alert_threshold = int(os.getenv("ANC_ALERT_CUTOFF", "1000"))
        self.hemoglobin_threshold = float(os.getenv("HEMOGLOBIN_ALERT", "10.0"))
        self.platelet_threshold = int(os.getenv("PLATELET_ALERT", "150000"))
    
    def check_cbc_alerts(self, cbc_data: Dict[str, Any], patient_info: Dict[str, str]) -> List[str]:
        """
        Check CBC data for values that require patient alerts
        
        Args:
            cbc_data: CBC analysis results
            patient_info: Patient information
            
        Returns:
            List of alert messages
        """
        alerts = []
        
        # WBC alert
        wbc = cbc_data.get("wbc")
        if wbc is not None and wbc < self.wbc_alert_threshold:
            alerts.append(
                f"• White blood cell count is {wbc}/µL (below normal range of {self.wbc_alert_threshold})"
            )
        
        # ANC alert
        anc = cbc_data.get("anc")
        if anc is not None and anc < self.anc_alert_threshold:
            alerts.append(
                f"• Absolute neutrophil count is {anc}/µL (below normal range of {self.anc_alert_threshold})"
            )
        
        # Hemoglobin alert
        hemoglobin = cbc_data.get("hemoglobin")
        if hemoglobin is not None and hemoglobin < self.hemoglobin_threshold:
            alerts.append(
                f"• Hemoglobin is {hemoglobin} g/dL (below normal range of {self.hemoglobin_threshold})"
            )
        
        # Platelet alert
        platelets = cbc_data.get("platelets")
        if platelets is not None and platelets < self.platelet_threshold:
            alerts.append(
                f"• Platelet count is {platelets}/µL (below normal range of {self.platelet_threshold})"
            )
        
        return alerts
    
    def send_cbc_alert(
        self, 
        cbc_data: Dict[str, Any], 
        patient_info: Dict[str, str],
        contact_methods: List[str] = None
    ) -> Dict[str, bool]:
        """
        Send CBC alert notifications to patient
        
        Args:
            cbc_data: CBC analysis results
            patient_info: Patient information
            contact_methods: List of methods ['email', 'sms', 'whatsapp']
            
        Returns:
            Dictionary with success status for each method
        """
        if contact_methods is None:
            contact_methods = ['email', 'whatsapp']
        
        alerts = self.check_cbc_alerts(cbc_data, patient_info)
        if not alerts:
            logger.info("No CBC alerts needed")
            return {}
        
        patient_name = patient_info.get("name", "")
        patient_phone = patient_info.get("phone", patient_info.get("contact", ""))
        patient_email = patient_info.get("email", self.default_patient_email)
        
        # Compose alert message
        alert_message = "\\n".join(alerts)
        
        results = {}
        
        # Note: Email sending removed - focusing on WhatsApp/SMS for patient communication
        
        # SMS notification
        if 'sms' in contact_methods and patient_phone:
            sms_message = f"""OncoAssist Alert: Your recent blood test shows some values needing attention. Please contact your oncology team. If you have fever or feel unwell, seek medical care promptly. This is informational only."""
            
            try:
                message_id = self.twilio_service.send_sms(patient_phone, sms_message)
                results['sms'] = bool(message_id)
            except Exception as e:
                logger.error(f"SMS alert failed: {e}")
                results['sms'] = False
        
        # WhatsApp notification
        if 'whatsapp' in contact_methods and patient_phone:
            whatsapp_message = f"""🏥 *OncoAssist Blood Test Alert*

Hello {patient_name or 'there'},

Your recent blood test results show:
{alert_message}

*What to do:*
• Contact your oncology team to discuss
• Watch for fever, chills, or unusual symptoms
• Seek medical care if you feel unwell

This is for information only and doesn't replace medical consultation.

Stay strong! 💪"""
            
            try:
                message_id = self.twilio_service.send_whatsapp(patient_phone, whatsapp_message)
                results['whatsapp'] = bool(message_id)
            except Exception as e:
                logger.error(f"WhatsApp alert failed: {e}")
                results['whatsapp'] = False
        
        # Log alert
        logger.info(f"CBC alert sent to {patient_name or 'patient'}: {len(alerts)} alerts via {contact_methods}")
        
        return results
    
    def send_report_summary(
        self, 
        report_data: Dict[str, Any], 
        patient_info: Dict[str, str],
        attachment_paths: List[str] = None
    ) -> Dict[str, bool]:
        """
        Send comprehensive report summary to patient via WhatsApp/SMS only
        
        Args:
            report_data: Processed report data
            patient_info: Patient information
            attachment_paths: Ignored - no email attachments
            
        Returns:
            Dictionary with success status for each method
        """
        patient_name = patient_info.get("name", "")
        patient_phone = patient_info.get("phone", patient_info.get("contact", ""))
        
        results = {}
        
        # WhatsApp summary only (email sending removed)
        if patient_phone:
            report_type = report_data.get("report_type", "report")
            
            # Get analysis-specific summary
            analysis_result = report_data.get("analysis_result", {})
            patient_summary = analysis_result.get("patient_summary", "Your report has been processed.")
            
            # Truncate summary for WhatsApp
            if len(patient_summary) > 200:
                patient_summary = patient_summary[:200] + "..."
            
            whatsapp_message = f"""🏥 *OncoAssist Report Update*

Hello {patient_name or 'there'}!

Your {report_type} results are ready:

{patient_summary}

📋 *Next steps:*
• Discuss with your oncologist
• Continue your treatment plan
• Contact your care team with questions

Type 'help' for more options. Stay strong! 💪

_Your OncoAssist Team_"""
            
            try:
                message_id = self.twilio_service.send_whatsapp(patient_phone, whatsapp_message)
                results['whatsapp'] = bool(message_id)
                logger.info(f"WhatsApp report summary sent to {patient_phone}")
            except Exception as e:
                logger.error(f"WhatsApp summary failed: {e}")
                results['whatsapp'] = False
        else:
            logger.warning("No patient phone number provided for WhatsApp notification")
        
        return results
    
    def send_appointment_reminder(
        self, 
        patient_info: Dict[str, str], 
        appointment_date: str,
        appointment_type: str = "oncology appointment"
    ) -> Dict[str, bool]:
        """
        Send appointment reminder to patient
        
        Args:
            patient_info: Patient information
            appointment_date: Appointment date string
            appointment_type: Type of appointment
            
        Returns:
            Dictionary with success status for each method
        """
        patient_name = patient_info.get("name", "")
        patient_phone = patient_info.get("phone", patient_info.get("contact", ""))
        patient_email = patient_info.get("email", self.default_patient_email)
        
        results = {}
        
        # Email reminder
        if patient_email:
            email_body = f"""Dear {patient_name or 'Patient'},

This is a friendly reminder about your upcoming {appointment_type} on {appointment_date}.

**Preparation Tips:**
• Bring your current medications list
• Prepare any questions you want to discuss
• Bring your insurance card and ID
• Arrive 15 minutes early for check-in

If you need to reschedule or have questions, please contact your care team as soon as possible.

We look forward to seeing you!

Best regards,
Your OncoAssist Care Team"""
            
            results['email'] = self.email_service.send_patient_email(
                to_addr=patient_email,
                subject=f"Appointment Reminder - {appointment_date}",
                body=email_body
            )
        
        # WhatsApp reminder
        if patient_phone:
            whatsapp_message = f"""🗓️ *Appointment Reminder*

Hi {patient_name or 'there'}!

Don't forget your {appointment_type} on *{appointment_date}*.

📝 *Remember to bring:*
• Current medications list
• Insurance card & ID
• Your questions

Arrive 15 minutes early ⏰

Need to reschedule? Contact your care team.

See you soon! 👩‍⚕️"""
            
            try:
                message_id = self.twilio_service.send_whatsapp(patient_phone, whatsapp_message)
                results['whatsapp'] = bool(message_id)
            except Exception as e:
                logger.error(f"WhatsApp reminder failed: {e}")
                results['whatsapp'] = False
        
        return results
    
    def send_medication_reminder(
        self, 
        patient_info: Dict[str, str], 
        medication_name: str,
        dosage: str = "",
        frequency: str = ""
    ) -> Dict[str, bool]:
        """
        Send medication reminder to patient
        
        Args:
            patient_info: Patient information
            medication_name: Name of medication
            dosage: Medication dosage
            frequency: Dosage frequency
            
        Returns:
            Dictionary with success status for each method
        """
        patient_name = patient_info.get("name", "")
        patient_phone = patient_info.get("phone", patient_info.get("contact", ""))
        
        results = {}
        
        if patient_phone:
            dose_info = f" ({dosage})" if dosage else ""
            freq_info = f" - {frequency}" if frequency else ""
            
            whatsapp_message = f"""💊 *Medication Reminder*

Hi {patient_name or 'there'}!

Time for your medication:
*{medication_name}{dose_info}*{freq_info}

Remember to:
• Take with food if required
• Don't skip doses
• Contact your team with side effects

Stay on track with your treatment! 💪"""
            
            try:
                message_id = self.twilio_service.send_whatsapp(patient_phone, whatsapp_message)
                results['whatsapp'] = bool(message_id)
            except Exception as e:
                logger.error(f"Medication reminder failed: {e}")
                results['whatsapp'] = False
        
        return results
    
    def log_notification(
        self, 
        patient_id: str, 
        notification_type: str, 
        status: str, 
        details: Dict[str, Any] = None
    ):
        """
        Log notification for audit trail
        
        Args:
            patient_id: Patient identifier
            notification_type: Type of notification
            status: Success/failure status
            details: Additional details
        """
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "patient_id": patient_id,
            "notification_type": notification_type,
            "status": status,
            "details": details or {}
        }
        
        logger.info(f"Notification logged: {log_entry}")
        
        # In a production system, this would save to database
        # For now, we just log it
