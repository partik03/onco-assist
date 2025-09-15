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
import tempfile

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
    
    def _check_pdf_content_for_medical_terms(self, pdf_data: bytes) -> bool:
        """
        Check if PDF content contains medical terms
        
        Args:
            pdf_data: PDF file data as bytes
            
        Returns:
            True if PDF contains medical content, False otherwise
        """
        try:
            # Import PyMuPDF for PDF processing
            try:
                import fitz  # PyMuPDF
            except ImportError:
                logger.warning("PyMuPDF not available, cannot check PDF content")
                return True  # Assume it's medical if we can't check
            
            # Create temporary file to process PDF
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                temp_file.write(pdf_data)
                temp_file.flush()
                
                try:
                    # Extract text from PDF
                    doc = fitz.open(temp_file.name)
                    pdf_text = ""
                    
                    # Extract text from all pages (limit to first 3 pages for performance)
                    for page_num in range(min(3, len(doc))):
                        page = doc[page_num]
                        pdf_text += page.get_text()
                    
                    doc.close()
                    
                    # Check if extracted text contains medical terms
                    if pdf_text:
                        pdf_text_lower = pdf_text.lower()
                        
                        # Enhanced medical indicators specifically for PDF content
                        # More specific terms to avoid false positives from food/supplement invoices
                        medical_indicators = [
                            # Blood test terms (specific lab values)
                            "hemoglobin", "hgb", "wbc", "white blood cell", "rbc", "red blood cell",
                            "platelets", "platelet count", "hematocrit", "mcv", "mch", "mchc",
                            "neutrophils", "lymphocytes", "monocytes", "eosinophils", "basophils", 
                            "anc", "absolute neutrophil count", "complete blood count", "cbc",
                            
                            # Chemistry terms (specific medical lab tests)
                            "creatinine", "bun", "blood urea nitrogen", "alkaline phosphatase", "bilirubin",
                            "alt", "ast", "sgpt", "sgot", "gamma gt", "ldh", "troponin", "cpk",
                            "hba1c", "tsh", "t3", "t4", "vitamin d", "b12", "folate",
                            
                            # Cancer/tumor markers
                            "cea", "ca 125", "ca 15-3", "ca 19-9", "psa", "afp", "tumor marker",
                            "beta hcg", "ldh", "ca 72-4", "ca 50", "cyfra 21-1",
                            
                            # Cancer terms
                            "carcinoma", "adenocarcinoma", "sarcoma", "lymphoma", "leukemia",
                            "malignant", "benign", "tumor", "mass", "lesion", "neoplasm",
                            "metastasis", "metastases", "staging", "grade", "cancer",
                            "oncology", "chemotherapy", "radiotherapy",
                            
                            # Imaging terms
                            "ct scan", "mri", "pet scan", "pet/ct", "x-ray", "ultrasound",
                            "mammography", "fdg", "suvmax", "contrast enhancement",
                            "radiologist", "radiology report", "imaging study",
                            
                            # Pathology terms
                            "biopsy", "histopathology", "cytology", "pathology report", "specimen",
                            "er positive", "er negative", "pr positive", "pr negative",
                            "her2", "her-2", "ki67", "ki-67", "ihc", "immunohistochemistry",
                            "gleason score", "nottingham grade", "bloom richardson",
                            
                            # Medical facilities/personnel (more specific)
                            "hospital", "clinic", "medical center", "laboratory report", "lab report",
                            "dr.", "doctor", "physician", "oncologist", "pathologist", "radiologist",
                            
                            # Medical procedures/tests
                            "ecg", "ekg", "echocardiogram", "stress test", "colonoscopy",
                            "endoscopy", "bronchoscopy", "biopsy", "fine needle aspiration",
                            
                            # Specific medical document indicators
                            "patient id", "medical record", "test results", "lab results", 
                            "diagnosis", "clinical impression", "medical recommendation",
                            "kidney function", "liver function", "cardiac function",
                            "ref. doctor", "reference range", "normal range", "abnormal",
                            
                            # Medical units and measurements
                            "mg/dl", "mmol/l", "iu/ml", "ng/ml", "pg/ml", "units/ml",
                            "µg/ml", "cells/µl", "/cumm", "reference interval",
                            
                            # Exclude common food/supplement terms that might cause false positives
                            # We'll add negative patterns later if needed
                        ]
                        
                        # Add exclusion patterns for common non-medical terms
                        exclusion_patterns = [
                            "tax invoice", "gst", "fssai", "restaurant", "food delivery",
                            "nutrabay", "supplement store", "protein chef", "order no",
                            "invoice no", "delivery address", "customer name", "payment mode"
                        ]
                        
                        # Check for exclusion patterns first
                        for exclusion in exclusion_patterns:
                            if exclusion in pdf_text_lower:
                                logger.info(f"Found exclusion pattern '{exclusion}' in PDF - likely non-medical")
                                return False
                        
                        # Check for medical terms
                        medical_terms_found = []
                        for indicator in medical_indicators:
                            if indicator in pdf_text_lower:
                                medical_terms_found.append(indicator)
                        
                        # Log what we found for debugging
                        if medical_terms_found:
                            logger.info(f"Found medical terms in PDF: {medical_terms_found[:5]}...")  # Log first 5
                            return True
                        else:
                            logger.info("No medical terms found in PDF content")
                            return False
                    else:
                        logger.warning("Could not extract text from PDF")
                        return True  # Assume medical if we can't extract text
                        
                finally:
                    # Clean up temporary file
                    try:
                        os.unlink(temp_file.name)
                    except:
                        pass
                        
        except Exception as e:
            logger.error(f"Error checking PDF content: {e}")
            return True  # Assume medical if we encounter an error
    
    def _is_pdf_attachment(self, filename: str) -> bool:
        """Check if filename indicates a PDF attachment"""
        return filename.lower().endswith('.pdf')
    
    def _is_medical_attachment(self, filename: str, attachment_data: bytes) -> bool:
        """
        Check if attachment is medical-related based on filename and content
        
        Args:
            filename: Name of the attachment
            attachment_data: Binary data of the attachment
            
        Returns:
            True if attachment is medical-related
        """
        # Check filename for medical indicators
        filename_lower = filename.lower()
        medical_filename_indicators = [
            "lab", "blood", "test", "report", "result", "medical", "hospital",
            "clinic", "doctor", "biopsy", "pathology", "radiology", "scan",
            "cbc", "chemistry", "imaging", "xray", "ct", "mri", "pet"
        ]
        
        filename_has_medical_terms = any(
            indicator in filename_lower for indicator in medical_filename_indicators
        )
        
        # If it's a PDF, check its content regardless of filename
        if self._is_pdf_attachment(filename):
            pdf_has_medical_content = self._check_pdf_content_for_medical_terms(attachment_data)
            logger.info(f"PDF {filename}: filename_medical={filename_has_medical_terms}, content_medical={pdf_has_medical_content}")
            return pdf_has_medical_content
        
        # For non-PDF files, rely on filename
        return filename_has_medical_terms
    
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
        
        # Use Gmail service to get recent emails with attachments
        try:
            logger.info(f"Getting emails with attachments from last {days} days...")
            messages = self.gmail_service.get_recent_with_attachments(days=days, max_results=50)
            
            if not messages:
                logger.info("No emails with attachments found")
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
                has_attachments = msg_details.get('attachments', False)
                
                logger.info(f"Processing email: '{subject}' (attachments: {has_attachments})")
                
                # Skip emails without attachments early
                if not has_attachments:
                    logger.debug(f"Skipping email without attachments: {subject}")
                    continue
                
                # Get attachments - we'll check them for medical content
                logger.info(f"Getting attachments for email: {subject}")
                attachments = self.gmail_service.get_attachments(msg_id)
                
                if not attachments:
                    logger.warning(f"Email claims to have attachments but none found: {subject}")
                    continue
                
                logger.info(f"Found {len(attachments)} attachments in email: {subject}")
                
                # Check if email text has medical content
                email_has_medical_content = False
                medical_content = f"{subject} {snippet}".lower()
                email_medical_indicators = [
                    "blood test", "lab report", "test results", "pathology", "biopsy",
                    "hospital", "clinic", "doctor", "physician", "oncologist", 
                    "cancer", "tumor", "scan", "ct scan", "mri", "x-ray",
                    "hemoglobin", "wbc", "cbc", "medical", "health", "patient"
                ]
                
                email_has_medical_content = any(
                    indicator in medical_content for indicator in email_medical_indicators
                )
                
                # Check each attachment for medical content (especially PDFs)
                medical_attachments = []
                for i, attachment in enumerate(attachments):
                    filename = attachment.get('filename', f'attachment_{i}')
                    data = attachment.get('data')
                    
                    logger.info(f"Checking attachment {i+1}: {filename} ({len(data) if data else 0} bytes)")
                    
                    if not data:
                        logger.warning(f"No data for attachment: {filename}")
                        continue
                    
                    # Check if this attachment is medical-related
                    logger.info(f"Analyzing medical content of: {filename}")
                    if self._is_medical_attachment(filename, data):
                        medical_attachments.append(attachment)
                        logger.info(f"✓ Found medical attachment: {filename}")
                    else:
                        logger.info(f"✗ Non-medical attachment: {filename}")
                
                # Only process if email has medical content OR has medical attachments
                if not email_has_medical_content and not medical_attachments:
                    logger.info(f"Skipping non-medical email: {subject} (no medical text or attachments)")
                    continue
                
                logger.info(f"Processing medical email: {subject} (text_medical: {email_has_medical_content}, medical_attachments: {len(medical_attachments)})")
                
                # Save medical attachments
                for attachment in medical_attachments:
                    filename = attachment.get('filename', 'attachment')
                    data = attachment.get('data')
                    
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
                        logger.info(f"✓ Saved medical attachment: {target.name}")
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
                        "has_attachments": msg_details.get('attachments', False)
                    })
            
            return emails
        
        except Exception as e:
            logger.error(f"Error getting email metadata: {e}")
            return []

