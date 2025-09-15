"""
Email Service for OncoAssist
Handles IMAP email retrieval and SMTP email sending for medical reports
"""

import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class EmailService:
    """Service for handling email operations"""
    
    def __init__(self):
        # Use existing Gmail service for reading emails only
        from .services import GmailService
        self.gmail_service = GmailService()
        
        # Strict medical keywords for email filtering - only actual medical terms
        self.medical_keywords = [
            # Blood tests
            "CBC", "Complete Blood Count", "Blood Test", "Hemoglobin", "WBC", "Platelet",
            "Laboratory Report", "Lab Report", "Pathology Report",
            
            # Imaging
            "PET/CT", "PET scan", "CT Scan", "MRI", "Mammography", "Ultrasound", 
            "X-ray", "Radiology Report", "Imaging Report",
            
            # Cancer-specific terms
            "Oncology", "Cancer", "Tumor", "Malignant", "Benign", "Metastasis",
            "Chemotherapy", "Radiation", "Immunotherapy",
            
            # Biopsy and pathology
            "Biopsy", "Histopathology", "HPE", "IHC", "Immunohistochemistry",
            "ER", "PR", "HER2", "Ki-67", "Ki67", "FISH", "ISH", "Nottingham", 
            "Grade", "Invasive ductal carcinoma", "IDC", "Lobular carcinoma", "DCIS",
            
            # Medical facilities
            "Hospital", "Clinic", "Medical Center", "Doctor", "Physician"
        ]
    
    def is_configured(self) -> bool:
        """Check if email service is properly configured"""
        return self.gmail_service.is_configured()
    
    def download_medical_attachments(
        self, 
        days: int = 3, 
        save_to: Path = None, 
        mailbox: str = "INBOX"
    ) -> List[str]:
        """
        Download medical report attachments from Gmail using OAuth
        
        Args:
            days: Number of days to search back
            save_to: Directory to save attachments
            mailbox: Email mailbox to search
            
        Returns:
            List of saved file paths
        """
        if not self.is_configured():
            logger.warning("Gmail service not configured")
            return []
        
        if save_to is None:
            save_to = Path("./data/tmp")
        save_to.mkdir(parents=True, exist_ok=True)
        
        # Use Gmail service to get recent emails
        try:
            logger.info(f"Getting emails from last {days} days...")
            messages = self.gmail_service.get_unread(max_results=50)  # Get more emails to filter
            
            if not messages:
                logger.info("No unread messages found")
                return []
            
            # Compile keyword regex for filtering
            keyword_pattern = re.compile(
                "|".join([re.escape(k) for k in self.medical_keywords]), 
                re.IGNORECASE
            )
            
            saved_paths: List[str] = []
            
            for msg in messages:
                msg_id = msg.get('id')
                if not msg_id:
                    continue
                
                # Get detailed message
                msg_details = self.gmail_service.get_message(msg_id)
                subject = msg_details.get('subject', '')
                snippet = msg_details.get('snippet', '')
                
                # More strict medical filtering - must contain actual medical terms
                medical_content = f"{subject} {snippet}".lower()
                
                # Check for actual medical terms (not just containing words like "insurance")
                medical_indicators = [
                    "blood test", "lab report", "test results", "pathology", "biopsy",
                    "hospital", "clinic", "doctor", "physician", "oncologist", 
                    "cancer", "tumor", "scan", "ct scan", "mri", "x-ray",
                    "hemoglobin", "wbc", "cbc", "medical", "health", "patient"
                ]
                
                has_medical_content = any(
                    indicator in medical_content for indicator in medical_indicators
                )
                
                if not has_medical_content:
                    continue
                
                logger.info(f"Processing medical email: {subject}")
                
                # Get attachments using Gmail service
                attachments = self.gmail_service.get_attachments(msg_id)
                
                for attachment in attachments:
                    filename = attachment.get('filename', 'attachment')
                    data = attachment.get('data')
                    
                    if not data:
                        continue
                    
                    # Handle duplicate filenames
                    target = save_to / filename
                    base = target.with_suffix("")
                    ext = target.suffix
                    i = 1
                    while target.exists():
                        target = Path(f"{base} ({i}){ext}")
                        i += 1
                    
                    # Save attachment
                    try:
                        with open(target, "wb") as f:
                            f.write(data)
                        saved_paths.append(str(target.resolve()))
                        logger.info(f"Saved attachment: {target.name}")
                    except Exception as e:
                        logger.error(f"Error saving attachment {filename}: {e}")
            
            return saved_paths
            
        except Exception as e:
            logger.error(f"Error downloading attachments: {e}")
            return []
    
# Email sending removed - using WhatsApp/SMS for patient communication

    def get_recent_emails_metadata(self, days: int = 7) -> List[Dict[str, Any]]:
        """
        Get metadata of recent emails without downloading attachments
        
        Args:
            days: Number of days to search back
            
        Returns:
            List of email metadata dictionaries
        """
        if not self.is_configured():
            return []
        
        try:
            # Get recent messages using Gmail service
            messages = self.gmail_service.get_unread(max_results=20)
            
            keyword_pattern = re.compile(
                "|".join([re.escape(k) for k in self.medical_keywords]), 
                re.IGNORECASE
            )
            
            emails = []
            
            for msg in messages:
                msg_id = msg.get('id')
                if not msg_id:
                    continue
                
                # Get message details
                msg_details = self.gmail_service.get_message(msg_id)
                subject = msg_details.get('subject', '')
                
                # Check if medical-related with strict filtering
                medical_content = subject.lower()
                medical_indicators = [
                    "blood test", "lab report", "test results", "pathology", "biopsy",
                    "hospital", "clinic", "doctor", "physician", "oncologist", 
                    "cancer", "tumor", "scan", "ct scan", "mri", "x-ray",
                    "hemoglobin", "wbc", "cbc", "medical", "health", "patient"
                ]
                
                has_medical_content = any(
                    indicator in medical_content for indicator in medical_indicators
                )
                
                if has_medical_content:
                    emails.append({
                        "id": msg_id,
                        "subject": subject,
                        "from": msg_details.get('from', ''),
                        "date": msg_details.get('date', ''),
                        "has_attachments": bool(msg_details.get('attachments'))
                    })
            
            return emails
        
        except Exception as e:
            logger.error(f"Error getting email metadata: {e}")
            return []

